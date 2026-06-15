/**
 * Animation engine (M11) — pure core.
 *
 * Resolves an {@link AnimationSpec} into WAAPI keyframes + timing options. This
 * module is pure & DOM-free: it only turns a preset name into the data the
 * renderer feeds to `element.animate(keyframes, options)`. The slideshow driver
 * (DOM/WAAPI) consumes this; tests can assert the keyframes directly.
 *
 * Keyframes are expressed against the object's *rendered* transform: each frame
 * carries a `composite: 'add'` opacity/transform offset so animations layer on
 * top of the single-matrix transform model (invariant #1) without overwriting
 * it. Translations are expressed in px, scales/rotations as composable units.
 */

import type { AnimationSpec } from './model';

export type AnimationKind = AnimationSpec['kind'];

/** A resolved animation ready for `element.animate(keyframes, options)`. */
export interface ResolvedAnimation {
  keyframes: Keyframe[];
  options: KeyframeEffectOptions;
}

interface PresetDef {
  /** which kinds this preset is valid for. */
  kinds: AnimationKind[];
  /** keyframes for an *enter*; exit replays them reversed. */
  frames: Keyframe[];
  /** default easing. */
  easing?: string;
}

/**
 * Built-in presets. `frames` describe an entrance (from hidden → shown). Exit
 * animations reuse the same frames played in reverse, so 'fade' works as both
 * a fade-in (enter) and fade-out (exit). Emphasis presets are self-contained
 * round-trips and ignore direction.
 */
const PRESETS: Record<string, PresetDef> = {
  fade: {
    kinds: ['enter', 'exit'],
    frames: [{ opacity: 0 }, { opacity: 1 }],
  },
  'fly-in': {
    kinds: ['enter', 'exit'],
    frames: [
      { opacity: 0, transform: 'translateY(40px)' },
      { opacity: 1, transform: 'translateY(0px)' },
    ],
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  zoom: {
    kinds: ['enter', 'exit'],
    frames: [
      { opacity: 0, transform: 'scale(0.6)' },
      { opacity: 1, transform: 'scale(1)' },
    ],
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  pulse: {
    kinds: ['emphasis'],
    frames: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.12)' },
      { transform: 'scale(1)' },
    ],
  },
  shake: {
    kinds: ['emphasis'],
    frames: [
      { transform: 'translateX(0px)' },
      { transform: 'translateX(-8px)' },
      { transform: 'translateX(8px)' },
      { transform: 'translateX(0px)' },
    ],
  },
};

export const ANIMATION_PRESETS = Object.keys(PRESETS);

export function isKnownPreset(preset: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRESETS, preset);
}

/** Presets valid for a given kind, for building UI menus. */
export function presetsForKind(kind: AnimationKind): string[] {
  return ANIMATION_PRESETS.filter((p) => PRESETS[p].kinds.includes(kind));
}

/**
 * Resolve a spec into keyframes + timing. Throws on an unknown preset or a
 * preset used with an unsupported kind, so bad specs fail loudly rather than
 * silently animating nothing. Negative durations/delays are clamped to 0.
 */
export function resolveAnimation(spec: AnimationSpec): ResolvedAnimation {
  const def = PRESETS[spec.preset];
  if (!def) {
    throw new Error(`Unknown animation preset: ${spec.preset}`);
  }
  if (!def.kinds.includes(spec.kind)) {
    throw new Error(`Preset '${spec.preset}' does not support kind '${spec.kind}'`);
  }

  // Emphasis presets are symmetric round-trips; enter/exit are directional and
  // share one frame list, with exit playing it in reverse.
  const frames =
    spec.kind === 'exit' ? def.frames.slice().reverse() : def.frames.slice();

  return {
    keyframes: frames.map((f) => ({ composite: 'add', ...f })),
    options: {
      duration: Math.max(0, spec.durationMs),
      delay: Math.max(0, spec.delayMs),
      easing: def.easing ?? 'ease',
      fill: spec.kind === 'enter' ? 'backwards' : 'forwards',
    },
  };
}

/**
 * Total wall-clock time a spec occupies (delay + duration), used by the
 * slideshow timeline to schedule sequential builds.
 */
export function animationEndMs(spec: AnimationSpec): number {
  return Math.max(0, spec.delayMs) + Math.max(0, spec.durationMs);
}

/** Build a valid spec with sensible defaults. */
export function createAnimation(
  preset: string,
  partial: Partial<Omit<AnimationSpec, 'preset'>> = {},
): AnimationSpec {
  if (!isKnownPreset(preset)) {
    throw new Error(`Unknown animation preset: ${preset}`);
  }
  const kind = partial.kind ?? PRESETS[preset].kinds[0];
  if (!PRESETS[preset].kinds.includes(kind)) {
    throw new Error(`Preset '${preset}' does not support kind '${kind}'`);
  }
  return {
    preset,
    durationMs: partial.durationMs ?? 400,
    delayMs: partial.delayMs ?? 0,
    kind,
  };
}
