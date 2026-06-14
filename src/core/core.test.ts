import { describe, it, expect } from 'vitest';
import { Store } from '../editor/store';
import { aabb, unionRect, rectsIntersect } from './transform';
import { createObject } from './model';

describe('Store + History invariants', () => {
  it('add/undo/redo round-trips object count', () => {
    const s = new Store();
    expect(s.slide.objects.length).toBe(0);
    s.addObject({ html: '<b>hi</b>', x: 10, y: 10 });
    expect(s.slide.objects.length).toBe(1);
    s.history.undo();
    expect(s.slide.objects.length).toBe(0);
    s.history.redo();
    expect(s.slide.objects.length).toBe(1);
  });

  it('patch is undoable and restores prior values', () => {
    const s = new Store();
    const o = s.addObject({ html: 'x', x: 0, y: 0 });
    s.patch(o.id, { x: 100, y: 50 });
    expect(s.find(o.id)!.x).toBe(100);
    s.history.undo();
    expect(s.find(o.id)!.x).toBe(0);
    expect(s.find(o.id)!.y).toBe(0);
  });

  it('coalesced drag patches collapse into one undo entry', () => {
    const s = new Store();
    const o = s.addObject({ html: 'x', x: 0, y: 0 });
    for (let dx = 1; dx <= 10; dx++) s.patch(o.id, { x: dx }, 'drag-1');
    expect(s.find(o.id)!.x).toBe(10);
    s.history.undo(); // undo whole drag
    expect(s.find(o.id)!.x).toBe(0);
    s.history.undo(); // undo the add
    expect(s.slide.objects.length).toBe(0);
  });

  it('toJSON/fromJSON round-trips the document', () => {
    const s = new Store();
    s.addObject({ html: '<p>keep me</p>', x: 5, y: 6, w: 100, h: 40 });
    const json = s.toJSON();
    const s2 = new Store();
    s2.fromJSON(json);
    expect(s2.slide.objects[0].html).toBe('<p>keep me</p>');
    expect(s2.slide.objects[0].x).toBe(5);
  });

  it('aabb grows for a rotated object', () => {
    const o = createObject({ html: '', x: 0, y: 0, w: 100, h: 100, angle: 45 });
    const box = aabb(o);
    expect(box.w).toBeGreaterThan(100);
    expect(Math.round(box.w)).toBe(Math.round(100 * Math.SQRT2));
  });

  it('unionRect spans all input rects', () => {
    const u = unionRect([
      { x: 10, y: 10, w: 20, h: 20 },
      { x: 50, y: 5, w: 10, h: 40 },
    ]);
    expect(u).toEqual({ x: 10, y: 5, w: 50, h: 40 });
    expect(unionRect([])).toBeNull();
  });

  it('rectsIntersect detects overlap and separation (marquee hit-test)', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(rectsIntersect(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true);
    expect(rectsIntersect(a, { x: 200, y: 0, w: 10, h: 10 })).toBe(false);
  });
});
