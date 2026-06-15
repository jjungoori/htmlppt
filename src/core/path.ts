/**
 * M19 — editable path shapes: point editing + boolean merge (합/차/교집합).
 *
 * Like tables (M16), charts (M17) and connectors (M18), a path is just an HTML
 * slot living in {@link SlideObject.html}; here the slot is an
 * `<svg class="sc-path">`, so the document roundtrip is already lossless (the
 * html is never touched).
 *
 * The value-bearing logic is pure and DOM-less: a {@link PathData} spec (a list
 * of anchor nodes with optional cubic bezier handles, plus a closed flag and
 * style), a pure serializer {@link pathD}/{@link renderPath} (spec → SVG `d`
 * markup), pure point-editing ops (move/add/delete node, set handles), and a
 * pure boolean merge {@link booleanPath} (union / intersection / difference of
 * two polygons via Greiner–Hormann). The exact spec is stamped onto the root
 * `<svg>` as a JSON `data-sc-path` attribute, so a path reads back losslessly
 * for editing — {@link parsePath} is the only browser-only piece (DOMParser).
 *
 * Coordinates are in slide/world space; the object box equals the path bounding
 * box (viewBox = bbox), so two independent path objects already share one
 * coordinate space and can be merged directly. Editing re-fits the box, exactly
 * like connector re-routing.
 */
import type { SlideObject } from './model';
import type { ObjectInit } from './shapes';
import type { Rect } from './transform';

/** A 2D point. Control handles, when present, are absolute world coordinates. */
export interface Pt {
  x: number;
  y: number;
}

/**
 * A path anchor node. `in`/`out` are the incoming/outgoing cubic bezier control
 * points (absolute coords); absent handles mean a straight segment on that side.
 */
export interface PathNode extends Pt {
  in?: Pt;
  out?: Pt;
}

export interface PathStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface PathData {
  nodes: PathNode[];
  closed: boolean;
  style?: PathStyle;
}

export type BooleanOp = 'union' | 'intersection' | 'difference';

const DEFAULTS: Required<PathStyle> = {
  fill: '#4f80ff',
  stroke: '#1b2a4a',
  strokeWidth: 2,
};

// ---- pure geometry ----

