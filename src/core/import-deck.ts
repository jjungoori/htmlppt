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
 * opacity,zIndex}` from the exported markup, plus the object's animation specs
 * from export's `data-sc-anim` JSON stamp.
 *
 * Two-phase like {@link import}: {@link parseObjectStyle}/{@link placeDeck} are
 * pure (regex over the style strings, unit-testable without a DOM) and
 * {@link extractDeck} is the browser-only DOMParser adapter.
 */
import type { ObjectInit } from './shapes';
import {
  createObject,
  createSlide,
  normalizeAnimation,
  parseDocument,
  type AnimationSpec,
  type SlideDocument,
  type SlideMaster,
} from './model';

/** One raw exported object: its inline style + untouched inner HTML. */
export interface RawDeckObject {
  style: string;
  html: string;
  /** JSON from export's `data-sc-anim` (already attribute-unescaped), if any. */
  anim?: string;
  /** Placeholder key from export's `data-sc-ph` (M21), if any. */
  placeholder?: string;
}

/**
 * Parse export's `data-sc-anim` JSON back into validated animation specs. Pure
 * and defensive: any malformed JSON / non-array / bad entry is dropped so a
 * corrupted attribute can't break re-import. Inverts the `data-sc-anim` stamp.
 */
export function parseAnimations(anim: string | undefined): AnimationSpec[] {
  if (!anim) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(anim);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeAnimation).filter((a): a is AnimationSpec => a !== null);
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
    objs.map((o) => {
      const init: ObjectInit = { ...parseObjectStyle(o.style), html: o.html };
      const animations = parseAnimations(o.anim);
      if (animations.length) init.animations = animations;
      if (o.placeholder) init.placeholder = o.placeholder;
      return init;
    }),
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
      anim: el.getAttribute('data-sc-anim') ?? undefined,
      placeholder: el.getAttribute('data-sc-ph') ?? undefined,
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

/**
 * Fully re-import a SlideCraft-exported deck into a {@link SlideDocument},
 * restoring not just per-object transforms but the document-level metadata
 * (`width`/`height`/`themeId`) that export stamps on `<body data-sc-*>`. This
 * is the lossless inverse of {@link exportHTML}: `exportHTML(importDeckDocument
 * (exportHTML(doc)))` is stable. Browser-only (DOMParser); falls back to
 * `createDocument` defaults for any absent metadata. An empty deck yields one
 * empty slide so the document satisfies the "at least one slide" invariant.
 */
export function importDeckDocument(html: string): SlideDocument {
  if (typeof DOMParser === 'undefined') {
    throw new Error('importDeckDocument requires a DOM environment (DOMParser).');
  }
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const num = (attr: string, fallback: number): number => {
    const n = Number(body.getAttribute(attr));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const themeId = body.getAttribute('data-sc-theme') ?? undefined;
  const sections = Array.from(body.querySelectorAll(':scope > .sc-slide'));
  // Per-slide speaker notes from the hidden `.sc-notes` aside (M14), aligned by
  // slide order with the extracted objects so the roundtrip is lossless.
  const notes = sections.map(
    (slide) => slide.querySelector(':scope > .sc-notes')?.textContent ?? '',
  );
  // Inherited master id per slide (M21), from the section `data-sc-master` stamp.
  const masterIds = sections.map((slide) => slide.getAttribute('data-sc-master') ?? undefined);
  const initSlides = placeDeck(extractDeck(html));
  const slides = (initSlides.length ? initSlides : [[]]).map((objs, i) =>
    createSlide({ objects: objs.map(createObject), notes: notes[i], masterId: masterIds[i] }),
  );
  // Slide masters (M21) from the body `data-sc-masters` JSON stamp. Run through
  // parseDocument as a throwaway carrier so each master object is rebuilt/
  // validated by the same path as document objects; malformed JSON degrades to
  // no masters rather than throwing.
  const masters = parseMasters(body.getAttribute('data-sc-masters'));
  return {
    version: 1,
    width: num('data-sc-width', 1280),
    height: num('data-sc-height', 720),
    slides,
    ...(themeId ? { themeId } : {}),
    ...(masters.length ? { masters } : {}),
  };
}

/** Parse export's `data-sc-masters` JSON back into validated masters (M21). */
function parseMasters(json: string | null): SlideMaster[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  // Reuse parseDocument's master validation by wrapping in a minimal doc.
  return parseDocument({ version: 1, slides: [{ objects: [] }], masters: raw }).masters ?? [];
}
