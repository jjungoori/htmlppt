/**
 * Presenter view (M22) — pure core.
 *
 * A presenter view is the *speaker's* private screen during a slideshow: the
 * slide the audience sees now, a preview of what comes next, the current
 * slide's speaker notes, and an elapsed-time clock. The audience screen is
 * driven by {@link './deck'.DeckState}; this module is the DOM-free brain that
 * derives everything the presenter screen needs from that same state, so the
 * two windows stay in lockstep without the presenter logic touching the DOM.
 *
 * Two pure pieces:
 *  - {@link presenterView} maps a `DeckState` → what to show on the speaker
 *    screen (current/next slide, notes, build progress). A pure function of
 *    state, so a dual-window driver can re-derive it on every navigation.
 *  - A {@link TimerState} clock reducer ({@link startTimer}/{@link pauseTimer}/
 *    {@link resumeTimer}/{@link elapsedMs}/{@link formatElapsed}). Time is
 *    injected as a `now` argument (never read from the wall clock here) so the
 *    timer is deterministic and unit-testable.
 *
 * Read-only: it neither mutates the document nor goes through the command layer
 * (nothing to undo), and it has no bearing on export/import round-trips.
 */

import type { Slide } from './model';
import type { DeckState } from './deck';
import { isAtEnd } from './presentation';

/** What the speaker screen should display, derived purely from deck state. */
export interface PresenterView {
  /** Slide the audience is currently seeing. */
  current: Slide;
  /** The next slide to preview, or `null` when on the last slide. */
  next: Slide | null;
  /** Current slide's speaker notes (empty string when none). */
  notes: string;
  /** 1-based number of the current slide. */
  slideNumber: number;
  /** Total slides in the deck. */
  slideCount: number;
  /** Build steps already fired on the current slide. */
  buildPosition: number;
  /** Total build steps on the current slide. */
  buildCount: number;
  /** True when the current slide is fully built (next advance crosses slides). */
  slideComplete: boolean;
}

/** Derive the presenter screen model from the audience-facing deck state. */
export function presenterView(state: DeckState): PresenterView {
  const { slides, slideIndex, pres } = state;
  const current = slides[slideIndex];
  const next = slideIndex < slides.length - 1 ? slides[slideIndex + 1] : null;
  return {
    current,
    next,
    notes: current.notes ?? '',
    slideNumber: slideIndex + 1,
    slideCount: slides.length,
    buildPosition: pres.position,
    buildCount: pres.timeline.steps.length,
    slideComplete: isAtEnd(pres),
  };
}

/**
 * Elapsed-time clock for the presenter view. Holds accumulated time plus, when
 * running, the `now` at which the current run started — so {@link elapsedMs}
 * stays a pure function of (timer, now) and the timer can be paused/resumed
 * without losing prior time. `null` `startedAt` means paused/stopped.
 */
export interface TimerState {
  /** Milliseconds accumulated across completed (paused) runs. */
  accumulatedMs: number;
  /** `now` when the active run began, or `null` while paused. */
  startedAt: number | null;
}

/** A fresh timer started at `now` (running). */
export function startTimer(now: number): TimerState {
  return { accumulatedMs: 0, startedAt: now };
}

/** A fresh timer that is paused at zero (call {@link resumeTimer} to run). */
export function createTimer(): TimerState {
  return { accumulatedMs: 0, startedAt: null };
}

export function isRunning(timer: TimerState): boolean {
  return timer.startedAt !== null;
}

/** Total elapsed milliseconds at `now` (pure; works paused or running). */
export function elapsedMs(timer: TimerState, now: number): number {
  const running = timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt);
  return timer.accumulatedMs + running;
}

/** Pause the clock, folding the active run into accumulated time. No-op if already paused. */
export function pauseTimer(timer: TimerState, now: number): TimerState {
  if (timer.startedAt === null) return timer;
  return { accumulatedMs: elapsedMs(timer, now), startedAt: null };
}

/** Resume a paused clock at `now`. No-op if already running. */
export function resumeTimer(timer: TimerState, now: number): TimerState {
  if (timer.startedAt !== null) return timer;
  return { accumulatedMs: timer.accumulatedMs, startedAt: now };
}

/** Reset to a paused zero clock. */
export function resetTimer(): TimerState {
  return createTimer();
}

/**
 * Format elapsed milliseconds as `H:MM:SS` (hours dropped when zero → `M:SS`).
 * Truncates to whole seconds. Negative input is clamped to zero.
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}
