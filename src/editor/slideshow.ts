/**
 * Slideshow DOM driver (M11) — plays a deck fullscreen.
 *
 * The pure cores decide *what* happens: {@link createDeck} chains slides into a
 * click stream, {@link visibleAfter} derives per-position visibility, and
 * {@link resolveAnimation} turns presets into WAAPI keyframes. This class is the
 * thin DOM half: it mounts a fullscreen overlay, renders the active slide
 * scaled to fit, runs the fired animations via `element.animate`, and maps
 * keyboard/click input onto deck navigation. All sequencing lives in the cores,
 * so this file stays a renderer + input router.
 */

import type { SlideDocument } from '../core/model';
import { cssTransform } from '../core/transform';
import { themeVars, getTheme, DEFAULT_THEME, type Theme } from '../core/theme';
import { resolveAnimation } from '../core/animate';
import { visibleAfter } from '../core/presentation';
import {
  createDeck,
  currentSlide,
  deckAdvance,
  deckRetreat,
  type DeckState,
} from '../core/deck';
import type { TimelineEntry } from '../core/slideshow';

export interface SlideshowOptions {
  /** Slide index to open on (default: current). */
  startIndex?: number;
  /** Called when the slideshow closes (Escape or run off the end + click). */
  onClose?: () => void;
}

export class Slideshow {
  private root: HTMLDivElement;
  private stage: HTMLDivElement;
  private nodes = new Map<string, HTMLDivElement>();
  private state: DeckState;
  private readonly theme: Theme;
  private readonly onClose?: () => void;
  private disposed = false;

  constructor(private readonly doc: SlideDocument, opts: SlideshowOptions = {}) {
    this.theme = (doc.themeId && getTheme(doc.themeId)) || DEFAULT_THEME;
    this.onClose = opts.onClose;
    this.state = createDeck(doc.slides, opts.startIndex ?? 0);

    this.root = document.createElement('div');
    this.root.className = 'sc-show';
    this.root.tabIndex = 0;
    this.stage = document.createElement('div');
    this.stage.className = 'sc-show-stage';
    this.root.appendChild(this.stage);
    document.body.appendChild(this.root);

    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('contextmenu', this.onContext);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.fit);

    this.renderSlide();
    this.root.focus();
  }

  /** Render the active slide fresh, with visibility at the current position. */
  private renderSlide(): void {
    const slide = currentSlide(this.state);
    this.stage.style.width = `${this.doc.width}px`;
    this.stage.style.height = `${this.doc.height}px`;
    const vars = themeVars(this.theme);
    for (const [k, v] of Object.entries(vars)) this.stage.style.setProperty(k, v);
    this.stage.style.background = this.theme.palette.background;
    this.stage.style.color = this.theme.palette.text;
    this.stage.style.fontFamily = this.theme.fonts.body;

    this.stage.replaceChildren();
    this.nodes.clear();
    const visible = visibleAfter(slide, this.state.pres.position);
    for (const o of slide.objects.slice().sort((a, b) => a.zIndex - b.zIndex)) {
      const node = document.createElement('div');
      node.className = 'sc-show-object';
      node.dataset.id = o.id;
      node.style.width = `${o.w}px`;
      node.style.height = `${o.h}px`;
      node.style.transform = cssTransform(o);
      node.style.opacity = String(o.opacity);
      node.style.zIndex = String(o.zIndex);
      node.style.visibility = visible.has(o.id) ? 'visible' : 'hidden';
      node.innerHTML = `<div class="sc-content">${o.html}</div>`;
      this.stage.appendChild(node);
      this.nodes.set(o.id, node);
    }
    this.fit();
  }

  /** Scale the slide to fit the viewport while preserving aspect ratio. */
  private fit = (): void => {
    const sx = window.innerWidth / this.doc.width;
    const sy = window.innerHeight / this.doc.height;
    const scale = Math.min(sx, sy);
    this.stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };

  /** Play the animations that just fired, toggling visibility around them. */
  private playFired(fired: TimelineEntry[]): void {
    for (const entry of fired) {
      const node = this.nodes.get(entry.objectId);
      if (!node) continue;
      if (entry.spec.kind === 'enter') node.style.visibility = 'visible';
      const { keyframes, options } = resolveAnimation(entry.spec);
      const anim = node.animate?.(keyframes, options);
      if (entry.spec.kind === 'exit') {
        const hide = () => {
          node.style.visibility = 'hidden';
        };
        if (anim) anim.addEventListener('finish', hide, { once: true });
        else hide();
      }
    }
  }

  private next(): void {
    const res = deckAdvance(this.state);
    if (!res) {
      this.close();
      return;
    }
    this.state = res.state;
    if (res.slideChanged) this.renderSlide();
    else this.playFired(res.fired);
  }

  private prev(): void {
    const res = deckRetreat(this.state);
    if (!res) return;
    this.state = res.state;
    // Back-navigation is instant: re-render the slide at the new position
    // rather than reversing animations.
    this.renderSlide();
  }

  private onClick = (e: MouseEvent): void => {
    e.preventDefault();
    this.next();
  };

  private onContext = (e: MouseEvent): void => {
    e.preventDefault();
    this.prev();
  };

  private onKey = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
      case 'Enter':
        e.preventDefault();
        this.next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
      case 'Backspace':
        e.preventDefault();
        this.prev();
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  };

  /** Tear down the overlay and listeners. Idempotent. */
  close(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.fit);
    this.root.remove();
    this.onClose?.();
  }
}
