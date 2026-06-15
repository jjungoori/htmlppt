import { describe, it, expect } from 'vitest';
import {
  ANIMATION_PRESETS,
  animationEndMs,
  createAnimation,
  isKnownPreset,
  presetsForKind,
  resolveAnimation,
} from './animate';

describe('Animation presets (M11)', () => {
  it('exposes built-in presets and recognises them', () => {
    expect(ANIMATION_PRESETS).toContain('fade');
    expect(isKnownPreset('fade')).toBe(true);
    expect(isKnownPreset('nope')).toBe(false);
  });

  it('filters presets by kind for menus', () => {
    expect(presetsForKind('enter')).toContain('fade');
    expect(presetsForKind('emphasis')).toContain('pulse');
    expect(presetsForKind('emphasis')).not.toContain('fade');
  });
});

describe('resolveAnimation (M11)', () => {
  it('resolves a fade-in to add-composited opacity keyframes', () => {
    const r = resolveAnimation({ preset: 'fade', kind: 'enter', durationMs: 300, delayMs: 50 });
    expect(r.keyframes[0]).toMatchObject({ opacity: 0, composite: 'add' });
    expect(r.keyframes[r.keyframes.length - 1]).toMatchObject({ opacity: 1 });
    expect(r.options.duration).toBe(300);
    expect(r.options.delay).toBe(50);
    expect(r.options.fill).toBe('backwards');
  });

  it('reverses frames and uses forwards fill for exit', () => {
    const r = resolveAnimation({ preset: 'fade', kind: 'exit', durationMs: 200, delayMs: 0 });
    expect(r.keyframes[0]).toMatchObject({ opacity: 1 });
    expect(r.keyframes[r.keyframes.length - 1]).toMatchObject({ opacity: 0 });
    expect(r.options.fill).toBe('forwards');
  });

  it('clamps negative timing to zero', () => {
    const r = resolveAnimation({ preset: 'fade', kind: 'enter', durationMs: -5, delayMs: -10 });
    expect(r.options.duration).toBe(0);
    expect(r.options.delay).toBe(0);
  });

  it('throws on unknown preset', () => {
    expect(() => resolveAnimation({ preset: 'x', kind: 'enter', durationMs: 1, delayMs: 0 })).toThrow(
      /Unknown animation preset/,
    );
  });

  it('throws when a preset is used with an unsupported kind', () => {
    expect(() =>
      resolveAnimation({ preset: 'fade', kind: 'emphasis', durationMs: 1, delayMs: 0 }),
    ).toThrow(/does not support kind/);
  });
});

describe('animationEndMs / createAnimation (M11)', () => {
  it('sums delay + duration, clamping negatives', () => {
    expect(animationEndMs({ preset: 'fade', kind: 'enter', durationMs: 300, delayMs: 100 })).toBe(400);
    expect(animationEndMs({ preset: 'fade', kind: 'enter', durationMs: -1, delayMs: -1 })).toBe(0);
  });

  it('builds a valid spec with defaults and the kind a preset supports', () => {
    const a = createAnimation('pulse');
    expect(a).toMatchObject({ preset: 'pulse', kind: 'emphasis', durationMs: 400, delayMs: 0 });
  });

  it('rejects an invalid preset/kind combination', () => {
    expect(() => createAnimation('fade', { kind: 'emphasis' })).toThrow(/does not support/);
    expect(() => createAnimation('nope')).toThrow(/Unknown animation preset/);
  });
});
