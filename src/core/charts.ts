/**
 * M17 — chart object.
 *
 * Like tables (M16), a chart is just an HTML slot living in
 * {@link SlideObject.html}; here the slot is an `<svg class="sc-chart">`, so the
 * document roundtrip is already lossless (the html is never touched).
 *
 * The value-bearing logic is pure and DOM-less: a {@link ChartData} spec, a
 * {@link renderChart} serializer (data model → SVG markup), and pure data-edit
 * ops (set value, add/remove series & category, rename). The exact spec is
 * stamped onto the root `<svg>` as a JSON `data-sc-chart` attribute so the chart
 * can be read back losslessly for editing — {@link parseChart} is the only
 * browser-only piece (uses DOMParser) and recovers the spec from that attribute.
 */
import type { SlideObject } from './model';
import type { ObjectInit } from './shapes';

export type ChartKind = 'bar' | 'line' | 'pie';

export interface ChartSeries {
  /** Series label (shown in legend). */
  name: string;
  /** One value per category (line/bar) or per slice (pie uses series[0]). */
  values: number[];
}

export interface ChartStyle {
  /** Categorical palette; cycled across series (bar/line) or slices (pie). */
  palette?: string[];
  axisColor?: string;
  /** Background fill of the plot SVG. */
  background?: string;
  /** Show the legend row. */
  legend?: boolean;
}

export interface ChartData {
  kind: ChartKind;
  /** X-axis labels (bar/line) or slice labels (pie). */
  categories: string[];
  series: ChartSeries[];
  style?: ChartStyle;
}

const DEFAULT_STYLE: Required<ChartStyle> = {
  palette: ['#4c7ef3', '#f3724c', '#36c275', '#f3c14c', '#9b5cf3', '#46c7d4'],
  axisColor: '#c8ccd4',
  background: 'transparent',
  legend: true,
};

const W = 480;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 36, left: 40 };

