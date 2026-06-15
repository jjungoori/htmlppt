/**
 * M18 — connector / connection line.
 *
 * Like tables (M16) and charts (M17), a connector is just an HTML slot living
 * in {@link SlideObject.html}; here the slot is an `<svg class="sc-connector">`,
 * so the document roundtrip is already lossless (the html is never touched).
 *
 * The value-bearing logic is pure and DOM-less: a {@link ConnectorData} spec
 * (which two objects it anchors to, on which sides, arrow/line style), a pure
 * router {@link routeConnector} (anchor boxes → polyline points + bounding box),
 * and a pure serializer {@link renderConnector} (spec + geometry → SVG markup).
 * The exact spec is stamped onto the root `<svg>` as a JSON `data-sc-connector`
 * attribute, so a connector reads back losslessly for editing and re-routing —
 * {@link parseConnector} is the only browser-only piece (uses DOMParser).
 *
 * Auto-tracking lives in the editor: when an anchored object moves/resizes, the
 * connector is re-routed from the current boxes and re-rendered through the
 * command layer (undoable), keeping the geometry attached to its endpoints.
 */
import type { ObjectId, SlideObject } from './model';
import type { ObjectInit } from './shapes';
import type { Rect } from './transform';

/** Which edge of an anchored box the line attaches to; 'auto' faces the peer. */
export type AnchorSide = 'auto' | 'top' | 'right' | 'bottom' | 'left';

/** Straight line, or an axis-aligned elbow (single mid bend). */
export type ConnectorRouting = 'straight' | 'orthogonal';

export interface ConnectorEnd {
  /** Id of the anchored object (the connector follows it). */
  ref: ObjectId;
  side: AnchorSide;
}

export interface ConnectorStyle {
  stroke?: string;
  strokeWidth?: number;
  /** SVG dash array, e.g. "6 4"; absent = solid. */
  dash?: string;
}

export interface ConnectorData {
  from: ConnectorEnd;
  to: ConnectorEnd;
  routing: ConnectorRouting;
  /** Draw an arrowhead at the start / end of the line. */
  arrowStart: boolean;
  arrowEnd: boolean;
  style?: ConnectorStyle;
}

const DEFAULT_STYLE: Required<ConnectorStyle> = {
  stroke: '#4c5566',
  strokeWidth: 2,
  dash: '',
};

/** Extra slack around the routed path so arrowheads/stroke never clip. */
const PAD = 12;

interface Pt {
  x: number;
  y: number;
}

/** Build a {@link ConnectorData} with sensible defaults. */
export function createConnectorData(
  fromId: ObjectId,
  toId: ObjectId,
  opts: {
    fromSide?: AnchorSide;
    toSide?: AnchorSide;
    routing?: ConnectorRouting;
    arrowStart?: boolean;
    arrowEnd?: boolean;
    style?: ConnectorStyle;
  } = {},
): ConnectorData {
  const data: ConnectorData = {
    from: { ref: fromId, side: opts.fromSide ?? 'auto' },
    to: { ref: toId, side: opts.toSide ?? 'auto' },
    routing: opts.routing ?? 'straight',
    arrowStart: opts.arrowStart ?? false,
    arrowEnd: opts.arrowEnd ?? true,
  };
  if (opts.style) data.style = opts.style;
  return data;
}

function center(r: Rect): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Point on the edge of `box` for a given side; 'auto' faces `peer`. */
export function anchorPoint(box: Rect, side: AnchorSide, peer: Rect): Pt {
  const c = center(box);
  let s = side;
  if (s === 'auto') {
    const pc = center(peer);
    const dx = pc.x - c.x;
    const dy = pc.y - c.y;
    // Pick the edge whose axis dominates the direction to the peer.
    if (Math.abs(dx) >= Math.abs(dy)) s = dx >= 0 ? 'right' : 'left';
    else s = dy >= 0 ? 'bottom' : 'top';
  }
  switch (s) {
    case 'top':
      return { x: c.x, y: box.y };
    case 'bottom':
      return { x: c.x, y: box.y + box.h };
    case 'left':
      return { x: box.x, y: c.y };
    case 'right':
      return { x: box.x + box.w, y: c.y };
  }
}

/**
 * Route a connector between two anchor boxes (slide coordinates). Returns the
 * polyline points and a bounding box padded for the arrowheads/stroke. Pure.
 */
