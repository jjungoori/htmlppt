/**
 * Slide masters & layout inheritance (M21).
 *
 * A {@link SlideMaster} carries shared background/decoration objects plus named
 * *placeholders* (objects with a `placeholder` key). A slide that references a
 * master by `masterId` inherits all of it: the master's plain objects are
 * painted behind the slide's own content, and each master placeholder defines a
 * default geometry slot that a same-keyed slide object *fills*.
 *
 * This module is pure and DOM-less — it computes an effective render list and
 * provides non-destructive document/master edit ops (consumed through the
 * command layer so master edits are undoable and the export round-trip stays
 * lossless). It never mutates inputs.
 */
import { createMaster, type SlideDocument, type SlideMaster, type SlideObject } from './model';

/** Geometry fields a placeholder contributes to the slide object that fills it. */
const INHERITED_FIELDS = ['x', 'y', 'w', 'h', 'angle', 'scaleX', 'scaleY'] as const;

/** Look up a master by id (or `undefined`). */
export function getMaster(doc: SlideDocument, id: string | undefined): SlideMaster | undefined {
  if (!id || !doc.masters) return undefined;
  return doc.masters.find((m) => m.id === id);
}

/**
 * Resolve the effective, paint-ordered object list for `slide` against the
 * document's masters. Pure: returns fresh objects, never mutating slide/master.
 *
 * Layering:
 *  - Master objects render *behind* slide objects. To keep that ordering robust
 *    regardless of authored zIndex, master objects are emitted first and their
 *    zIndex normalized into a band strictly below the slide's lowest zIndex.
 *  - A master *placeholder* whose key is filled by a slide object is dropped
 *    (the slide object replaces it); the slide object inherits the placeholder's
 *    geometry for any field it left at the createObject default. Unfilled
 *    placeholders render as-is (acting as the visible prompt/default content).
 *
 * A slide with no master (or an unknown id) resolves to its own objects.
 */
export function resolveSlideObjects(doc: SlideDocument, slideIndex: number): SlideObject[] {
  const slide = doc.slides[slideIndex];
  if (!slide) return [];
  const master = getMaster(doc, slide.masterId);
  if (!master) return slide.objects.map((o) => ({ ...o }));

  const filledKeys = new Set(
    slide.objects.map((o) => o.placeholder).filter((k): k is string => !!k),
  );
  const placeholderByKey = new Map<string, SlideObject>();
  for (const o of master.objects) if (o.placeholder) placeholderByKey.set(o.placeholder, o);

  // Master layer: keep decoration + any unfilled placeholders, drop filled ones.
  const masterLayer = master.objects.filter(
    (o) => !(o.placeholder && filledKeys.has(o.placeholder)),
  );

  // Normalize master zIndex into a band below the slide's lowest zIndex so the
  // shared background never paints over slide content.
  const minSlideZ = slide.objects.reduce((m, o) => Math.min(m, o.zIndex), 0);
  const band = minSlideZ - masterLayer.length;
  const masterResolved = masterLayer.map((o, i) => ({ ...o, zIndex: band + i }));

  const slideResolved = slide.objects.map((o) => {
    const ph = o.placeholder ? placeholderByKey.get(o.placeholder) : undefined;
    return ph ? inheritGeometry(o, ph) : { ...o };
  });

  return [...masterResolved, ...slideResolved];
}

/**
 * Fill `obj` with `ph`'s geometry for any field still at its createObject
 * default — letting a placeholder define position/size that the slide content
 * adopts unless the author explicitly moved/resized it.
 */
function inheritGeometry(obj: SlideObject, ph: SlideObject): SlideObject {
  const out: SlideObject = { ...obj };
  const defaults: Record<(typeof INHERITED_FIELDS)[number], number> = {
    x: 0,
    y: 0,
    w: 200,
    h: 120,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
  };
  for (const f of INHERITED_FIELDS) {
    if (out[f] === defaults[f]) out[f] = ph[f];
  }
  return out;
}

// ---- Non-destructive document/master edit ops (command-layer friendly) ----

/** Add a master to the document (returns a new document). */
export function addMaster(doc: SlideDocument, master: SlideMaster): SlideDocument {
  return { ...doc, masters: [...(doc.masters ?? []), master] };
}

/** Remove a master and detach any slides that referenced it. */
export function removeMaster(doc: SlideDocument, id: string): SlideDocument {
  const masters = (doc.masters ?? []).filter((m) => m.id !== id);
  const slides = doc.slides.map((s) => {
    if (s.masterId !== id) return s;
    const { masterId: _drop, ...rest } = s;
    return rest;
  });
  const out: SlideDocument = { ...doc, slides };
  if (masters.length) out.masters = masters;
  else delete out.masters;
  return out;
}

/** Replace a master in place by id (returns a new document). */
export function updateMaster(doc: SlideDocument, master: SlideMaster): SlideDocument {
  return {
    ...doc,
    masters: (doc.masters ?? []).map((m) => (m.id === master.id ? master : m)),
  };
}

/** Set (or clear, with `null`) the master a slide inherits from. */
export function setSlideMaster(
  doc: SlideDocument,
  slideIndex: number,
  masterId: string | null,
): SlideDocument {
  const slides = doc.slides.map((s, i) => {
    if (i !== slideIndex) return s;
    if (masterId === null) {
      const { masterId: _drop, ...rest } = s;
      return rest;
    }
    return { ...s, masterId };
  });
  return { ...doc, slides };
}

/**
 * Create a master from an existing slide's objects (a common authoring path:
 * "make this slide the layout"). Objects are deep-copied so later slide edits
 * don't mutate the master.
 */
export function masterFromSlide(doc: SlideDocument, slideIndex: number, name?: string): SlideMaster {
  const slide = doc.slides[slideIndex];
  const objects = slide ? slide.objects.map((o) => ({ ...o })) : [];
  return createMaster({ name, objects });
}
