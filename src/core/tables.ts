/**
 * M16 — table object.
 *
 * In SlideCraft's hybrid model an object is a transform box wrapping an HTML
 * slot, so a table is just a `<table>` living in {@link SlideObject.html}; the
 * document roundtrip is therefore already lossless (the html is never touched).
 *
 * Following the import.ts split, the value-bearing logic is pure and DOM-less:
 * a rectangular {@link TableData} grid, a {@link renderTable} serializer, and
 * pure structural ops (add/delete row & column, set cell text, merge, split).
 * {@link parseTable} is the only browser-only piece (uses DOMParser) and exists
 * so an existing table object can be read back into a grid for editing.
 *
 * Merges are modeled in the rectangular grid: the anchor cell carries
 * `colSpan`/`rowSpan` and every cell it covers is marked `covered` (kept in the
 * grid so row/column indices stay rectangular, but skipped on render).
 */
import type { SlideObject } from './model';
import type { ObjectInit } from './shapes';

export interface TableCell {
  /** Plain text content; escaped on render. */
  text: string;
  /** Render as `<th>` instead of `<td>`. */
  header?: boolean;
  /** Merge span; defaults to 1. */
  colSpan?: number;
  rowSpan?: number;
  /** Covered by another cell's merge — kept for grid shape, not rendered. */
  covered?: boolean;
}

export interface TableStyle {
  borderColor?: string;
  borderWidth?: number;
  headerFill?: string;
  /** cell padding in px. */
  cellPadding?: number;
}

export interface TableData {
  /** Rectangular grid: every row has the same length (= column count). */
  rows: TableCell[][];
  style?: TableStyle;
}

const DEFAULT_STYLE: Required<TableStyle> = {
  borderColor: '#c8ccd4',
  borderWidth: 1,
  headerFill: '#eef1f6',
  cellPadding: 8,
};

const TEXT_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
function escText(v: string): string {
  return v.replace(/[&<>]/g, (c) => TEXT_ESCAPES[c]);
}

function cell(text = '', header = false): TableCell {
  return header ? { text, header: true } : { text };
}

