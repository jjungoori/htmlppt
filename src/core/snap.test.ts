import { describe, it, expect } from 'vitest';
import { computeSnap, SNAP_THRESHOLD } from './snap';
import type { Rect } from './transform';

const slide = { width: 1000, height: 600 };

describe('computeSnap', () => {
  it('snaps left edge to a target left edge within threshold', () => {
    const moving: Rect = { x: 103, y: 200, w: 50, h: 50 };
    const target: Rect = { x: 100, y: 400, w: 80, h: 80 };
    const r = computeSnap(moving, [target], slide);
    expect(r.dx).toBe(-3); // 100 - 103
    expect(r.guides).toContainEqual({ axis: 'x', pos: 100 });
  });

  it('does not snap beyond threshold', () => {
    const moving: Rect = { x: 100 + SNAP_THRESHOLD + 1, y: 200, w: 50, h: 50 };
    const r = computeSnap(moving, [{ x: 100, y: 400, w: 80, h: 80 }], slide);
    expect(r.dx).toBe(0);
    expect(r.guides.length).toBe(0);
  });

  it('snaps center to slide center', () => {
    // moving center x = 503 → slide center 500.
    const moving: Rect = { x: 503 - 25, y: 100, w: 50, h: 50 };
    const r = computeSnap(moving, [], slide);
    expect(r.dx).toBe(-3);
    expect(r.guides).toContainEqual({ axis: 'x', pos: 500 });
  });

  it('snaps both axes independently', () => {
    const moving: Rect = { x: 2, y: 4, w: 50, h: 50 };
    const r = computeSnap(moving, [], slide); // snap to slide top-left (0,0)
    expect(r.dx).toBe(-2);
    expect(r.dy).toBe(-4);
    expect(r.guides.length).toBe(2);
  });

  it('picks the nearest candidate when several are close', () => {
    const moving: Rect = { x: 98, y: 0, w: 10, h: 10 }; // right edge = 108
    // target A left at 100 (dist 2), target B left at 105 (dist 7 > thr from x=98)
    const r = computeSnap(moving, [{ x: 100, y: 300, w: 10, h: 10 }], slide);
    expect(r.dx).toBe(2); // left edge 98 → 100
  });
});
