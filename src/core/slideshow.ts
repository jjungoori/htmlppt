/**
 * Slideshow build timeline (M11) — pure core.
 *
 * PowerPoint plays a slide as an ordered list of *builds*: on each click the
 * next group of animations fires. This module turns a {@link Slide} into that
 * ordered build sequence, plus the set of objects that must start hidden
 * (those with a pending `enter` animation). It is DOM-free: the slideshow
 * driver maps each step's animations through {@link resolveAnimation} and calls
 * `element.animate(...)`. Keeping the sequencing here makes it unit-testable.
 *
 * Sequencing rule (PPT-faithful, kept deliberately simple):
 *   - Animations fire in document order: by object `zIndex` then array order
 *     within each object, matching the order the author added them.
 *   - Each animation is its own build step (one click each), EXCEPT animations
 *     with `delayMs > 0`, which ride along with the preceding step rather than
 *     consuming a click — this models "after previous" auto-advance.
 *   - An object that has any `enter` animation starts hidden until that enter
 *     build fires.
 */

import type { AnimationSpec, ObjectId, Slide, SlideObject } from './model';

/** One animation occurrence within the slide's build sequence. */
export interface TimelineEntry {
  objectId: ObjectId;
  spec: AnimationSpec;
}

/** A group of animations that fire together on a single advance (click). */
export interface BuildStep {
  index: number;
  entries: TimelineEntry[];
}

export interface SlideTimeline {
  /** Ordered build steps; advance one per click. */
  steps: BuildStep[];
  /** Objects that begin hidden (have a pending `enter`) until their step fires. */
  initiallyHidden: ObjectId[];
}

/** Flatten a slide's animations into document order: by zIndex, then add order. */
function orderedEntries(slide: Slide): TimelineEntry[] {
  const objects: SlideObject[] = slide.objects
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex);
  const entries: TimelineEntry[] = [];
  for (const obj of objects) {
    for (const spec of obj.animations) {
      entries.push({ objectId: obj.id, spec });
    }
  }
  return entries;
}

/**
 * Build the click-advance timeline for a slide. Delayed animations (delayMs>0)
 * auto-chain onto the previous step instead of taking their own click; the
 * first animation always starts a step even if delayed.
 */
export function buildSlideTimeline(slide: Slide): SlideTimeline {
  const entries = orderedEntries(slide);
  const steps: BuildStep[] = [];

  for (const entry of entries) {
    const autoChain = entry.spec.delayMs > 0 && steps.length > 0;
    if (autoChain) {
      steps[steps.length - 1].entries.push(entry);
    } else {
      steps.push({ index: steps.length, entries: [entry] });
    }
  }

  const initiallyHidden: ObjectId[] = [];
  const seen = new Set<ObjectId>();
  for (const obj of slide.objects) {
    if (seen.has(obj.id)) continue;
    if (obj.animations.some((a) => a.kind === 'enter')) {
      initiallyHidden.push(obj.id);
      seen.add(obj.id);
    }
  }

  return { steps, initiallyHidden };
}

/** Total number of clicks needed to fully play a slide. */
export function buildStepCount(slide: Slide): number {
  return buildSlideTimeline(slide).steps.length;
}
