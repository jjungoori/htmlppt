// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { presentRuntime } from './export';

const SEL =
  'a[href],button,input,select,textarea,label,summary,[contenteditable],[contenteditable="true"]';

function buildDeck(n: number) {
  document.body.innerHTML = Array.from({ length: n })
    .map((_, k) => `<section class="sc-slide" id="s${k}"></section>`)
    .join('');
}

function current(): string | null {
  return document.querySelector('.sc-slide.sc-current')?.id ?? null;
}

describe('presentRuntime (M13 embedded controller)', () => {
  beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = '';
  });

  it('shows the first slide and enters present mode', () => {
    buildDeck(3);
    presentRuntime(SEL);
    expect(document.body.classList.contains('sc-present')).toBe(true);
    expect(current()).toBe('s0');
  });

  it('advances and rewinds on plain clicks, clamped to bounds', () => {
    buildDeck(2);
    presentRuntime(SEL);
    document.body.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }));
    expect(current()).toBe('s1');
    // already at last slide → stays clamped
    document.body.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }));
    expect(current()).toBe('s1');
  });

  it('does NOT advance when an interactive element inside a slide is clicked', () => {
    buildDeck(2);
    document.getElementById('s0')!.innerHTML = '<a href="#x" id="link">go</a>';
    presentRuntime(SEL);
    const link = document.getElementById('link')!;
    link.dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }));
    expect(current()).toBe('s0');
  });

  it('ignores non-left clicks', () => {
    buildDeck(2);
    presentRuntime(SEL);
    document.body.dispatchEvent(new MouseEvent('click', { button: 2, bubbles: true }));
    expect(current()).toBe('s0');
  });

  it('navigates with arrow keys', () => {
    buildDeck(3);
    presentRuntime(SEL);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(current()).toBe('s1');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(current()).toBe('s2');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(current()).toBe('s0');
  });

  it('is a no-op when there are no slides', () => {
    presentRuntime(SEL);
    expect(document.body.classList.contains('sc-present')).toBe(false);
  });
});
