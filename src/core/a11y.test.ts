import { describe, it, expect } from 'vitest';
import { createObject } from './model';
import type { Slide } from './model';
import {
  objectAriaLabel,
  objectAriaAttrs,
  tabOrder,
  tabNavigate,
  spatialNavigate,
} from './a11y';

const obj = (id: string, x: number, y: number, extra = {}) =>
  createObject({ id, x, y, w: 100, h: 50, html: id, ...extra });

const slide = (...objects: ReturnType<typeof obj>[]): Slide => ({ id: 's1', objects });

describe('objectAriaLabel', () => {
  it('strips tags and collapses whitespace', () => {
    expect(objectAriaLabel(createObject({ html: '<b>Hello</b>\n  <i>world</i>' }))).toBe('Hello world');
  });

  it('decodes the common entities', () => {
    expect(objectAriaLabel(createObject({ html: 'A &amp; B &lt;ok&gt;' }))).toBe('A & B <ok>');
  });

  it('falls back to a placeholder-aware label when empty', () => {
    expect(objectAriaLabel(createObject({ html: '   ' }))).toBe('Empty object');
    expect(objectAriaLabel(createObject({ html: '<br>', placeholder: 'title' }))).toBe('title placeholder');
  });

  it('truncates very long text with an ellipsis', () => {
    const label = objectAriaLabel(createObject({ html: 'x'.repeat(200) }));
    expect(label.length).toBe(80);
    expect(label.endsWith('…')).toBe(true);
  });
});

describe('objectAriaAttrs', () => {
  it('marks the selected object as in Tab order and announces selection', () => {
    const o = obj('a', 0, 0);
    expect(objectAriaAttrs(o, true)).toMatchObject({ tabindex: 0, 'aria-selected': true });
    expect(objectAriaAttrs(o, false)).toMatchObject({ tabindex: -1, 'aria-selected': false });
  });

  it('reflects locked state in the role description', () => {
    expect(objectAriaAttrs(obj('a', 0, 0, { locked: true }), false)['aria-roledescription']).toBe(
      'locked slide object',
    );
  });
});

describe('tabOrder / tabNavigate', () => {
  it('orders reading-wise (top-to-bottom, then left-to-right), not by zIndex', () => {
    const top = obj('top', 50, 0, { zIndex: 0 });
    const botLeft = obj('bl', 0, 100, { zIndex: 99 });
    const botRight = obj('br', 80, 100, { zIndex: 1 });
    expect(tabOrder(slide(botRight, top, botLeft))).toEqual(['top', 'bl', 'br']);
  });

  it('wraps forward and backward through the order', () => {
    const s = slide(obj('a', 0, 0), obj('b', 0, 100), obj('c', 0, 200));
    expect(tabNavigate(s, 'a')).toBe('b');
    expect(tabNavigate(s, 'c')).toBe('a'); // wrap forward
    expect(tabNavigate(s, 'a', true)).toBe('c'); // wrap backward
  });

  it('starts at the first (or last) when nothing is focused', () => {
    const s = slide(obj('a', 0, 0), obj('b', 0, 100));
    expect(tabNavigate(s, null)).toBe('a');
    expect(tabNavigate(s, null, true)).toBe('b');
    expect(tabNavigate(slide(), null)).toBeNull();
  });
});

describe('spatialNavigate', () => {
  // layout:  L(0,100) C(100,100) R(200,100)  /  U(100,0)  D(100,200)
  const s = slide(
    obj('C', 100, 100),
    obj('L', 0, 100),
    obj('R', 200, 100),
    obj('U', 100, 0),
    obj('D', 100, 200),
  );

  it('moves to the nearest object in the pressed direction', () => {
    expect(spatialNavigate(s, 'C', 'left')).toBe('L');
    expect(spatialNavigate(s, 'C', 'right')).toBe('R');
    expect(spatialNavigate(s, 'C', 'up')).toBe('U');
    expect(spatialNavigate(s, 'C', 'down')).toBe('D');
  });

  it('returns null at the spatial edge (no wrap)', () => {
    expect(spatialNavigate(s, 'L', 'left')).toBeNull();
    expect(spatialNavigate(s, 'U', 'up')).toBeNull();
  });

  it('ignores objects outside the direction cone', () => {
    // from L, R is straight right past C — C wins (closer, on-axis)
    expect(spatialNavigate(s, 'L', 'right')).toBe('C');
  });
});
