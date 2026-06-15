import { describe, it, expect } from 'vitest';
import { createObject, createSlide } from './model';
import { createDeck, deckAdvance } from './deck';
import {
  presenterView,
  startTimer,
  createTimer,
  isRunning,
  elapsedMs,
  pauseTimer,
  resumeTimer,
  resetTimer,
  formatElapsed,
} from './presenter';

function slide(id: string, over: Parameters<typeof createSlide>[0] = {}) {
  return createSlide({ objects: [createObject({ id, html: `<div>${id}</div>` })], ...over });
}

describe('presenterView', () => {
  it('reports current + next slide and notes', () => {
    const deck = createDeck([
      slide('a', { notes: 'opening remarks' }),
      slide('b'),
      slide('c'),
    ]);
    const view = presenterView(deck);
    expect(view.current.objects[0].id).toBe('a');
    expect(view.next?.objects[0].id).toBe('b');
    expect(view.notes).toBe('opening remarks');
    expect(view.slideNumber).toBe(1);
    expect(view.slideCount).toBe(3);
  });

  it('has no next slide on the last slide', () => {
    let state = createDeck([slide('a'), slide('b')]);
    state = deckAdvance(state)!.state; // cross to slide b (no builds)
    const view = presenterView(state);
    expect(view.slideNumber).toBe(2);
    expect(view.next).toBeNull();
    expect(view.slideComplete).toBe(true);
  });

  it('defaults notes to empty string when absent', () => {
    expect(presenterView(createDeck([slide('a')])).notes).toBe('');
  });

  it('tracks build progress on the current slide', () => {
    const obj = createObject({
      id: 'x',
      html: '<div>x</div>',
      animations: [{ preset: 'fade', durationMs: 300, delayMs: 0, kind: 'enter' }],
    });
    const deck = createDeck([createSlide({ objects: [obj] })]);
    const v0 = presenterView(deck);
    expect(v0.buildPosition).toBe(0);
    expect(v0.buildCount).toBe(1);
    expect(v0.slideComplete).toBe(false);
    const advanced = deckAdvance(deck)!;
    const v1 = presenterView(advanced.state);
    expect(v1.buildPosition).toBe(1);
    expect(v1.slideComplete).toBe(true);
  });
});

describe('presenter timer', () => {
  it('accumulates while running (pure in now)', () => {
    const t = startTimer(1000);
    expect(isRunning(t)).toBe(true);
    expect(elapsedMs(t, 1000)).toBe(0);
    expect(elapsedMs(t, 4500)).toBe(3500);
  });

  it('a fresh timer is paused at zero', () => {
    const t = createTimer();
    expect(isRunning(t)).toBe(false);
    expect(elapsedMs(t, 9999)).toBe(0);
  });

  it('pause folds the active run; resume continues from accumulated', () => {
    let t = startTimer(0);
    t = pauseTimer(t, 5000); // 5s banked
    expect(isRunning(t)).toBe(false);
    expect(elapsedMs(t, 100000)).toBe(5000); // frozen while paused
    t = resumeTimer(t, 10000);
    expect(elapsedMs(t, 12000)).toBe(7000); // 5s banked + 2s new run
  });

  it('pause/resume are no-ops in the wrong state', () => {
    const running = startTimer(0);
    expect(resumeTimer(running, 100)).toBe(running);
    const paused = createTimer();
    expect(pauseTimer(paused, 100)).toBe(paused);
  });

  it('reset returns a paused zero clock', () => {
    expect(elapsedMs(resetTimer(), 5000)).toBe(0);
  });

  it('clamps negative elapsed to zero', () => {
    expect(elapsedMs({ accumulatedMs: 0, startedAt: 5000 }, 1000)).toBe(0);
  });
});

describe('formatElapsed', () => {
  it('formats M:SS below an hour', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(9_000)).toBe('0:09');
    expect(formatElapsed(125_000)).toBe('2:05');
  });

  it('formats H:MM:SS at or above an hour', () => {
    expect(formatElapsed(3_661_000)).toBe('1:01:01');
  });

  it('truncates to whole seconds and clamps negatives', () => {
    expect(formatElapsed(1_999)).toBe('0:01');
    expect(formatElapsed(-500)).toBe('0:00');
  });
});
