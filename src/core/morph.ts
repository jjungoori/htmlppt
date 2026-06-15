/**
 * Morph transition (M20) — pure core.
 *
 * Given two consecutive slides (`from` → `to`), match their objects and
 * interpolate transform/opacity so shared objects glide between slides
 * (PowerPoint "Morph"). This module is pure & DOM-free: it produces a
 * {@link MorphPlan} (matched pairs + entering/exiting objects) and, per matched
 * pair, either an interpolated transform snapshot ({@link morphFrame}) or WAAPI
 * keyframes ({@link morphKeyframes}) the slideshow driver feeds to
 * `element.animate(...)`. It reads slides but never mutates them, so the
 * document model (invariant #1) and export/import round-trips are untouched.
 */

import type { Slide, SlideObject } from './model';

/** A matched object that exists (by identity) on both slides. */
export interface MorphPair {
  from: SlideObject;
  to: SlideObject;
  /** how the match was found, for debugging/UI. */
  matchedBy: 'id' | 'html';
}

export interface MorphPlan {
  /** objects present on both slides — animated from `from` to `to`. */
  matched: MorphPair[];
  /** objects only on the destination slide — fade/enter. */
  entering: SlideObject[];
  /** objects only on the source slide — fade/exit. */
  exiting: SlideObject[];
}

/** Transform snapshot interpolated at a point in the morph. */
export interface MorphSnapshot {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

/**
 * Match objects between two slides. Matching is deterministic and prefers
 * identity: an object keeps its `id` across slides → that is the strongest
 * signal of "the same thing moved". Failing that, objects with byte-identical
 * `html` are paired greedily in document order (a duplicated shape carried to
 * the next slide). Everything left over enters (only on `to`) or exits (only on
 * `from`). Each object is matched at most once.
 */
export function planMorph(from: Slide, to: Slide): MorphPlan {
  const matched: MorphPair[] = [];
  const usedFrom = new Set<SlideObject>();
  const usedTo = new Set<SlideObject>();

  // Pass 1: identity match.
  const fromById = new Map<string, SlideObject>();
  for (const o of from.objects) fromById.set(o.id, o);
  for (const t of to.objects) {
    const f = fromById.get(t.id);
    if (f && !usedFrom.has(f)) {
      matched.push({ from: f, to: t, matchedBy: 'id' });
      usedFrom.add(f);
      usedTo.add(t);
    }
  }

  // Pass 2: identical-html match in document order (greedy).
  const freeFromByHtml = new Map<string, SlideObject[]>();
  for (const f of from.objects) {
    if (usedFrom.has(f)) continue;
    const bucket = freeFromByHtml.get(f.html);
    if (bucket) bucket.push(f);
    else freeFromByHtml.set(f.html, [f]);
  }
  for (const t of to.objects) {
    if (usedTo.has(t)) continue;
    const bucket = freeFromByHtml.get(t.html);
    const f = bucket?.shift();
    if (f) {
      matched.push({ from: f, to: t, matchedBy: 'html' });
      usedFrom.add(f);
      usedTo.add(t);
    }
  }

  return {
    matched,
    entering: to.objects.filter((o) => !usedTo.has(o)),
    exiting: from.objects.filter((o) => !usedFrom.has(o)),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest signed angular delta a→b in degrees (so 350°→10° morphs +20°). */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Interpolate a matched pair at `t` ∈ [0,1] (clamped). At t=0 it returns the
 * source transform, at t=1 the destination; size (w/h) is interpolated too so a
 * box genuinely resizes mid-morph. Angle takes the shortest path around the
 * circle. Pure — used by tests and any non-WAAPI driver.
 */
export function morphFrame(pair: MorphPair, t: number): MorphSnapshot {
  const c = Math.min(1, Math.max(0, t));
  const { from: f, to: o } = pair;
  return {
    x: lerp(f.x, o.x, c),
    y: lerp(f.y, o.y, c),
    w: lerp(f.w, o.w, c),
    h: lerp(f.h, o.h, c),
    angle: f.angle + angleDelta(f.angle, o.angle) * c,
    scaleX: lerp(f.scaleX, o.scaleX, c),
    scaleY: lerp(f.scaleY, o.scaleY, c),
    opacity: lerp(f.opacity, o.opacity, c),
  };
}

/** Default morph timing. */
export const MORPH_DURATION_MS = 500;
const MORPH_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

/**
 * WAAPI keyframes that move the destination element (already laid out at `to`)
 * back to the `from` pose at t=0, then to its own pose at t=1. The driver
 * renders the `to` slide normally and plays these so the object appears to have
 * travelled from its previous slide.
 *
 * The element's box is sized `to.w × to.h`, so reaching `from`'s on-screen size
 * folds the box ratio into the start scale: `scaleX0 = from.scaleX * from.w /
 * to.w` (guarded against a zero destination size). Transforms are absolute (no
 * `composite`) because a morph replaces the static transform for its duration.
 */
export function morphKeyframes(pair: MorphPair): {
  keyframes: Keyframe[];
  options: KeyframeEffectOptions;
} {
  const { from: f, to: o } = pair;
  const sx0 = (o.w !== 0 ? f.w / o.w : 1) * f.scaleX;
  const sy0 = (o.h !== 0 ? f.h / o.h : 1) * f.scaleY;
  return {
    keyframes: [
      {
        transform: `translate(${f.x}px, ${f.y}px) rotate(${f.angle}deg) scale(${sx0}, ${sy0})`,
        opacity: f.opacity,
      },
      {
        transform: `translate(${o.x}px, ${o.y}px) rotate(${o.angle}deg) scale(${o.scaleX}, ${o.scaleY})`,
        opacity: o.opacity,
      },
    ],
    options: {
      duration: MORPH_DURATION_MS,
      easing: MORPH_EASING,
      fill: 'backwards',
    },
  };
}
