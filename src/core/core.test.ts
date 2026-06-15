import { describe, it, expect } from 'vitest';
import { Store } from '../editor/store';
import { aabb, unionRect, rectsIntersect } from './transform';
import { computeResize, computeRotate } from './manipulate';
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

  it('fromJSON clears history so undo cannot revert into the old document', () => {
    const s = new Store();
    s.addObject({ html: '<b>a</b>', x: 0, y: 0 });
    const snapshot = s.toJSON();
    s.addObject({ html: '<b>b</b>', x: 0, y: 0 });
    expect(s.history.canUndo()).toBe(true);

    s.fromJSON(snapshot);
    expect(s.history.canUndo()).toBe(false);
    expect(s.history.canRedo()).toBe(false);
    const count = s.slide.objects.length;
    s.history.undo(); // no-op — must not mutate the freshly loaded doc
    expect(s.slide.objects.length).toBe(count);
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

  it('inline text edit (html patch) is undoable', () => {
    const s = new Store();
    const o = s.addObject({ html: '<p>old</p>', x: 0, y: 0 });
    s.patch(o.id, { html: '<p>new</p>' });
    expect(s.find(o.id)!.html).toBe('<p>new</p>');
    s.history.undo();
    expect(s.find(o.id)!.html).toBe('<p>old</p>');
    s.history.redo();
    expect(s.find(o.id)!.html).toBe('<p>new</p>');
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

  it('computeResize SE handle grows toward the pointer (unrotated)', () => {
    const o = createObject({ html: '', x: 0, y: 0, w: 100, h: 100 });
    expect(computeResize(o, 'se', { x: 150, y: 120 })).toEqual({ x: 0, y: 0, w: 150, h: 120 });
  });

  it('computeResize NW handle keeps the SE corner anchored', () => {
    const o = createObject({ html: '', x: 0, y: 0, w: 100, h: 100 });
    const r = computeResize(o, 'nw', { x: -10, y: -20 });
    expect(r).toEqual({ x: -10, y: -20, w: 110, h: 120 });
    expect(r.x + r.w).toBe(100); // SE corner unmoved
    expect(r.y + r.h).toBe(100);
  });

  it('computeResize holds the anchor fixed even when rotated 90°', () => {
    const o = createObject({ html: '', x: 0, y: 0, w: 100, h: 100, angle: 90 });
    const r = computeResize(o, 'se', { x: -60, y: 80 });
    expect(Math.round(r.x)).toBe(0); // NW anchor in slide space stays put
    expect(Math.round(r.y)).toBe(0);
    expect(Math.round(r.w)).toBe(80);
    expect(Math.round(r.h)).toBe(60);
  });

  it('computeRotate measures pointer angle around center', () => {
    const o = createObject({ html: '', x: 0, y: 0, w: 100, h: 100, angle: 0 });
    expect(computeRotate(o, { x: 50, y: 0 }, { x: 100, y: 50 })).toBeCloseTo(90);
    expect(computeRotate(o, { x: 50, y: 0 }, { x: 52, y: 0 }, 15) % 15).toBe(0); // snapped
  });
});

describe('grouping (M7)', () => {
  it('group binds the selection under one shared groupId, undoably', () => {
    const s = new Store();
    const a = s.addObject({ html: 'a' });
    const b = s.addObject({ html: 'b' });
    s.setSelection([a.id, b.id]);
    s.group();
    const gid = s.find(a.id)!.groupId;
    expect(gid).toBeTruthy();
    expect(s.find(b.id)!.groupId).toBe(gid);
    s.history.undo();
    expect(s.find(a.id)!.groupId).toBeNull();
  });

  it('selecting one grouped member expands to the whole group', () => {
    const s = new Store();
    const a = s.addObject({ html: 'a' });
    const b = s.addObject({ html: 'b' });
    const c = s.addObject({ html: 'c' });
    s.setSelection([a.id, b.id]);
    s.group();
    s.setSelection([a.id]);
    expect(s.selection).toEqual(new Set([a.id, b.id]));
    expect(s.selection.has(c.id)).toBe(false);
  });

  it('ungroup clears groupId on every member of the touched groups', () => {
    const s = new Store();
    const a = s.addObject({ html: 'a' });
    const b = s.addObject({ html: 'b' });
    s.setSelection([a.id, b.id]);
    s.group();
    s.ungroup();
    expect(s.find(a.id)!.groupId).toBeNull();
    expect(s.find(b.id)!.groupId).toBeNull();
  });
});
