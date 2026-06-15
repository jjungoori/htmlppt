import { describe, it, expect } from 'vitest';
import { placeImports } from './import';
import { createDocument } from './model';

const doc = createDocument(1280, 720);

describe('placeImports', () => {
  it('returns one payload per fragment, html untouched', () => {
    const frags = ['<h1>A</h1>', '<p class="x">B</p>'];
    const out = placeImports(frags, doc);
    expect(out.map((o) => o.html)).toEqual(frags);
  });

  it('returns [] for empty input', () => {
    expect(placeImports([], doc)).toEqual([]);
  });

  it('lays a single fragment into the padded full area', () => {
    const [o] = placeImports(['<x/>'], doc, { padding: 48 });
    expect(o.x).toBe(48);
    expect(o.y).toBe(48);
    expect(o.w).toBe(1280 - 96);
    expect(o.h).toBe(720 - 96);
  });

  it('grids by ceil(sqrt(n)) columns by default', () => {
    const frags = Array.from({ length: 4 }, (_, i) => `<i>${i}</i>`);
    const out = placeImports(frags, doc, { padding: 0, gap: 0 });
    // 2x2 grid: cells are 640x360.
    expect(out.map((o) => [o.x, o.y])).toEqual([
      [0, 0],
      [640, 0],
      [0, 360],
      [640, 360],
    ]);
    expect(out[0].w).toBe(640);
    expect(out[0].h).toBe(360);
  });

  it('honors explicit cols and applies gaps between cells', () => {
    const frags = ['a', 'b'];
    const out = placeImports(frags, doc, { cols: 2, padding: 0, gap: 40 });
    expect(out[0].x).toBe(0);
    expect(out[1].x).toBe((1280 - 40) / 2 + 40);
    expect(out[0].w).toBe((1280 - 40) / 2);
  });

  it('never produces negative box sizes on tiny slides', () => {
    const tiny = createDocument(20, 20);
    const out = placeImports(['a', 'b', 'c'], tiny, { padding: 48, gap: 24 });
    for (const o of out) {
      expect(o.w).toBeGreaterThanOrEqual(0);
      expect(o.h).toBeGreaterThanOrEqual(0);
    }
  });
});
