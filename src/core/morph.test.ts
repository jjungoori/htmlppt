import { describe, it, expect } from 'vitest';
import { createObject, createSlide } from './model';
import {
  planMorph,
  morphFrame,
  morphKeyframes,
  MORPH_DURATION_MS,
  type MorphPair,
} from './morph';

function obj(id: string, over: Partial<Parameters<typeof createObject>[0]> = {}) {
  return createObject({ id, html: `<div>${id}</div>`, ...over });
}

describe('planMorph — matching', () => {
  it('matches objects sharing an id (strongest signal)', () => {
    const a = obj('a', { x: 0 });
    const a2 = obj('a', { x: 100 });
    const plan = planMorph(createSlide({ objects: [a] }), createSlide({ objects: [a2] }));
    expect(plan.matched).toHaveLength(1);
    expect(plan.matched[0].matchedBy).toBe('id');
    expect(plan.matched[0].from.x).toBe(0);
    expect(plan.matched[0].to.x).toBe(100);
    expect(plan.entering).toHaveLength(0);
    expect(plan.exiting).toHaveLength(0);
  });

  it('falls back to identical html when ids differ', () => {
    const from = obj('x1', { html: '<div>shared</div>' });
    const to = obj('y9', { html: '<div>shared</div>', x: 50 });
    const plan = planMorph(createSlide({ objects: [from] }), createSlide({ objects: [to] }));
    expect(plan.matched).toHaveLength(1);
    expect(plan.matched[0].matchedBy).toBe('html');
  });

  it('classifies entering and exiting objects', () => {
    const keep = obj('keep');
    const gone = obj('gone');
    const fresh = obj('fresh');
    const plan = planMorph(
      createSlide({ objects: [keep, gone] }),
      createSlide({ objects: [keep, fresh] }),
    );
    expect(plan.matched.map((m) => m.from.id)).toEqual(['keep']);
    expect(plan.exiting.map((o) => o.id)).toEqual(['gone']);
    expect(plan.entering.map((o) => o.id)).toEqual(['fresh']);
  });

  it('matches each object at most once', () => {
    const from = [obj('p', { html: '<div>dup</div>' }), obj('q', { html: '<div>dup</div>' })];
    const to = [obj('r', { html: '<div>dup</div>' })];
    const plan = planMorph(createSlide({ objects: from }), createSlide({ objects: to }));
    expect(plan.matched).toHaveLength(1);
    expect(plan.exiting).toHaveLength(1);
  });
});

describe('morphFrame — interpolation', () => {
  const pair: MorphPair = {
    from: obj('a', { x: 0, y: 0, w: 100, h: 100, angle: 0, opacity: 0.2 }),
    to: obj('a', { x: 200, y: 100, w: 300, h: 50, angle: 90, opacity: 1 }),
    matchedBy: 'id',
  };

  it('returns the source pose at t=0 and destination at t=1', () => {
    expect(morphFrame(pair, 0)).toMatchObject({ x: 0, w: 100, opacity: 0.2 });
    expect(morphFrame(pair, 1)).toMatchObject({ x: 200, w: 300, h: 50, angle: 90, opacity: 1 });
  });

  it('interpolates size and position at the midpoint', () => {
    const mid = morphFrame(pair, 0.5);
    expect(mid.x).toBe(100);
    expect(mid.w).toBe(200);
    expect(mid.angle).toBe(45);
    expect(mid.opacity).toBeCloseTo(0.6);
  });

  it('takes the shortest angular path (350° → 10° goes +20°)', () => {
    const p: MorphPair = {
      from: obj('a', { angle: 350 }),
      to: obj('a', { angle: 10 }),
      matchedBy: 'id',
    };
    expect(morphFrame(p, 0.5).angle).toBe(360); // 350 + 20*0.5
  });

  it('clamps t outside [0,1]', () => {
    expect(morphFrame(pair, -1).x).toBe(0);
    expect(morphFrame(pair, 2).x).toBe(200);
  });
});

describe('morphKeyframes — WAAPI', () => {
  it('starts at the from pose and ends at the to pose', () => {
    const pair: MorphPair = {
      from: obj('a', { x: 10, y: 20, w: 100, h: 100, angle: 0, scaleX: 1, scaleY: 1, opacity: 0.5 }),
      to: obj('a', { x: 0, y: 0, w: 200, h: 100, angle: 0, scaleX: 1, scaleY: 1, opacity: 1 }),
      matchedBy: 'id',
    };
    const { keyframes, options } = morphKeyframes(pair);
    // start scaleX folds box ratio 100/200 = 0.5.
    expect(keyframes[0].transform).toBe('translate(10px, 20px) rotate(0deg) scale(0.5, 1)');
    expect(keyframes[0].opacity).toBe(0.5);
    expect(keyframes[1].transform).toBe('translate(0px, 0px) rotate(0deg) scale(1, 1)');
    expect(keyframes[1].opacity).toBe(1);
    expect(options.duration).toBe(MORPH_DURATION_MS);
  });

  it('guards against a zero destination size', () => {
    const pair: MorphPair = {
      from: obj('a', { w: 50, h: 50 }),
      to: obj('a', { w: 0, h: 0 }),
      matchedBy: 'id',
    };
    expect(() => morphKeyframes(pair)).not.toThrow();
    expect(keyframeScale(morphKeyframes(pair).keyframes[0])).toBe('scale(1, 1)');
  });
});

function keyframeScale(k: Keyframe): string {
  const m = /scale\([^)]*\)/.exec(String(k.transform));
  return m ? m[0] : '';
}
