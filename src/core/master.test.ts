import { describe, it, expect } from 'vitest';
import { createDocument, createMaster, createObject, createSlide, parseDocument } from './model';
import {
  addMaster,
  getMaster,
  masterFromSlide,
  removeMaster,
  resolveSlideObjects,
  setSlideMaster,
  updateMaster,
} from './master';

function obj(id: string, over: Partial<Parameters<typeof createObject>[0]> = {}) {
  return createObject({ id, html: `<div>${id}</div>`, ...over });
}

function docWithMaster(masterObjects: ReturnType<typeof createObject>[], slide = createSlide()) {
  const master = createMaster({ id: 'm1', name: 'Base', objects: masterObjects });
  return {
    version: 1 as const,
    width: 1280,
    height: 720,
    slides: [{ ...slide, masterId: 'm1' }],
    masters: [master],
  };
}

describe('resolveSlideObjects — layering', () => {
  it('returns own objects when the slide has no master', () => {
    const doc = createDocument();
    doc.slides[0].objects = [obj('a')];
    expect(resolveSlideObjects(doc, 0).map((o) => o.id)).toEqual(['a']);
  });

  it('paints master objects behind slide objects (lower zIndex band)', () => {
    const slide = createSlide({ objects: [obj('s1', { zIndex: 0 }), obj('s2', { zIndex: 5 })] });
    const doc = docWithMaster([obj('bg1'), obj('bg2')], slide);
    const resolved = resolveSlideObjects(doc, 0);
    expect(resolved.map((o) => o.id)).toEqual(['bg1', 'bg2', 's1', 's2']);
    const minSlide = Math.min(...resolved.filter((o) => o.id.startsWith('s')).map((o) => o.zIndex));
    for (const m of resolved.filter((o) => o.id.startsWith('bg'))) {
      expect(m.zIndex).toBeLessThan(minSlide);
    }
  });

  it('does not mutate the source slide or master', () => {
    const slide = createSlide({ objects: [obj('s1')] });
    const doc = docWithMaster([obj('bg', { zIndex: 9 })], slide);
    resolveSlideObjects(doc, 0);
    expect(doc.masters[0].objects[0].zIndex).toBe(9);
  });
});

describe('resolveSlideObjects — placeholders', () => {
  it('a filled placeholder suppresses the master placeholder and inherits geometry', () => {
    const ph = obj('mt', { placeholder: 'title', x: 40, y: 30, w: 600, h: 80 });
    const fill = obj('st', { placeholder: 'title' }); // default geometry
    const slide = createSlide({ objects: [fill] });
    const doc = docWithMaster([ph], slide);
    const resolved = resolveSlideObjects(doc, 0);
    // master placeholder dropped, slide object remains and inherited geometry
    expect(resolved.map((o) => o.id)).toEqual(['st']);
    expect(resolved[0]).toMatchObject({ x: 40, y: 30, w: 600, h: 80 });
  });

  it('an unfilled placeholder renders as the default prompt', () => {
    const ph = obj('mt', { placeholder: 'title', x: 40 });
    const slide = createSlide({ objects: [obj('s1')] });
    const doc = docWithMaster([ph], slide);
    const ids = resolveSlideObjects(doc, 0).map((o) => o.id);
    expect(ids).toContain('mt');
    expect(ids).toContain('s1');
  });

  it('does not override geometry the author explicitly set', () => {
    const ph = obj('mt', { placeholder: 'title', x: 40, y: 30 });
    const fill = obj('st', { placeholder: 'title', x: 999 }); // explicit x
    const doc = docWithMaster([ph], createSlide({ objects: [fill] }));
    const resolved = resolveSlideObjects(doc, 0);
    expect(resolved[0].x).toBe(999); // kept
    expect(resolved[0].y).toBe(30); // inherited (was default 0)
  });
});

describe('document/master edit ops', () => {
  it('addMaster / getMaster / updateMaster', () => {
    let doc = createDocument();
    const m = createMaster({ id: 'm9', name: 'A' });
    doc = addMaster(doc, m);
    expect(getMaster(doc, 'm9')?.name).toBe('A');
    doc = updateMaster(doc, { ...m, name: 'B' });
    expect(getMaster(doc, 'm9')?.name).toBe('B');
  });

  it('setSlideMaster sets and clears the reference', () => {
    let doc = addMaster(createDocument(), createMaster({ id: 'm1' }));
    doc = setSlideMaster(doc, 0, 'm1');
    expect(doc.slides[0].masterId).toBe('m1');
    doc = setSlideMaster(doc, 0, null);
    expect(doc.slides[0].masterId).toBeUndefined();
  });

  it('removeMaster detaches referencing slides', () => {
    let doc = addMaster(createDocument(), createMaster({ id: 'm1' }));
    doc = setSlideMaster(doc, 0, 'm1');
    doc = removeMaster(doc, 'm1');
    expect(doc.masters).toBeUndefined();
    expect(doc.slides[0].masterId).toBeUndefined();
  });

  it('masterFromSlide deep-copies the slide objects', () => {
    const doc = createDocument();
    doc.slides[0].objects = [obj('a', { x: 5 })];
    const m = masterFromSlide(doc, 0, 'Captured');
    expect(m.name).toBe('Captured');
    m.objects[0].x = 99;
    expect(doc.slides[0].objects[0].x).toBe(5); // untouched
  });
});

describe('parseDocument — masters', () => {
  it('validates and rebuilds masters and slide.masterId', () => {
    const parsed = parseDocument({
      version: 1,
      slides: [{ objects: [{ html: '<p>x</p>' }], masterId: 'm1' }],
      masters: [{ id: 'm1', name: 'Base', objects: [{ html: '<b>bg</b>', placeholder: 'title' }] }],
    });
    expect(parsed.masters).toHaveLength(1);
    expect(parsed.masters?.[0].objects[0].placeholder).toBe('title');
    expect(parsed.slides[0].masterId).toBe('m1');
  });
});
