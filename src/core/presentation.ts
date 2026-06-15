/**
 * Slideshow playback controller (M11) — pure core.
 *
 * {@link buildSlideTimeline} flattens a slide into ordered build steps; this
 * module tracks *where in that timeline we are* and which objects should be
 * visible at any position. It is the DOM-free brain a presentation driver
 * drives: the driver renders, this decides what to fire and what to show.
 *
 * `position` counts how many build steps have already fired (0 = before the
 * first click, steps.length = fully played). Advancing returns the entries to
 * animate; the driver maps them through {@link resolveAnimation}. Visibility is
 * derived purely from position so a driver can *jump* (scrub, restart) without
 * replaying clicks: objects with a pending `enter` start hidden and appear when
 * their enter fires; an `exit` hides its object after firing.
 */

import type { ObjectId, Slide } from './model';
import {
  buildSlideTimeline,
  type SlideTimeline,
  type TimelineEntry,
} from './slideshow';

export interface PresentationState {
  timeline: SlideTimeline;
  /** Build steps already fired: 0..steps.length. */
  position: number;
}

/** Result of advancing: the new state plus the entries that just fired. */
export interface AdvanceResult {
  state: PresentationState;
  fired: TimelineEntry[];
}

/** Start a presentation at the beginning (no builds fired). */
export function createPresentation(slide: Slide): PresentationState {
  return { timeline: buildSlideTimeline(slide), position: 0 };
}

export function isAtStart(state: PresentationState): boolean {
  return state.position <= 0;
}

export function isAtEnd(state: PresentationState): boolean {
  return state.position >= state.timeline.steps.length;
}

/**
 * Fire the next build step. Returns the advanced state + the entries to play,
 * or `null` when already at the end (nothing left to fire).
 */
export function advance(state: PresentationState): AdvanceResult | null {
  if (isAtEnd(state)) return null;
  const step = state.timeline.steps[state.position];
  return {
    state: { timeline: state.timeline, position: state.position + 1 },
    fired: step.entries,
  };
}

/**
 * Step back one build. Returns the rewound state, or `null` at the start. The
 * driver should re-render visibility from {@link visibleAfter} rather than play
 * a reverse animation, so back-navigation is instant and consistent.
 */
export function retreat(state: PresentationState): PresentationState | null {
  if (isAtStart(state)) return null;
  return { timeline: state.timeline, position: state.position - 1 };
}

/** Jump to an absolute position, clamped to [0, steps.length]. */
export function seek(state: PresentationState, position: number): PresentationState {
  const max = state.timeline.steps.length;
  const clamped = Math.max(0, Math.min(max, Math.floor(position)));
  return { timeline: state.timeline, position: clamped };
}

/**
 * The set of object ids that should be visible after `position` build steps.
 * Pure function of (slide, position): every object starts visible except those
 * initially hidden by a pending `enter`; replaying steps toggles visibility as
 * `enter`/`exit` fire (`emphasis` never changes it). Driven from a fresh
 * timeline so it's safe to call for scrubbing without mutating playback state.
 */
export function visibleAfter(slide: Slide, position: number): Set<ObjectId> {
  const timeline = buildSlideTimeline(slide);
  const visible = new Set<ObjectId>(slide.objects.map((o) => o.id));
  for (const id of timeline.initiallyHidden) visible.delete(id);

  const upto = Math.max(0, Math.min(timeline.steps.length, Math.floor(position)));
  for (let i = 0; i < upto; i++) {
    for (const entry of timeline.steps[i].entries) {
      if (entry.spec.kind === 'enter') visible.add(entry.objectId);
      else if (entry.spec.kind === 'exit') visible.delete(entry.objectId);
    }
  }
  return visible;
}
