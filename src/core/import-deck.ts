/**
 * Round-trip importer for SlideCraft's own exported decks.
 *
 * {@link exportHTML} serializes a {@link SlideDocument} into a standalone page
 * where every slide is a `<section class="sc-slide">` and every object a
 * `<div class="sc-object" style="...">html</div>` placed by the single-transform
 * convention. `importHTMLDocument` can't faithfully re-import that output — it
 * would treat each whole slide section as one grid-placed object, discarding the
 * per-object transforms and the multi-slide structure. This module closes the
 * loop: it reconstructs the slides and each object's `{x,y,w,h,angle,scale,
 * opacity,zIndex}` from the exported markup.
 *
 * Two-phase like {@link import}: {@link parseObjectStyle}/{@link placeDeck} are
 * pure (regex over the style strings, unit-testable without a DOM) and
 * {@link extractDeck} is the browser-only DOMParser adapter.
 */
import type { ObjectInit } from './shapes';

/** One raw exported object: its inline style + untouched inner HTML. */
export interface RawDeckObject {
  style: string;
  html: string;
}

/** Pull the first capture group as a finite number, or `undefined`. */
function num(style: string, re: RegExp): number | undefined {
  const m = re.exec(style);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse the inline style emitted by export's `renderObject` back into transform
 * init fields. Only fields present (and finite) are returned, so missing ones
 * fall back to `createObject` defaults downstream. Inverts:
 * `width/height/transform:translate(..) rotate(..) scale(..)/opacity/z-index`.
 */
export function parseObjectStyle(style: string): Partial<ObjectInit> {
  const out: Partial<ObjectInit> = {};
  const w = num(style, /width:\s*(-?[\d.]+)px/);
  const h = num(style, /height:\s*(-?[\d.]+)px/);
  const translate = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(style);
  const angle = num(style, /rotate\(\s*(-?[\d.]+)deg\s*\)/);
  const scale = /scale\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/.exec(style);
  const opacity = num(style, /opacity:\s*(-?[\d.]+)/);
  const zIndex = num(style, /z-index:\s*(-?\d+)/);

  if (w !== undefined) out.w = w;
  if (h !== undefined) out.h = h;
  if (translate) {
    const x = Number(translate[1]);
    const y = Number(translate[2]);
    if (Number.isFinite(x)) out.x = x;
    if (Number.isFinite(y)) out.y = y;
  }
  if (angle !== undefined) out.angle = angle;
  if (scale) {
    const sx = Number(scale[1]);
    const sy = Number(scale[2]);
    if (Number.isFinite(sx)) out.scaleX = sx;
    if (Number.isFinite(sy)) out.scaleY = sy;
  }
  if (opacity !== undefined) out.opacity = opacity;
  if (zIndex !== undefined) out.zIndex = zIndex;
  return out;
}

/**
 * Turn raw per-slide objects into per-slide init payloads, preserving each
 * object's untouched HTML and its parsed transform. Pure — no DOM needed.
 */
export function placeDeck(rawSlides: RawDeckObject[][]): ObjectInit[][] {
  return rawSlides.map((objs) =>
    objs.map((o) => ({ ...parseObjectStyle(o.style), html: o.html })),
  );
}

/**
 * Extract each `.sc-slide`'s `.sc-object` boxes (style + untouched innerHTML)
 * from an exported deck string. Browser-only: requires a global `DOMParser`.
 *
 * Scoped to *direct* children (`:scope >`): export places slides directly under
 * `<body>` and objects directly under their slide, while object HTML is the
 * user's arbitrary markup emitted byte-for-byte — which may itself contain
 * `.sc-slide`/`.sc-object` (e.g. re-importing a deck whose objects embed
 * exported markup). A descendant query would mis-detect that nested markup as
 * spurious top-level slides/objects, so we only walk the structural children.
 */
export function extractDeck(html: string): RawDeckObject[][] {
  if (typeof DOMParser === 'undefined') {
    throw new Error('extractDeck requires a DOM environment (DOMParser).');
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(parsed.body.querySelectorAll(':scope > .sc-slide')).map((slide) =>
    Array.from(slide.querySelectorAll(':scope > .sc-object')).map((el) => ({
      style: el.getAttribute('style') ?? '',
      html: (el as HTMLElement).innerHTML,
    })),
  );
}

/**
 * Re-import a SlideCraft-exported deck into per-slide init payloads, restoring
 * object transforms (extract + parse). The inverse of {@link exportHTML}.
 */
export function importDeck(html: string): ObjectInit[][] {
  return placeDeck(extractDeck(html));
}
