import { describe, it, expect } from 'vitest';
import { createObject, createSlide, type AnimationSpec } from './model';
import {
  advance,
  createPresentation,
  isAtEnd,
  isAtStart,
  retreat,
  seek,
  visibleAfter,
} from './presentation';

const anim = (partial: Partial<AnimationSpec> = {}): AnimationSpec => ({
  preset: 'fade',
  kind: 'enter',
  durationMs: 300,
  delayMs: 0,
  ...partial,
});

// Two objects, each with one enter; b also has an exit. zIndex orders a before b.
const slide = () =>
  createSlide({
    objects: [
      createObject({ id: 'a', html: '', zIndex: 1, animations: [anim()] }),
      createObject({
        id: 'b',
        html: '',
        zIndex: 2,
        animations: [anim(), anim({ kind: 'exit' })],
      }),
      createObject({ id: 'c', html: '', zIndex: 3 }), // no animation, always visible
    ],
  });

describe('presentation controller (M11)', () => {
  it('starts at the beginning with enter-animated objects hidden', () => {
    const s = createPresentation(slide());
    expect(isAtStart(s)).toBe(true);
    expect(isAtEnd(s)).toBe(false);
    expect(visibleAfter(slide(), s.position)).toEqual(new Set(['c']));
  });

  it('advance fires the next step and returns its entries', () => {
    const s = createPresentation(slide());
    const r = advance(s)!;
    expect(r.fired.map((e) => e.objectId)).toEqual(['a']);
    expect(r.state.position).toBe(1);
    expect(visibleAfter(slide(), r.state.position)).toEqual(new Set(['a', 'c']));
  });

  it('reveals on enter and hides on exit as steps play', () => {
    const sl = slide();
    // steps: [a enter], [b enter], [b exit]
    expect(visibleAfter(sl, 1)).toEqual(new Set(['a', 'c']));
    expect(visibleAfter(sl, 2)).toEqual(new Set(['a', 'b', 'c']));
    expect(visibleAfter(sl, 3)).toEqual(new Set(['a', 'c']));
  });

  it('advance returns null at the end and isAtEnd becomes true', () => {
    let s = createPresentation(slide());
    s = advance(s)!.state;
    s = advance(s)!.state;
    s = advance(s)!.state;
    expect(isAtEnd(s)).toBe(true);
    expect(advance(s)).toBeNull();
  });

  it('retreat rewinds one step and returns null at the start', () => {
    const s0 = createPresentation(slide());
    const s1 = advance(s0)!.state;
    expect(retreat(s1)!.position).toBe(0);
    expect(retreat(s0)).toBeNull();
  });

  it('seek clamps to [0, steps.length]', () => {
    const s = createPresentation(slide());
    expect(seek(s, -5).position).toBe(0);
    expect(seek(s, 99).position).toBe(3);
    expect(seek(s, 2).position).toBe(2);
  });

  it('visibleAfter clamps out-of-range positions', () => {
    expect(visibleAfter(slide(), -1)).toEqual(new Set(['c']));
    expect(visibleAfter(slide(), 999)).toEqual(new Set(['a', 'c']));
  });
});