/** Bounding box over anchor points and any control handles. */
export function pathBBox(data: PathData): Rect {
  const pts: Pt[] = [];
  for (const n of data.nodes) {
    pts.push(n);
    if (n.in) pts.push(n.in);
    if (n.out) pts.push(n.out);
  }
  if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Signed area of the anchor polygon (shoelace); positive = CCW in SVG coords. */
export function polygonArea(nodes: Pt[]): number {
  let a = 0;
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i];
    const q = nodes[(i + 1) % nodes.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Build the SVG path `d` string. Segments use cubic beziers iff a handle exists. */
export function pathD(data: PathData): string {
  const n = data.nodes;
  if (n.length === 0) return '';
  const f = (v: number) => Number(v.toFixed(2));
  let d = `M ${f(n[0].x)} ${f(n[0].y)}`;
  const segs = data.closed ? n.length : n.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = n[i];
    const b = n[(i + 1) % n.length];
    const isClose = data.closed && i === n.length - 1;
    if (a.out || b.in) {
      const c1 = a.out ?? a;
      const c2 = b.in ?? b;
      d += ` C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`;
    } else if (!isClose) {
      // straight close is left to Z, which draws back to the start point.
      d += ` L ${f(b.x)} ${f(b.y)}`;
    }
  }
  if (data.closed) d += ' Z';
  return d;
}

const ATTR_ESCAPES: Record<string, string> = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' };
function escAttr(v: string): string {
  return v.replace(/[&"<>]/g, (c) => ATTR_ESCAPES[c]);
}

/**
 * Serialize a {@link PathData} to `<svg class="sc-path">` markup. The viewBox is
 * the path bbox so the object box can equal it (preserveAspectRatio="none" so it
 * tracks resize). The exact spec is stamped as JSON `data-sc-path` for lossless
 * read-back.
 */
export function renderPath(data: PathData): string {
  const s = { ...DEFAULTS, ...data.style };
  const bb = pathBBox(data);
  const vb = `${bb.x.toFixed(2)} ${bb.y.toFixed(2)} ${Math.max(bb.w, 0.01).toFixed(2)} ${Math.max(bb.h, 0.01).toFixed(2)}`;
  const spec = escAttr(JSON.stringify(data));
  const fill = data.closed ? s.fill : 'none';
  return (
    `<svg class="sc-path" data-sc-path="${spec}" ` +
    `viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="none" ` +
    `style="overflow:visible" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="${pathD(data)}" fill="${fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"/>` +
    `</svg>`
  );
}

/** Create path object init: object box = path bbox. Returns an {@link ObjectInit}. */
export function createPath(data: PathData, box: Partial<SlideObject> = {}): ObjectInit {
  const bb = pathBBox(data);
  return {
    x: bb.x,
    y: bb.y,
    w: Math.max(bb.w, 1),
    h: Math.max(bb.h, 1),
    ...box,
    html: renderPath(data),
  };
}

// ---- pure point-editing ops (return a new PathData) ----

function cloneNode(n: PathNode): PathNode {
  const out: PathNode = { x: n.x, y: n.y };
  if (n.in) out.in = { ...n.in };
  if (n.out) out.out = { ...n.out };
  return out;
}

function cloneData(data: PathData): PathData {
  const out: PathData = { nodes: data.nodes.map(cloneNode), closed: data.closed };
  if (data.style) out.style = { ...data.style };
  return out;
}

/** Translate the whole path (anchors and handles) by (dx, dy). */
export function translatePath(data: PathData, dx: number, dy: number): PathData {
  const d = cloneData(data);
  for (const n of d.nodes) {
    n.x += dx; n.y += dy;
    if (n.in) { n.in.x += dx; n.in.y += dy; }
    if (n.out) { n.out.x += dx; n.out.y += dy; }
  }
  return d;
}

/** Move anchor `i` to (x, y), carrying its handles by the same delta. */
export function moveNode(data: PathData, i: number, x: number, y: number): PathData {
  const d = cloneData(data);
  const n = d.nodes[i];
  if (!n) return d;
  const dx = x - n.x, dy = y - n.y;
  n.x = x; n.y = y;
  if (n.in) { n.in.x += dx; n.in.y += dy; }
  if (n.out) { n.out.x += dx; n.out.y += dy; }
  return d;
}

/** Set (or clear, with null) the incoming/outgoing bezier handle of node `i`. */
export function setNodeHandle(data: PathData, i: number, which: 'in' | 'out', pt: Pt | null): PathData {
  const d = cloneData(data);
  const n = d.nodes[i];
  if (!n) return d;
  if (pt) n[which] = { ...pt };
  else delete n[which];
  return d;
}

/** Insert a new node after index `i` (use -1 to prepend at the start). */
export function addNode(data: PathData, i: number, node: PathNode): PathData {
  const d = cloneData(data);
  d.nodes.splice(i + 1, 0, cloneNode(node));
  return d;
}

/** Delete node `i`. No-op below 2 remaining nodes. */
export function deleteNode(data: PathData, i: number): PathData {
  const d = cloneData(data);
  if (d.nodes.length <= 2) return d;
  d.nodes.splice(i, 1);
  return d;
}

// ---- boolean merge (Greiner–Hormann on anchor polygons) ----

interface Vtx {
  x: number;
  y: number;
  next: Vtx | null;
  prev: Vtx | null;
  intersect: boolean;
  entry: boolean;
  visited: boolean;
  alpha: number;
  neighbour: Vtx | null;
}

function mkVtx(x: number, y: number): Vtx {
  return { x, y, next: null, prev: null, intersect: false, entry: false, visited: false, alpha: 0, neighbour: null };
}

function buildRing(pts: Pt[]): Vtx {
  const verts = pts.map((p) => mkVtx(p.x, p.y));
  for (let i = 0; i < verts.length; i++) {
    verts[i].next = verts[(i + 1) % verts.length];
    verts[i].prev = verts[(i - 1 + verts.length) % verts.length];
  }
  return verts[0];
}

function* ring(start: Vtx): Generator<Vtx> {
  let v = start;
  do {
    yield v;
    v = v.next!;
  } while (v !== start);
}

/** Insert intersection vertex `v` between `a` and `a.next`, sorted by alpha. */
function insertAfter(a: Vtx, v: Vtx): void {
  let cur = a;
  while (cur.next !== a && cur.next!.intersect && cur.next!.alpha < v.alpha) {
    cur = cur.next!;
  }
  v.next = cur.next;
  v.prev = cur;
  cur.next!.prev = v;
  cur.next = v;
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/**
 * Boolean combine two anchor polygons (handles are ignored — straight edges).
 * Returns one or more result rings as PathData polygons; empty array when the
 * operands don't interact in a way that produces a region (degenerate inputs).
 */
export function booleanPath(a: PathData, b: PathData, op: BooleanOp, style?: PathStyle): PathData[] {
  const ptsA = a.nodes.map((n) => ({ x: n.x, y: n.y }));
  const ptsB = b.nodes.map((n) => ({ x: n.x, y: n.y }));
  const subj = buildRing(ptsA);
  const clip = buildRing(ptsB);

  // 1. find & insert intersections
  let found = false;
  for (const s of [...ring(subj)]) {
    if (s.intersect) continue;
    const s2 = s.next!;
    for (const c of [...ring(clip)]) {
      if (c.intersect) continue;
      const c2 = c.next!;
      const hit = segIntersect(s, s2, c, c2);
      if (!hit) continue;
      found = true;
      const vs = mkVtx(hit.x, hit.y);
      const vc = mkVtx(hit.x, hit.y);
      vs.intersect = vc.intersect = true;
      vs.alpha = hit.tS;
      vc.alpha = hit.tC;
      vs.neighbour = vc;
      vc.neighbour = vs;
      insertAfter(s, vs);
      insertAfter(c, vc);
    }
  }

  if (!found) {
    // no crossings: containment-based result
    const aInB = pointInPolygon(ptsA[0], ptsB);
    const bInA = pointInPolygon(ptsB[0], ptsA);
    return noCrossResult(a, b, op, aInB, bInA, style);
  }

  // 2. mark entry/exit
  markEntry(subj, ptsB, op, 'subject');
  markEntry(clip, ptsA, op, 'clip');

  // 3. trace result rings
  const results: PathData[] = [];
  for (const start of ring(subj)) {
    if (!start.intersect || start.visited) continue;
    const out: Pt[] = [];
    let cur = start;
    do {
      cur.visited = true;
      if (cur.neighbour) cur.neighbour.visited = true;
      out.push({ x: cur.x, y: cur.y });
      const forward = cur.entry;
      // walk to next intersection in the chosen direction, collecting points
      do {
        cur = forward ? cur.next! : cur.prev!;
        out.push({ x: cur.x, y: cur.y });
      } while (!cur.intersect);
      out.pop(); // last pushed is the intersection; keep it once via neighbour
      cur.visited = true;
      cur = cur.neighbour!;
    } while (cur !== start && !cur.visited);
    if (out.length >= 3) {
      results.push({ nodes: dedupe(out), closed: true, style: style ?? a.style });
    }
  }
  return results;
}

function dedupe(pts: Pt[]): PathNode[] {
  const out: PathNode[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

function markEntry(start: Vtx, other: Pt[], op: BooleanOp, role: 'subject' | 'clip'): void {
  let status = pointInPolygon(start, other);
  // union flips both; difference flips the clip ring only
  if (op === 'union') status = !status;
  if (op === 'difference' && role === 'clip') status = !status;
  for (const v of ring(start)) {
    if (v.intersect) {
      v.entry = !status;
      status = !status;
    }
  }
}

interface Hit { x: number; y: number; tS: number; tC: number; }
function segIntersect(s1: Pt, s2: Pt, c1: Pt, c2: Pt): Hit | null {
  const dx1 = s2.x - s1.x, dy1 = s2.y - s1.y;
  const dx2 = c2.x - c1.x, dy2 = c2.y - c1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-12) return null; // parallel
  const tS = ((c1.x - s1.x) * dy2 - (c1.y - s1.y) * dx2) / denom;
  const tC = ((c1.x - s1.x) * dy1 - (c1.y - s1.y) * dx1) / denom;
  if (tS <= 1e-9 || tS >= 1 - 1e-9 || tC <= 1e-9 || tC >= 1 - 1e-9) return null;
  return { x: s1.x + tS * dx1, y: s1.y + tS * dy1, tS, tC };
}

function noCrossResult(
  a: PathData, b: PathData, op: BooleanOp, aInB: boolean, bInA: boolean, style?: PathStyle,
): PathData[] {
  const A = { ...a, style: style ?? a.style };
  const B = { ...b, style: style ?? a.style };
  switch (op) {
    case 'union':
      if (aInB) return [B];
      if (bInA) return [A];
      return [A, B]; // disjoint → both rings
    case 'intersection':
      if (aInB) return [A];
      if (bInA) return [B];
      return [];
    case 'difference':
      if (aInB) return []; // A entirely removed
      return [A]; // B is outside or a hole; outer ring stays
  }
}

/**
 * Read a `<svg class="sc-path">` markup string back into its {@link PathData}
 * spec via the stamped `data-sc-path` attribute. Browser-only (DOMParser).
 */
export function parsePath(html: string): PathData | null {
  if (typeof DOMParser === 'undefined') {
    throw new Error('parsePath requires a DOM environment (DOMParser).');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const svg = doc.querySelector('svg.sc-path[data-sc-path], [data-sc-path]');
  const spec = svg?.getAttribute('data-sc-path');
  if (!spec) return null;
  try {
    const data = JSON.parse(spec) as PathData;
    if (!data || !Array.isArray(data.nodes)) return null;
    return data;
  } catch {
    return null;
  }
}
