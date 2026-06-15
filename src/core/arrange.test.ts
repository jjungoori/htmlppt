import { describe, it, expect } from 'vitest';
import { alignDeltas, distributeDeltas, reorderZ } from './arrange';
import { createObject, type SlideObject } from './model';

function obj(p: Partial<SlideObject>): SlideObject {
  return createObject({ html: '', ...p });
}

describe('alignDeltas', () => {
  it('aligns left edges to the leftmost object', () => {
    const a = obj({ id: 'a', x: 10, y: 0, w: 50, h: 50 });
    const b = obj({ id: 'b', x: 100, y: 0, w: 50, h: 50 });
    const m = alignDeltas([a, b], 'left');
    expect(m.get('a')).toBeUndefined(); // already at union left
    expect(m.get('b')).toEqual({ dx: -90, dy: 0 });
  });

  it('centers horizontally on the group center', () => {
    const a = obj({ id: 'a', x: 0, y: 0, w: 100, h: 20 });
    const b = obj({ id: 'b', x: 0, y: 0, w: 40, h: 20 });
    const m = alignDeltas([a, b], 'hcenter');
    // union center x = 50; b center = 20 → dx = 30
    expect(m.get('b')).toEqual({ dx: 30, dy: 0 });
  });

  it('is a no-op for a single object', () => {
    expect(alignDeltas([obj({ id: 'a' })], 'left').size).toBe(0);
  });
});

describe('distributeDeltas', () => {
  it('equalizes gaps horizontally, keeping the ends fixed', () => {
    const a = obj({ id: 'a', x: 0, y: 0, w: 10, h: 10 });
    const b = obj({ id: 'b', x: 30, y: 0, w: 10, h: 10 });
    const c = obj({ id: 'c', x: 100, y: 0, w: 10, h: 10 });
    const m = distributeDeltas([a, b, c], 'h');
    // span 0..110, sizes 30, gap = (110-30)/2 = 40 → b at x=50
    expect(m.get('a')).toBeUndefined();
    expect(m.get('c')).toBeUndefined();
    expect(m.get('b')).toEqual({ dx: 20, dy: 0 });
  });

  it('needs at least 3 objects', () => {
    expect(distributeDeltas([obj({ id: 'a' }), obj({ id: 'b' })], 'h').size).toBe(0);
  });
});

describe('reorderZ', () => {
  const mk = () => [
    obj({ id: 'a', zIndex: 0 }),
    obj({ id: 'b', zIndex: 1 }),
    obj({ id: 'c', zIndex: 2 }),
  ];

  it('brings the selection to the front', () => {
    const m = reorderZ(mk(), new Set(['a']), 'front');
    expect(m.get('a')).toBe(2);
    expect(m.get('b')).toBe(0);
    expect(m.get('c')).toBe(1);
  });

  it('sends the selection to the back', () => {
    const m = reorderZ(mk(), new Set(['c']), 'back');
    expect(m.get('c')).toBe(0);
    expect(m.get('a')).toBe(1);
    expect(m.get('b')).toBe(2);
  });

  it('moves one step forward', () => {
    const m = reorderZ(mk(), new Set(['a']), 'forward');
    expect(m.get('a')).toBe(1);
    expect(m.get('b')).toBe(0);
    expect(m.get('c')).toBeUndefined();
  });

  it('is a no-op when the selection is already at the front', () => {
    expect(reorderZ(mk(), new Set(['c']), 'forward').size).toBe(0);
  });
});