export function routeConnector(
  data: ConnectorData,
  fromBox: Rect,
  toBox: Rect,
): { points: Pt[]; bbox: Rect } {
  const a = anchorPoint(fromBox, data.from.side, toBox);
  const b = anchorPoint(toBox, data.to.side, fromBox);
  let points: Pt[];
  if (data.routing === 'orthogonal') {
    // Single elbow: turn at the horizontal midpoint between the endpoints.
    const midX = (a.x + b.x) / 2;
    points = [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  } else {
    points = [a, b];
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const bbox: Rect = {
    x: minX - PAD,
    y: minY - PAD,
    w: maxX - minX + PAD * 2,
    h: maxY - minY + PAD * 2,
  };
  return { points, bbox };
}

const TEXT_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
function escAttr(v: string): string {
  return v.replace(/[&<>"]/g, (c) => (c === '"' ? '&quot;' : TEXT_ESCAPES[c]));
}

/** Arrowhead polygon (in local coords) pointing from `from` toward `tip`. */
function arrowHead(tip: Pt, from: Pt, st: Required<ConnectorStyle>): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = 6 + st.strokeWidth * 1.5;
  // Two base corners, offset perpendicular to the direction.
  const bx = tip.x - ux * size;
  const by = tip.y - uy * size;
  const px = -uy;
  const py = ux;
  const half = size * 0.5;
  const p1 = `${(bx + px * half).toFixed(1)},${(by + py * half).toFixed(1)}`;
  const p2 = `${(bx - px * half).toFixed(1)},${(by - py * half).toFixed(1)}`;
  return `<polygon points="${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${p1} ${p2}" fill="${st.stroke}"/>`;
}

/**
 * Serialize a {@link ConnectorData} + routed geometry to `<svg class="sc-connector">`
 * markup. Points are in slide coordinates; they are translated into the bbox's
 * local frame so the SVG can sit at `bbox.x/y`. Pure.
 */
export function renderConnector(data: ConnectorData, points: Pt[], bbox: Rect): string {
  const st = { ...DEFAULT_STYLE, ...data.style };
  const local = points.map((p) => ({ x: p.x - bbox.x, y: p.y - bbox.y }));
  const poly = local.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dash = st.dash ? ` stroke-dasharray="${escAttr(st.dash)}"` : '';
  const line =
    `<polyline fill="none" stroke="${st.stroke}" stroke-width="${st.strokeWidth}" ` +
    `stroke-linejoin="round" stroke-linecap="round"${dash} points="${poly}"/>`;
  let heads = '';
  if (data.arrowEnd && local.length >= 2) {
    heads += arrowHead(local[local.length - 1], local[local.length - 2], st);
  }
  if (data.arrowStart && local.length >= 2) {
    heads += arrowHead(local[0], local[1], st);
  }
  const spec = escAttr(JSON.stringify(data));
  return (
    `<svg class="sc-connector" data-sc-connector="${spec}" ` +
    `viewBox="0 0 ${bbox.w.toFixed(1)} ${bbox.h.toFixed(1)}" ` +
    `width="100%" height="100%" preserveAspectRatio="none" ` +
    `style="overflow:visible;pointer-events:none" xmlns="http://www.w3.org/2000/svg">` +
    line +
    heads +
    `</svg>`
  );
}

/**
 * Create a connector object init: routes between the two anchor boxes and
 * positions the object at the routed bounding box. Returns an {@link ObjectInit}.
 */
export function createConnector(
  data: ConnectorData,
  fromBox: Rect,
  toBox: Rect,
  box: Partial<SlideObject> = {},
): ObjectInit {
  const { points, bbox } = routeConnector(data, fromBox, toBox);
  return {
    x: bbox.x,
    y: bbox.y,
    w: bbox.w,
    h: bbox.h,
    ...box,
    html: renderConnector(data, points, bbox),
  };
}

// ---- pure spec-edit ops (return a new ConnectorData) ----

function cloneData(data: ConnectorData): ConnectorData {
  const out: ConnectorData = {
    from: { ...data.from },
    to: { ...data.to },
    routing: data.routing,
    arrowStart: data.arrowStart,
    arrowEnd: data.arrowEnd,
  };
  if (data.style) out.style = { ...data.style };
  return out;
}

/** Switch the routing mode (straight/orthogonal). */
export function setRouting(data: ConnectorData, routing: ConnectorRouting): ConnectorData {
  const d = cloneData(data);
  d.routing = routing;
  return d;
}

/** Set which edge an end attaches to. */
export function setSide(data: ConnectorData, end: 'from' | 'to', side: AnchorSide): ConnectorData {
  const d = cloneData(data);
  d[end].side = side;
  return d;
}

/** Toggle/set the arrowheads. */
export function setArrows(data: ConnectorData, start: boolean, end: boolean): ConnectorData {
  const d = cloneData(data);
  d.arrowStart = start;
  d.arrowEnd = end;
  return d;
}

/** Merge a partial style. */
export function setStyle(data: ConnectorData, style: ConnectorStyle): ConnectorData {
  const d = cloneData(data);
  d.style = { ...d.style, ...style };
  return d;
}

/**
 * Read a `<svg class="sc-connector">` markup string back into its
 * {@link ConnectorData} spec via the stamped `data-sc-connector` attribute.
 * Browser-only: requires a global DOMParser. Returns null if none is found.
 */
export function parseConnector(html: string): ConnectorData | null {
  if (typeof DOMParser === 'undefined') {
    throw new Error('parseConnector requires a DOM environment (DOMParser).');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const svg = doc.querySelector('svg.sc-connector[data-sc-connector], [data-sc-connector]');
  const spec = svg?.getAttribute('data-sc-connector');
  if (!spec) return null;
  try {
    const data = JSON.parse(spec) as ConnectorData;
    if (!data || !data.from || !data.to) return null;
    return data;
  } catch {
    return null;
  }
}
