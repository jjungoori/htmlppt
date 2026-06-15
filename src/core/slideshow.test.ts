import { describe, it, expect } from 'vitest';
import { createObject, createSlide, type AnimationSpec } from './model';
import { buildSlideTimeline, buildStepCount } from './slideshow';

const anim = (partial: Partial<AnimationSpec> = {}): AnimationSpec => ({
  preset: 'fade',
  kind: 'enter',
  durationMs: 300,
  delayMs: 0,
  ...partial,
});

describe('buildSlideTimeline (M11)', () => {
  it('orders entries by zIndex then animation add order', () => {
    const slide = createSlide({
      objects: [
        createObject({ id: 'b', html: '', zIndex: 5, animations: [anim()] }),
        createObject({
          id: 'a',
          html: '',
          zIndex: 1,
          animations: [anim(), anim({ kind: 'emphasis', preset: 'pulse' })],
        }),
      ],
    });
    const t = buildSlideTimeline(slide);
    expect(t.steps.map((s) => s.entries[0].objectId)).toEqual(['a', 'a', 'b']);
    expect(t.steps).toHaveLength(3);
  });

  it('auto-chains delayed animations onto the previous step', () => {
    const slide = createSlide({
      objects: [
        createObject({
          id: 'a',
          html: '',
          animations: [anim(), anim({ delayMs: 200 })],
        }),
      ],
    });
    const t = buildSlideTimeline(slide);
    expect(t.steps).toHaveLength(1);
    expect(t.steps[0].entries).toHaveLength(2);
  });

  it('still starts a step when the very first animation is delayed', () => {
    const slide = createSlide({
      objects: [createObject({ id: 'a', html: '', animations: [anim({ delayMs: 500 })] })],
    });
    expect(buildStepCount(slide)).toBe(1);
  });

  it('marks objects with an enter animation as initially hidden, once each', () => {
    const slide = createSlide({
      objects: [
        createObject({ id: 'a', html: '', animations: [anim(), anim({ kind: 'exit' })] }),
        createObject({ id: 'b', html: '', animations: [anim({ kind: 'emphasis', preset: 'pulse' })] }),
      ],
    });
    const t = buildSlideTimeline(slide);
    expect(t.initiallyHidden).toEqual(['a']);
  });

  it('produces an empty timeline for a slide with no animations', () => {
    const slide = createSlide({ objects: [createObject({ id: 'a', html: '' })] });
    const t = buildSlideTimeline(slide);
    expect(t.steps).toHaveLength(0);
    expect(t.initiallyHidden).toEqual([]);
  });
});
