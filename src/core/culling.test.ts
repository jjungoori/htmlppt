import { describe, it, expect } from 'vitest';
import {
  expandRect,
  cullObjects,
  buildSpatialGrid,
  queryGrid,
} from './culling';
import { createObject } from './model';
import type { SlideObject } from './model';
import type { Rect } from './transform';

const obj = (x: number, y: number, w = 100, h = 100, extra: Partial<SlideObject> = {}) =>
  createObject({ html: '<div></div>', x, y, w, h, ...extra });

const VIEW: Rect = { x: 0, y: 0, w: 500, h: 500 };

describe('expandRect', () => {
  it('grows on every side by margin', () => {
    expect(expandRect({ x: 10, y: 20, w: 30, h: 40 }, 5)).toEqual({
      x: 5,
      y: 15,
      w: 40,
      h: 50,
    });
  });
});

describe('cullObjects', () => {
  it('keeps overlapping objects and drops off-screen ones, preserving order', () => {
    const a = obj(10, 10); // inside
    const b = obj(900, 900); // far away
    const c = obj(450, 450); // straddles bottom-right edge
    const out = cullObjects([a, b, c], VIEW);
    expect(out).toEqual([a, c]);
  });

  it('margin pulls in nearby objects via a halo', () => {
    const near = obj(520, 10, 100, 100); // 20px past the right edge
    expect(cullObjects([near], VIEW)).toEqual([]);
    expect(cullObjects([near], VIEW, 50)).toEqual([near]);
  });

  it('accounts for rotation via the AABB', () => {
    // a thin tall object just off the right edge whose rotation swings it in
    const o = obj(480, 240, 20, 200, { angle: 90 });
    // rotated AABB spans ~x[390,590] so it overlaps the viewport edge
    expect(cullObjects([o], VIEW)).toEqual([o]);
  });
});

describe('spatial grid', () => {
  it('rejects a non-positive cell size', () => {
    expect(() => buildSpatialGrid([], 0)).toThrow(RangeError);
  });

  it('matches cullObjects on a random-ish scatter', () => {
    const objs: SlideObject[] = [];
    for (let i = 0; i < 200; i++) {
      const x = (i * 137) % 2000;
      const y = (i * 251) % 2000;
      objs.push(obj(x, y, 80, 60));
    }
    const grid = buildSpatialGrid(objs, 128);
    const view: Rect = { x: 300, y: 300, w: 600, h: 400 };
    const linear = cullObjects(objs, view);
    const viaGrid = queryGrid(grid, objs, view);
    expect(viaGrid).toEqual(linear);
  });

  it('preserves input order and de-duplicates objects spanning many cells', () => {
    const big = obj(0, 0, 400, 400); // spans many cells at cellSize 64
    const small = obj(100, 100, 20, 20);
    const objs = [big, small];
    const grid = buildSpatialGrid(objs, 64);
    const out = queryGrid(grid, objs, { x: 50, y: 50, w: 200, h: 200 });
    expect(out).toEqual([big, small]); // each appears once, input order
  });

  it('honors margin like the linear path', () => {
    const near = obj(520, 10, 100, 100);
    const grid = buildSpatialGrid([near], 128);
    expect(queryGrid(grid, [near], VIEW)).toEqual([]);
    expect(queryGrid(grid, [near], VIEW, 50)).toEqual([near]);
  });
});