/** Build a rectangular {@link TableData} of `rows`×`cols` empty cells. */
export function createTableData(
  rows: number,
  cols: number,
  opts: { headerRow?: boolean; style?: TableStyle } = {},
): TableData {
  const r = Math.max(1, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  const headerRow = opts.headerRow ?? true;
  const grid: TableCell[][] = [];
  for (let i = 0; i < r; i++) {
    const row: TableCell[] = [];
    for (let j = 0; j < c; j++) row.push(cell('', headerRow && i === 0));
    grid.push(row);
  }
  return opts.style ? { rows: grid, style: opts.style } : { rows: grid };
}

/** Number of logical columns (grid width). */
export function columnCount(data: TableData): number {
  return data.rows[0]?.length ?? 0;
}

/** Serialize a {@link TableData} to a `<table>` markup string. Pure. */
export function renderTable(data: TableData): string {
  const s = { ...DEFAULT_STYLE, ...data.style };
  const border = `${s.borderWidth}px solid ${s.borderColor}`;
  const tableStyle =
    `width:100%;height:100%;border-collapse:collapse;table-layout:fixed;` +
    `border:${border};`;
  const baseCell = `border:${border};padding:${s.cellPadding}px;` +
    `vertical-align:top;word-wrap:break-word;`;
  const rowsHtml = data.rows
    .map((row) => {
      const cells = row
        .filter((c) => !c.covered)
        .map((c) => {
          const tag = c.header ? 'th' : 'td';
          const span =
            (c.colSpan && c.colSpan > 1 ? ` colspan="${c.colSpan}"` : '') +
            (c.rowSpan && c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : '');
          const fill = c.header ? `background:${s.headerFill};` : '';
          return `<${tag}${span} style="${baseCell}${fill}">${escText(c.text)}</${tag}>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return (
    `<table class="sc-table" style="${tableStyle}">` +
    `<tbody>${rowsHtml}</tbody></table>`
  );
}

/** Create a table object init (default box scaled to the grid). */
export function createTable(
  rows: number,
  cols: number,
  opts: { headerRow?: boolean; style?: TableStyle } = {},
  box: Partial<SlideObject> = {},
): ObjectInit {
  const data = createTableData(rows, cols, opts);
  return {
    w: Math.min(640, 120 * columnCount(data)),
    h: Math.min(400, 44 * data.rows.length),
    ...box,
    html: renderTable(data),
  };
}

// ---- pure structural ops (return a new TableData) ----

function cloneCell(c: TableCell): TableCell {
  return { ...c };
}
function cloneData(data: TableData): TableData {
  const rows = data.rows.map((row) => row.map(cloneCell));
  return data.style ? { rows, style: { ...data.style } } : { rows };
}

function clampIndex(i: number, len: number): number {
  return Math.max(0, Math.min(len, i));
}

/** Insert an empty row at `at` (default: append). Splits spanning merges. */
export function addRow(data: TableData, at?: number): TableData {
  const d = cloneData(data);
  const cols = columnCount(d);
  const idx = clampIndex(at ?? d.rows.length, d.rows.length);
  // Any rowSpan crossing the insertion boundary would become inconsistent;
  // unmerge by splitting so the grid stays simple and predictable.
  unspanRows(d, idx);
  const row: TableCell[] = [];
  for (let j = 0; j < cols; j++) row.push(cell(''));
  d.rows.splice(idx, 0, row);
  return d;
}

/** Delete the row at `at`. No-op below one remaining row. */
export function deleteRow(data: TableData, at: number): TableData {
  if (data.rows.length <= 1) return cloneData(data);
  const d = cloneData(data);
  const idx = clampIndex(at, d.rows.length - 1);
  unspanRows(d, idx);
  unspanRows(d, idx + 1);
  d.rows.splice(idx, 1);
  return d;
}

/** Insert an empty column at `at` (default: append). */
export function addColumn(data: TableData, at?: number): TableData {
  const d = cloneData(data);
  const cols = columnCount(d);
  const idx = clampIndex(at ?? cols, cols);
  unspanCols(d, idx);
  for (const row of d.rows) row.splice(idx, 0, cell(''));
  return d;
}

/** Delete the column at `at`. No-op below one remaining column. */
export function deleteColumn(data: TableData, at: number): TableData {
  if (columnCount(data) <= 1) return cloneData(data);
  const d = cloneData(data);
  const idx = clampIndex(at, columnCount(d) - 1);
  unspanCols(d, idx);
  unspanCols(d, idx + 1);
  for (const row of d.rows) row.splice(idx, 1);
  return d;
}

/** Set the text of one cell. */
export function setCellText(data: TableData, r: number, c: number, text: string): TableData {
  const d = cloneData(data);
  const target = d.rows[r]?.[c];
  if (target) target.text = text;
  return d;
}

/**
 * Merge the rectangular region [(r1,c1)..(r2,c2)] into its top-left anchor.
 * Covered cells are emptied and flagged so the grid stays rectangular.
 */
export function mergeCells(
  data: TableData,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): TableData {
  const d = cloneData(data);
  const rows = d.rows.length;
  const cols = columnCount(d);
  const top = Math.max(0, Math.min(r1, r2));
  const left = Math.max(0, Math.min(c1, c2));
  const bottom = Math.min(rows - 1, Math.max(r1, r2));
  const right = Math.min(cols - 1, Math.max(c1, c2));
  if (top === bottom && left === right) return d;
  const anchor = d.rows[top][left];
  anchor.rowSpan = bottom - top + 1;
  anchor.colSpan = right - left + 1;
  delete anchor.covered;
  for (let i = top; i <= bottom; i++) {
    for (let j = left; j <= right; j++) {
      if (i === top && j === left) continue;
      const c = d.rows[i][j];
      c.covered = true;
      c.text = '';
      delete c.colSpan;
      delete c.rowSpan;
    }
  }
  return d;
}

/** Split a merged cell back into individual cells. */
export function splitCell(data: TableData, r: number, c: number): TableData {
  const d = cloneData(data);
  const anchor = d.rows[r]?.[c];
  if (!anchor) return d;
  const rowSpan = anchor.rowSpan ?? 1;
  const colSpan = anchor.colSpan ?? 1;
  if (rowSpan <= 1 && colSpan <= 1) return d;
  for (let i = r; i < r + rowSpan; i++) {
    for (let j = c; j < c + colSpan; j++) {
      const cur = d.rows[i]?.[j];
      if (cur) delete cur.covered;
    }
  }
  delete anchor.rowSpan;
  delete anchor.colSpan;
  return d;
}

/** Break any vertical merges that cross the row boundary at `idx`. */
function unspanRows(d: TableData, idx: number): void {
  for (let i = 0; i < d.rows.length; i++) {
    for (let j = 0; j < d.rows[i].length; j++) {
      const c = d.rows[i][j];
      const span = c.rowSpan ?? 1;
      if (span > 1 && i < idx && i + span > idx) splitCellInPlace(d, i, j);
    }
  }
}

/** Break any horizontal merges that cross the column boundary at `idx`. */
function unspanCols(d: TableData, idx: number): void {
  for (let i = 0; i < d.rows.length; i++) {
    for (let j = 0; j < d.rows[i].length; j++) {
      const c = d.rows[i][j];
      const span = c.colSpan ?? 1;
      if (span > 1 && j < idx && j + span > idx) splitCellInPlace(d, i, j);
    }
  }
}

function splitCellInPlace(d: TableData, r: number, c: number): void {
  const anchor = d.rows[r][c];
  const rowSpan = anchor.rowSpan ?? 1;
  const colSpan = anchor.colSpan ?? 1;
  for (let i = r; i < r + rowSpan; i++) {
    for (let j = c; j < c + colSpan; j++) {
      const cur = d.rows[i]?.[j];
      if (cur) delete cur.covered;
    }
  }
  delete anchor.rowSpan;
  delete anchor.colSpan;
}

/**
 * Read a `<table>` markup string back into a {@link TableData} grid, honoring
 * colspan/rowspan by inserting `covered` placeholders. Browser-only: requires a
 * global DOMParser. Returns null if no table is found.
 */
export function parseTable(html: string): TableData | null {
  if (typeof DOMParser === 'undefined') {
    throw new Error('parseTable requires a DOM environment (DOMParser).');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const trs = Array.from(table.querySelectorAll('tr'));
  const grid: TableCell[][] = [];
  trs.forEach((tr, r) => {
    if (!grid[r]) grid[r] = [];
    let col = 0;
    for (const el of Array.from(tr.children)) {
      if (el.tagName !== 'TD' && el.tagName !== 'TH') continue;
      while (grid[r][col]) col++; // skip slots filled by an earlier rowspan
      const colSpan = Math.max(1, parseInt(el.getAttribute('colspan') || '1', 10) || 1);
      const rowSpan = Math.max(1, parseInt(el.getAttribute('rowspan') || '1', 10) || 1);
      const header = el.tagName === 'TH';
      const anchor: TableCell = { text: el.textContent ?? '' };
      if (header) anchor.header = true;
      if (colSpan > 1) anchor.colSpan = colSpan;
      if (rowSpan > 1) anchor.rowSpan = rowSpan;
      grid[r][col] = anchor;
      for (let i = 0; i < rowSpan; i++) {
        for (let j = 0; j < colSpan; j++) {
          if (i === 0 && j === 0) continue;
          if (!grid[r + i]) grid[r + i] = [];
          grid[r + i][col + j] = { text: '', covered: true, ...(header ? { header: true } : {}) };
        }
      }
      col += colSpan;
    }
  });
  // Normalize to a rectangle (fill any holes with empty cells).
  const width = grid.reduce((m, row) => Math.max(m, row.length), 0);
  for (const row of grid) {
    for (let j = 0; j < width; j++) if (!row[j]) row[j] = { text: '' };
  }
  return { rows: grid };
}
