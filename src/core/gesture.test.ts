import { describe, it, expect } from 'vitest';
import { gestureFromPointers, applyGesture } from './gesture';
import { createObject } from './model';
import type { Point } from './transform';

const P = (x: number, y: number): Point => ({ x, y });

describe('gestureFromPointers', () => {
  it('reads pure pan from a parallel translation of both fingers', () => {
    const g = gestureFromPointers(P(0, 0), P(10, 0), P(5, 3), P(15, 3));
    expect(g.pan).toEqual({ x: 5, y: 3 });
    expect(g.scale).toBeCloseTo(1);
    expect(g.rotate).toBeCloseTo(0);
    expect(g.pivot).toEqual({ x: 5, y: 0 });
  });

  it('reads a pinch as the ratio of finger distances', () => {
    const g = gestureFromPointers(P(0, 0), P(10, 0), P(0, 0), P(20, 0));
    expect(g.scale).toBeCloseTo(2);
    expect(g.pan).toEqual({ x: 5, y: 0 }); // centroid 5 → 10
  });

  it('reads a twist as the signed change in the finger-line angle', () => {
    // line 0°→90° (b rotates from +x to +y about the centroid)
    const g = gestureFromPointers(P(-10, 0), P(10, 0), P(0, -10), P(0, 10));
    expect(g.rotate).toBeCloseTo(90);
    expect(g.scale).toBeCloseTo(1);
  });

  it('takes the shortest signed path across the ±180° seam', () => {
    // 170° → -170° is a +20° twist, not -340°
    const g = gestureFromPointers(P(0, 0), P(-100, 17.6), P(0, 0), P(-100, -17.6));
    expect(g.rotate).toBeGreaterThan(0);
    expect(g.rotate).toBeLessThan(45);
  });

  it('degrades to identity scale/rotate when fingers start coincident', () => {
    const g = gestureFromPointers(P(5, 5), P(5, 5), P(5, 5), P(40, 5));
    expect(g.scale).toBe(1);
    expect(g.rotate).toBe(0);
  });
});

describe('applyGesture', () => {
  const obj = () =>
    createObject({ html: '<div></div>', x: 0, y: 0, w: 100, h: 100, angle: 0, scaleX: 1, scaleY: 1 });

  it('translates the object center by the pan', () => {
    const g = gestureFromPointers(P(0, 0), P(10, 0), P(7, -4), P(17, -4));
    const patch = applyGesture(obj(), g);
    // center 50,50 → 57,46 → top-left
    expect(patch.x).toBeCloseTo(7);
    expect(patch.y).toBeCloseTo(-4);
    expect(patch.scaleX).toBeCloseTo(1);
    expect(patch.angle).toBeCloseTo(0);
  });

  it('multiplies object scale by the pinch factor', () => {
    const g = gestureFromPointers(P(0, 0), P(10, 0), P(0, 0), P(30, 0));
    const patch = applyGesture(obj(), g);
    expect(patch.scaleX).toBeCloseTo(3);
    expect(patch.scaleY).toBeCloseTo(3);
  });

  it('adds the twist to the object angle', () => {
    const g = gestureFromPointers(P(-10, 0), P(10, 0), P(0, -10), P(0, 10));
    const patch = applyGesture(obj(), g);
    expect(patch.angle).toBeCloseTo(90);
  });

  it('scales the center around the pivot, not the object center', () => {
    // pivot at origin (centroid 0,0); doubling pushes center 50,50 → 100,100
    const g = gestureFromPointers(P(-10, -10), P(10, 10), P(-20, -20), P(20, 20));
    const patch = applyGesture(obj(), g);
    expect(patch.scaleX).toBeCloseTo(2);
    expect(patch.x).toBeCloseTo(50); // center 100 - w/2 50
    expect(patch.y).toBeCloseTo(50);
  });

  it('is identity for a null gesture (same start and current samples)', () => {
    const g = gestureFromPointers(P(0, 0), P(10, 10), P(0, 0), P(10, 10));
    const patch = applyGesture(obj(), g);
    expect(patch.x).toBeCloseTo(0);
    expect(patch.y).toBeCloseTo(0);
    expect(patch.scaleX).toBeCloseTo(1);
    expect(patch.angle).toBeCloseTo(0);
  });
});
