import { describe, it, expect } from 'vitest';
import { createObject, createSlide, type AnimationSpec, type Slide } from './model';
import {
  createDeck,
  currentSlide,
  deckAdvance,
  deckRetreat,
  goToSlide,
  isDeckAtEnd,
  isDeckAtStart,
} from './deck';

const anim = (partial: Partial<AnimationSpec> = {}): AnimationSpec => ({
  preset: 'fade',
  kind: 'enter',
  durationMs: 300,
  delayMs: 0,
  ...partial,
});

// Slide 1: two enter builds (a, b). Slide 2: one enter build (c). Slide 3: none.
const deckSlides = (): Slide[] => [
  createSlide({
    id: 's1',
    objects: [
      createObject({ id: 'a', html: '', zIndex: 1, animations: [anim()] }),
      createObject({ id: 'b', html: '', zIndex: 2, animations: [anim()] }),
    ],
  }),
  createSlide({
    id: 's2',
    objects: [createObject({ id: 'c', html: '', zIndex: 1, animations: [anim()] })],
  }),
  createSlide({ id: 's3', objects: [createObject({ id: 'd', html: '' })] }),
];

describe('deck slideshow navigation (M11)', () => {
  it('starts at the first slide before any build', () => {
    const d = createDeck(deckSlides());
    expect(d.slideIndex).toBe(0);
    expect(isDeckAtStart(d)).toBe(true);
    expect(isDeckAtEnd(d)).toBe(false);
    expect(currentSlide(d).id).toBe('s1');
  });

  it('fires builds within a slide before crossing to the next', () => {
    let d = createDeck(deckSlides());
    let r = deckAdvance(d)!;
    expect(r.slideChanged).toBe(false);
    expect(r.fired.map((e) => e.objectId)).toEqual(['a']);

    r = deckAdvance(r.state)!;
    expect(r.slideChanged).toBe(false);
    expect(r.fired.map((e) => e.objectId)).toEqual(['b']);

    // Slide 1 fully built → next advance crosses to slide 2 (no fire).
    r = deckAdvance(r.state)!;
    expect(r.slideChanged).toBe(true);
    expect(r.fired).toEqual([]);
    expect(r.state.slideIndex).toBe(1);
    expect(currentSlide(r.state).id).toBe('s2');
  });

  it('walks the whole deck and reports the end', () => {
    let d = createDeck(deckSlides());
    // s1: a, b, →s2 ; s2: c, →s3 ; s3: (no builds) end
    for (let i = 0; i < 5; i++) {
      const r = deckAdvance(d);
      expect(r).not.toBeNull();
      d = r!.state;
    }
    expect(d.slideIndex).toBe(2);
    expect(isDeckAtEnd(d)).toBe(true);
    expect(deckAdvance(d)).toBeNull();
  });

  it('retreats across a slide boundary onto the previous slide fully built', () => {
    let d = createDeck(deckSlides());
    // advance into slide 2 at its start
    d = deckAdvance(d)!.state; // a
    d = deckAdvance(d)!.state; // b
    d = deckAdvance(d)!.state; // → s2 start
    expect(d.slideIndex).toBe(1);

    const r = deckRetreat(d)!;
    expect(r.slideChanged).toBe(true);
    expect(r.state.slideIndex).toBe(0);
    // landed fully built: position == number of build steps (2)
    expect(r.state.pres.position).toBe(2);
  });

  it('rewinds builds within a slide instantly', () => {
    let d = createDeck(deckSlides());
    d = deckAdvance(d)!.state; // a
    d = deckAdvance(d)!.state; // b
    const r = deckRetreat(d)!;
    expect(r.slideChanged).toBe(false);
    expect(r.state.pres.position).toBe(1);
  });

  it('returns null retreating at the very start', () => {
    const d = createDeck(deckSlides());
    expect(deckRetreat(d)).toBeNull();
  });

  it('jumps directly to a slide at its start', () => {
    const d = createDeck(deckSlides());
    const r = goToSlide(d, 2);
    expect(r.slideChanged).toBe(true);
    expect(r.state.slideIndex).toBe(2);
    expect(r.state.pres.position).toBe(0);
    expect(goToSlide(d, 0).slideChanged).toBe(false);
  });

  it('clamps start index and rejects an empty deck', () => {
    expect(createDeck(deckSlides(), 99).slideIndex).toBe(2);
    expect(() => createDeck([])).toThrow();
  });
});
