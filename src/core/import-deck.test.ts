import { describe, it, expect } from 'vitest';
import { parseObjectStyle, placeDeck } from './import-deck';
import { createObject } from './model';
import { cssTransform } from './transform';

/** Rebuild the exact inline style export's renderObject emits for an object. */
function exportedStyle(o: ReturnType<typeof createObject>): string {
  return [
    'position:absolute',
    'top:0',
    'left:0',
    'transform-origin:50% 50%',
    `width:${o.w}px`,
    `height:${o.h}px`,
    `transform:${cssTransform(o)}`,
    `opacity:${o.opacity}`,
    `z-index:${o.zIndex}`,
  ].join(';');
}

describe('parseObjectStyle', () => {
  it('inverts the exported transform style back to init fields', () => {
    const o = createObject({
      html: '<p>x</p>', x: 12, y: 34, w: 100, h: 40,
      angle: 15, scaleX: 1.5, scaleY: 2, opacity: 0.5, zIndex: 7,
    });
    expect(parseObjectStyle(exportedStyle(o))).toEqual({
      x: 12, y: 34, w: 100, h: 40,
      angle: 15, scaleX: 1.5, scaleY: 2, opacity: 0.5, zIndex: 7,
    });
  });

  it('handles negative coordinates and fractional values', () => {
    const o = createObject({ html: '', x: -5, y: -10.5, w: 0, h: 3.25 });
    const parsed = parseObjectStyle(exportedStyle(o));
    expect(parsed.x).toBe(-5);
    expect(parsed.y).toBe(-10.5);
    expect(parsed.h).toBe(3.25);
  });

  it('omits fields absent from the style (fall back to defaults downstream)', () => {
    expect(parseObjectStyle('width:50px;')).toEqual({ w: 50 });
  });
});

describe('placeDeck', () => {
  it('reconstructs per-slide objects with untouched html + transform', () => {
    const o = createObject({ html: '<h1>Hi</h1>', x: 1, y: 2, w: 3, h: 4 });
    const slides = placeDeck([
      [{ style: exportedStyle(o), html: '<h1>Hi</h1>' }],
      [],
    ]);
    expect(slides).toHaveLength(2);
    expect(slides[1]).toEqual([]);
    expect(slides[0][0]).toMatchObject({ html: '<h1>Hi</h1>', x: 1, y: 2, w: 3, h: 4 });
  });
});
