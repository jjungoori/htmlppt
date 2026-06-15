/**
 * Deck-level slideshow navigation (M11) — pure core.
 *
 * {@link createPresentation} drives the build sequence *within one slide*; a
 * real slideshow spans many slides. This module is the DOM-free brain that
 * chains per-slide timelines into one linear "click stream": advancing fires
 * the next build on the current slide, and once a slide is fully built the next
 * advance crosses to the start of the following slide. Retreat mirrors this,
 * landing on the *fully-built* end of the previous slide so back-navigation
 * shows what the audience last saw.
 *
 * It is a pure reducer: every transition returns a fresh {@link DeckState} plus
 * a {@link DeckAdvance} describing what the DOM driver must do (animate fired
 * entries, or switch slides). Keeping it here makes cross-slide sequencing
 * unit-testable without a browser.
 */

import type { Slide } from './model';
import {
  advance,
  createPresentation,
  isAtEnd,
  isAtStart,
  seek,
  type PresentationState,
} from './presentation';
import type { TimelineEntry } from './slideshow';

export interface DeckState {
  slides: Slide[];
  /** Index of the slide currently on screen. */
  slideIndex: number;
  /** Build position within the current slide. */
  pres: PresentationState;
}

/** What the driver should do after a navigation request. */
export interface DeckAdvance {
  state: DeckState;
  /** Animations that fired in place (same slide); empty on a slide change. */
  fired: TimelineEntry[];
  /** True when the active slide changed and the driver must re-render it. */
  slideChanged: boolean;
}

/** Start a deck slideshow at the first slide, before any builds fire. */
export function createDeck(slides: Slide[], startIndex = 0): DeckState {
  if (slides.length === 0) throw new Error('createDeck: deck has no slides');
  const slideIndex = Math.max(0, Math.min(startIndex, slides.length - 1));
  return { slides, slideIndex, pres: createPresentation(slides[slideIndex]) };
}

export function isDeckAtStart(state: DeckState): boolean {
  return state.slideIndex === 0 && isAtStart(state.pres);
}

export function isDeckAtEnd(state: DeckState): boolean {
  return state.slideIndex === state.slides.length - 1 && isAtEnd(state.pres);
}

/** The slide currently on screen. */
export function currentSlide(state: DeckState): Slide {
  return state.slides[state.slideIndex];
}

/**
 * Advance one step. Fires the next build on the current slide, or — if the
 * slide is fully built — crosses to the next slide's start. Returns `null` at
 * the very end of the deck (nothing left).
 */
export function deckAdvance(state: DeckState): DeckAdvance | null {
  if (!isAtEnd(state.pres)) {
    const res = advance(state.pres)!;
    return {
      state: { ...state, pres: res.state },
      fired: res.fired,
      slideChanged: false,
    };
  }
  if (state.slideIndex >= state.slides.length - 1) return null;
  const slideIndex = state.slideIndex + 1;
  return {
    state: { slides: state.slides, slideIndex, pres: createPresentation(state.slides[slideIndex]) },
    fired: [],
    slideChanged: true,
  };
}

/**
 * Step back one step. Within a slide this rewinds one build (the driver
 * re-renders visibility instantly rather than reversing animations). At a
 * slide's start it crosses to the previous slide, landing on its fully-built
 * end. Returns `null` at the very start of the deck.
 */
export function deckRetreat(state: DeckState): DeckAdvance | null {
  if (!isAtStart(state.pres)) {
    const pres = { ...state.pres, position: state.pres.position - 1 };
    return { state: { ...state, pres }, fired: [], slideChanged: false };
  }
  if (state.slideIndex <= 0) return null;
  const slideIndex = state.slideIndex - 1;
  const slide = state.slides[slideIndex];
  const fresh = createPresentation(slide);
  const pres = seek(fresh, fresh.timeline.steps.length);
  return {
    state: { slides: state.slides, slideIndex, pres },
    fired: [],
    slideChanged: true,
  };
}

/** Jump to a slide by index, rendered at its start (clamped). */
export function goToSlide(state: DeckState, index: number): DeckAdvance {
  const slideIndex = Math.max(0, Math.min(Math.floor(index), state.slides.length - 1));
  return {
    state: { slides: state.slides, slideIndex, pres: createPresentation(state.slides[slideIndex]) },
    fired: [],
    slideChanged: slideIndex !== state.slideIndex,
  };
}