const TEXT_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
function escText(v: string): string {
  return v.replace(/[&<>]/g, (c) => TEXT_ESCAPES[c]);
}
function escAttr(v: string): string {
  return v.replace(/[&<>"]/g, (c) => (c === '"' ? '&quot;' : TEXT_ESCAPES[c]));
}

function color(style: Required<ChartStyle>, i: number): string {
  return style.palette[i % style.palette.length];
}

/** Build a {@link ChartData} with `categories.length` cols and `series` rows. */
export function createChartData(
  kind: ChartKind,
  categories: string[],
  series: ChartSeries[],
  style?: ChartStyle,
): ChartData {
  const cats = categories.length ? categories.slice() : ['A', 'B', 'C'];
  const norm = (series.length ? series : [{ name: 'Series 1', values: [] }]).map((s) => ({
    name: s.name,
    values: cats.map((_, j) => s.values[j] ?? 0),
  }));
  return style ? { kind, categories: cats, series: norm, style } : { kind, categories: cats, series: norm };
}

// ---- rendering (pure) ----

function plotRect() {
  return {
    x: PAD.left,
    y: PAD.top,
    w: W - PAD.left - PAD.right,
    h: H - PAD.top - PAD.bottom,
  };
}

function maxValue(data: ChartData): number {
  let m = 0;
  for (const s of data.series) for (const v of s.values) if (v > m) m = v;
  return m <= 0 ? 1 : m;
}

function renderBar(data: ChartData, st: Required<ChartStyle>): string {
  const p = plotRect();
  const max = maxValue(data);
  const n = data.categories.length;
  const groupW = p.w / Math.max(1, n);
  const sCount = Math.max(1, data.series.length);
  const barW = (groupW * 0.7) / sCount;
  const bars: string[] = [];
  data.categories.forEach((_, ci) => {
    const gx = p.x + groupW * ci + groupW * 0.15;
    data.series.forEach((s, si) => {
      const v = s.values[ci] ?? 0;
      const bh = (v / max) * p.h;
      const x = gx + barW * si;
      const y = p.y + p.h - bh;
      bars.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" ` +
          `height="${bh.toFixed(1)}" fill="${color(st, si)}"/>`,
      );
    });
  });
  return bars.join('');
}

function renderLine(data: ChartData, st: Required<ChartStyle>): string {
  const p = plotRect();
  const max = maxValue(data);
  const n = data.categories.length;
  const step = n > 1 ? p.w / (n - 1) : 0;
  const lines = data.series.map((s, si) => {
    const pts = data.categories.map((_, ci) => {
      const v = s.values[ci] ?? 0;
      const x = p.x + step * ci;
      const y = p.y + p.h - (v / max) * p.h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const dots = pts
      .map((pt) => {
        const [x, y] = pt.split(',');
        return `<circle cx="${x}" cy="${y}" r="3" fill="${color(st, si)}"/>`;
      })
      .join('');
    return (
      `<polyline fill="none" stroke="${color(st, si)}" stroke-width="2" ` +
      `points="${pts.join(' ')}"/>${dots}`
    );
  });
  return lines.join('');
}

function renderPie(data: ChartData, st: Required<ChartStyle>): string {
  const p = plotRect();
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const r = Math.min(p.w, p.h) / 2;
  const vals = data.categories.map((_, ci) => Math.max(0, data.series[0]?.values[ci] ?? 0));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  let angle = -Math.PI / 2;
  const slices = vals.map((v, i) => {
    const frac = v / total;
    const next = angle + frac * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(next);
    const y2 = cy + r * Math.sin(next);
    const large = frac > 0.5 ? 1 : 0;
    angle = next;
    if (frac >= 0.999) {
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${color(st, i)}"/>`;
    }
    return (
      `<path d="M${cx.toFixed(1)},${cy.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} ` +
      `A${r.toFixed(1)},${r.toFixed(1)} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" ` +
      `fill="${color(st, i)}"/>`
    );
  });
  return slices.join('');
}

function renderAxes(data: ChartData, st: Required<ChartStyle>): string {
  if (data.kind === 'pie') return '';
  const p = plotRect();
  const axis =
    `<line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${p.y + p.h}" stroke="${st.axisColor}"/>` +
    `<line x1="${p.x}" y1="${p.y + p.h}" x2="${p.x + p.w}" y2="${p.y + p.h}" stroke="${st.axisColor}"/>`;
  const n = data.categories.length;
  const groupW = p.w / Math.max(1, n);
  const labels = data.categories
    .map((c, i) => {
      const x = data.kind === 'line' ? p.x + (n > 1 ? p.w / (n - 1) : 0) * i : p.x + groupW * (i + 0.5);
      return `<text x="${x.toFixed(1)}" y="${(p.y + p.h + 16).toFixed(1)}" font-size="11" text-anchor="middle" fill="#555">${escText(c)}</text>`;
    })
    .join('');
  return axis + labels;
}

function renderLegend(data: ChartData, st: Required<ChartStyle>): string {
  if (!st.legend) return '';
  const labels = data.kind === 'pie' ? data.categories : data.series.map((s) => s.name);
  const items = labels
    .map((label, i) => {
      const x = PAD.left + i * 96;
      return (
        `<rect x="${x}" y="${H - 14}" width="10" height="10" fill="${color(st, i)}"/>` +
        `<text x="${x + 14}" y="${H - 5}" font-size="11" fill="#555">${escText(label)}</text>`
      );
    })
    .join('');
  return items;
}

/** Serialize a {@link ChartData} to `<svg class="sc-chart">` markup. Pure. */
export function renderChart(data: ChartData): string {
  const st = { ...DEFAULT_STYLE, ...data.style };
  let body = '';
  if (data.kind === 'bar') body = renderBar(data, st);
  else if (data.kind === 'line') body = renderLine(data, st);
  else body = renderPie(data, st);
  const spec = escAttr(JSON.stringify(data));
  const bg =
    st.background && st.background !== 'transparent'
      ? `<rect x="0" y="0" width="${W}" height="${H}" fill="${st.background}"/>`
      : '';
  return (
    `<svg class="sc-chart" data-sc-chart="${spec}" viewBox="0 0 ${W} ${H}" ` +
    `preserveAspectRatio="xMidYMid meet" width="100%" height="100%" ` +
    `xmlns="http://www.w3.org/2000/svg">` +
    bg +
    renderAxes(data, st) +
    body +
    renderLegend(data, st) +
    `</svg>`
  );
}

/** Create a chart object init (default box). */
export function createChart(
  kind: ChartKind,
  categories: string[],
  series: ChartSeries[],
  style?: ChartStyle,
  box: Partial<SlideObject> = {},
): ObjectInit {
  const data = createChartData(kind, categories, series, style);
  return { w: 480, h: 300, ...box, html: renderChart(data) };
}

// ---- pure data-edit ops (return a new ChartData) ----

function cloneData(data: ChartData): ChartData {
  const series = data.series.map((s) => ({ name: s.name, values: s.values.slice() }));
  const out: ChartData = { kind: data.kind, categories: data.categories.slice(), series };
  if (data.style) out.style = { ...data.style, palette: data.style.palette?.slice() };
  return out;
}

/** Set the value at series `si`, category `ci`. */
export function setValue(data: ChartData, si: number, ci: number, value: number): ChartData {
  const d = cloneData(data);
  const s = d.series[si];
  if (s && ci >= 0 && ci < d.categories.length) s.values[ci] = value;
  return d;
}

/** Append a category column (every series gets a 0). */
export function addCategory(data: ChartData, name?: string): ChartData {
  const d = cloneData(data);
  d.categories.push(name ?? `C${d.categories.length + 1}`);
  for (const s of d.series) s.values.push(0);
  return d;
}

/** Remove the category at `ci`. No-op below one remaining category. */
export function removeCategory(data: ChartData, ci: number): ChartData {
  if (data.categories.length <= 1) return cloneData(data);
  const d = cloneData(data);
  if (ci < 0 || ci >= d.categories.length) return d;
  d.categories.splice(ci, 1);
  for (const s of d.series) s.values.splice(ci, 1);
  return d;
}

/** Append a series (filled with zeros). */
export function addSeries(data: ChartData, name?: string): ChartData {
  const d = cloneData(data);
  d.series.push({ name: name ?? `Series ${d.series.length + 1}`, values: d.categories.map(() => 0) });
  return d;
}

/** Remove the series at `si`. No-op below one remaining series. */
export function removeSeries(data: ChartData, si: number): ChartData {
  if (data.series.length <= 1) return cloneData(data);
  const d = cloneData(data);
  if (si >= 0 && si < d.series.length) d.series.splice(si, 1);
  return d;
}

/** Rename a series. */
export function renameSeries(data: ChartData, si: number, name: string): ChartData {
  const d = cloneData(data);
  if (d.series[si]) d.series[si].name = name;
  return d;
}

/** Rename a category. */
export function renameCategory(data: ChartData, ci: number, name: string): ChartData {
  const d = cloneData(data);
  if (ci >= 0 && ci < d.categories.length) d.categories[ci] = name;
  return d;
}

/** Switch chart kind (bar/line/pie). */
export function setChartKind(data: ChartData, kind: ChartKind): ChartData {
  const d = cloneData(data);
  d.kind = kind;
  return d;
}

/**
 * Read a `<svg class="sc-chart">` markup string back into its {@link ChartData}
 * spec via the stamped `data-sc-chart` attribute. Browser-only: requires a
 * global DOMParser. Returns null if no chart spec is found.
 */
export function parseChart(html: string): ChartData | null {
  if (typeof DOMParser === 'undefined') {
    throw new Error('parseChart requires a DOM environment (DOMParser).');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const svg = doc.querySelector('svg.sc-chart[data-sc-chart], [data-sc-chart]');
  const spec = svg?.getAttribute('data-sc-chart');
  if (!spec) return null;
  try {
    const data = JSON.parse(spec) as ChartData;
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.series)) return null;
    return data;
  } catch {
    return null;
  }
}
