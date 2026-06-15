// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  createTable,
  createTableData,
  renderTable,
  parseTable,
  columnCount,
  addRow,
  deleteRow,
  addColumn,
  deleteColumn,
  setCellText,
  mergeCells,
  splitCell,
  type TableData,
} from './tables';

/** Render → parse and compare the recovered grid shape/text/spans. */
function roundtrip(data: TableData): TableData {
  const back = parseTable(renderTable(data));
  if (!back) throw new Error('no table parsed');
  return back;
}

describe('createTableData / createTable', () => {
  it('builds a rectangular grid with a header row by default', () => {
    const d = createTableData(2, 3);
    expect(d.rows.length).toBe(2);
    expect(d.rows.every((r) => r.length === 3)).toBe(true);
    expect(d.rows[0].every((c) => c.header)).toBe(true);
    expect(d.rows[1].every((c) => !c.header)).toBe(true);
  });

  it('clamps degenerate sizes to at least 1×1', () => {
    const d = createTableData(0, -2);
    expect(d.rows.length).toBe(1);
    expect(columnCount(d)).toBe(1);
  });

  it('createTable yields an object init with <table> html', () => {
    const init = createTable(2, 2);
    expect(init.html).toContain('<table class="sc-table"');
    expect(init.w).toBeGreaterThan(0);
    expect(init.h).toBeGreaterThan(0);
  });
});

describe('renderTable', () => {
  it('escapes cell text', () => {
    const d = setCellText(createTableData(1, 1, { headerRow: false }), 0, 0, '<b> & </b>');
    expect(renderTable(d)).toContain('&lt;b&gt; &amp; &lt;/b&gt;');
  });

  it('skips covered cells and emits spans on the anchor', () => {
    const d = mergeCells(createTableData(2, 2, { headerRow: false }), 0, 0, 0, 1);
    const html = renderTable(d);
    expect(html).toContain('colspan="2"');
    // 2x2 merged across top row → 3 rendered cells, not 4.
    expect(html.match(/<td/g)?.length).toBe(3);
  });
});

describe('structural ops are pure', () => {
  it('addRow/deleteRow do not mutate the input', () => {
    const d = createTableData(2, 2, { headerRow: false });
    const snapshot = JSON.stringify(d);
    addRow(d);
    deleteRow(d, 0);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it('addRow appends and addColumn widens', () => {
    let d = createTableData(2, 2, { headerRow: false });
    d = addRow(d);
    expect(d.rows.length).toBe(3);
    d = addColumn(d);
    expect(columnCount(d)).toBe(3);
    expect(d.rows.every((r) => r.length === 3)).toBe(true);
  });

  it('addRow inserts at an index', () => {
    let d = createTableData(2, 2, { headerRow: false });
    d = setCellText(d, 0, 0, 'top');
    d = addRow(d, 0);
    expect(d.rows[0][0].text).toBe('');
    expect(d.rows[1][0].text).toBe('top');
  });

  it('deleteColumn keeps at least one column', () => {
    let d = createTableData(1, 1, { headerRow: false });
    d = deleteColumn(d, 0);
    expect(columnCount(d)).toBe(1);
  });
});

describe('merge / split', () => {
  it('mergeCells flags covered cells and splitCell restores them', () => {
    let d = mergeCells(createTableData(2, 2, { headerRow: false }), 0, 0, 1, 1);
    expect(d.rows[0][0].rowSpan).toBe(2);
    expect(d.rows[0][0].colSpan).toBe(2);
    expect(d.rows[1][1].covered).toBe(true);
    d = splitCell(d, 0, 0);
    expect(d.rows[0][0].rowSpan).toBeUndefined();
    expect(d.rows.flat().some((c) => c.covered)).toBe(false);
  });

  it('inserting a column through a merge unspans it first', () => {
    let d = mergeCells(createTableData(1, 3, { headerRow: false }), 0, 0, 0, 2);
    d = addColumn(d, 1);
    expect(d.rows[0][0].colSpan).toBeUndefined();
    expect(columnCount(d)).toBe(4);
  });
});

describe('render → parse roundtrip', () => {
  it('recovers a plain grid with text', () => {
    let d = createTableData(2, 2);
    d = setCellText(d, 1, 0, 'hello');
    const back = roundtrip(d);
    expect(back.rows.length).toBe(2);
    expect(columnCount(back)).toBe(2);
    expect(back.rows[1][0].text).toBe('hello');
    expect(back.rows[0][0].header).toBe(true);
  });

  it('recovers spans and covered placeholders', () => {
    const d = mergeCells(createTableData(2, 2, { headerRow: false }), 0, 0, 1, 0);
    const back = roundtrip(d);
    expect(back.rows[0][0].rowSpan).toBe(2);
    expect(back.rows[1][0].covered).toBe(true);
    expect(columnCount(back)).toBe(2);
  });

  it('parseTable returns null when there is no table', () => {
    expect(parseTable('<div>no table</div>')).toBeNull();
  });
});
