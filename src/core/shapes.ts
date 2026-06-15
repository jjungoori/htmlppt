/**
 * M6 — shape & image content factories.
 *
 * In SlideCraft's hybrid model an object is a transform box wrapping an HTML
 * slot, so shapes and images need no new model fields: a shape is an inline
 * SVG that fills the box (preserveAspectRatio="none" so it tracks resize), and
 * an image is an `<img>` that fills the box. These helpers return the
 * `addObject`/`importHTML` init payload — content + a sensible default box.
 */
import type { SlideObject } from './model';

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'line';

export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** corner radius for rect, as a fraction 0..1 of the shorter side. */
  radius?: number;
}

/** Init payload accepted by Store.addObject / Editor.importHTML. */
export type ObjectInit = Partial<SlideObject> & { html: string };

const DEFAULTS: Required<ShapeStyle> = {
  fill: '#4f80ff',
  stroke: '#1b2a4a',
  strokeWidth: 2,
  radius: 0,
};

/**
 * Build the inner SVG markup for a shape on a 0..100 viewBox. The SVG is sized
 * 100% × 100% with non-uniform scaling so it always fills the object box.
 */
export function shapeSvg(kind: ShapeKind, style: ShapeStyle = {}): string {
  const s = { ...DEFAULTS, ...style };
  const sw = s.strokeWidth;
  // Inset by half the stroke so the outline isn't clipped at the box edge.
  const o = sw / 2;
  const max = 100 - sw / 2;
  const common = `fill="${kind === 'line' ? 'none' : s.fill}" stroke="${s.stroke}" stroke-width="${sw}"`;
  let body: string;
  switch (kind) {
    case 'rect': {
      const r = Math.max(0, Math.min(0.5, s.radius)) * (100 - sw);
      body = `<rect x="${o}" y="${o}" width="${100 - sw}" height="${100 - sw}" rx="${r}" ry="${r}" ${common}/>`;
      break;
    }
    case 'ellipse':
      body = `<ellipse cx="50" cy="50" rx="${50 - o}" ry="${50 - o}" ${common}/>`;
      break;
    case 'triangle':
      body = `<polygon points="50,${o} ${max},${max} ${o},${max}" ${common}/>`;
      break;
    case 'line':
      body = `<line x1="${o}" y1="50" x2="${max}" y2="50" ${common} stroke-linecap="round"/>`;
      break;
  }
  return `<svg class="sc-shape" data-shape="${kind}" viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

/** Create a shape object init (default 200×120 box at origin). */
export function createShape(kind: ShapeKind, style: ShapeStyle = {}, box: Partial<SlideObject> = {}): ObjectInit {
  return {
    w: kind === 'line' ? 240 : 200,
    h: kind === 'line' ? 8 : 120,
    ...box,
    html: shapeSvg(kind, style),
  };
}

export interface ImageOptions {
  alt?: string;
  /** object-fit for the <img>; defaults to 'fill' so it tracks the box. */
  fit?: 'fill' | 'contain' | 'cover';
}

const ATTR_ESCAPES: Record<string, string> = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' };
function escAttr(v: string): string {
  return v.replace(/[&"<>]/g, (c) => ATTR_ESCAPES[c]);
}

/** Create an image object init from a URL or data URI. */
export function createImage(src: string, box: Partial<SlideObject> = {}, opts: ImageOptions = {}): ObjectInit {
  const fit = opts.fit ?? 'fill';
  const alt = escAttr(opts.alt ?? '');
  const html =
    `<img class="sc-image" src="${escAttr(src)}" alt="${alt}" draggable="false" ` +
    `style="width:100%;height:100%;object-fit:${fit};display:block;"/>`;
  return { w: 320, h: 240, ...box, html };
}
