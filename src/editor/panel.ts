/**
 * Slide thumbnail panel (M8). A read-only rail of scaled-down slide previews:
 * click a thumbnail to switch slides, drag to reorder, and add/duplicate/remove
 * via the footer. The model stays the source of truth — this reflects it and
 * routes every mutation through the Store's M8 commands.
 */
import type { SlideObject } from '../core/model';
import { cssTransform } from '../core/transform';
import { themeVars } from '../core/theme';
import type { Store } from './store';

export interface SlidePanelOptions {
  /** Thumbnail width in px (height follows the document aspect ratio). */
  thumbWidth?: number;
}

export class SlidePanel {
  readonly root: HTMLDivElement;
  private list: HTMLDivElement;
  private readonly thumbWidth: number;
  private readonly dispose: () => void;
  private dragFrom: number | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly store: Store,
    opts: SlidePanelOptions = {},
  ) {
    this.thumbWidth = opts.thumbWidth ?? 160;
    this.root = document.createElement('div');
    this.root.className = 'sc-panel';
    this.list = document.createElement('div');
    this.list.className = 'sc-panel-list';
    this.root.appendChild(this.list);
    this.root.appendChild(this.buildToolbar());
    this.host.appendChild(this.root);

    const off = this.store.on('change', () => this.render());
    this.dispose = off;
    this.render();
  }

  /** Detach listeners and DOM. */
  destroy(): void {
    this.dispose();
    this.root.remove();
  }

  private buildToolbar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = 'sc-panel-toolbar';
    const mk = (label: string, title: string, fn: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    bar.append(
      mk('+', '슬라이드 추가', () => this.store.addSlide()),
      mk('⧉', '슬라이드 복제', () => this.store.duplicateSlide()),
      mk('🗑', '슬라이드 삭제', () => this.store.removeSlide()),
    );
    return bar;
  }

  private render(): void {
    const { doc } = this.store;
    const scale = this.thumbWidth / doc.width;
    this.list.replaceChildren();

    doc.slides.forEach((slide, index) => {
      const item = document.createElement('div');
      item.className = 'sc-thumb';
      item.classList.toggle('sc-thumb-active', index === this.store.currentSlideIndex);
      item.dataset.index = String(index);
      item.draggable = true;

      const num = document.createElement('span');
      num.className = 'sc-thumb-num';
      num.textContent = String(index + 1);

      const frame = document.createElement('div');
      frame.className = 'sc-thumb-frame';
      frame.style.width = `${this.thumbWidth}px`;
      frame.style.height = `${doc.height * scale}px`;

      const mini = this.buildMini(slide.objects, scale);
      frame.appendChild(mini);
      item.append(num, frame);

      item.addEventListener('click', () => this.store.setCurrentSlide(index));
      this.wireDrag(item, index);
      this.list.appendChild(item);
    });
  }

  /** A scaled, non-interactive clone of a slide's objects. */
  private buildMini(objects: SlideObject[], scale: number): HTMLDivElement {
    const { doc } = this.store;
    const theme = this.store.theme;
    const mini = document.createElement('div');
    mini.className = 'sc-thumb-stage';
    mini.style.width = `${doc.width}px`;
    mini.style.height = `${doc.height}px`;
    mini.style.transform = `scale(${scale})`;
    const vars = themeVars(theme);
    for (const [k, v] of Object.entries(vars)) mini.style.setProperty(k, v);
    mini.style.background = theme.palette.background;
    mini.style.color = theme.palette.text;
    mini.style.fontFamily = theme.fonts.body;

    for (const o of objects) {
      const node = document.createElement('div');
      node.className = 'sc-thumb-obj';
      node.style.width = `${o.w}px`;
      node.style.height = `${o.h}px`;
      node.style.transform = cssTransform(o);
      node.style.opacity = String(o.opacity);
      node.style.zIndex = String(o.zIndex);
      node.innerHTML = o.html;
      mini.appendChild(node);
    }
    return mini;
  }

  /** Drag-to-reorder, routed through Store.moveSlide (undoable). */
  private wireDrag(item: HTMLDivElement, index: number): void {
    item.addEventListener('dragstart', () => {
      this.dragFrom = index;
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      item.classList.add('sc-thumb-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('sc-thumb-over'));
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('sc-thumb-over');
      if (this.dragFrom != null && this.dragFrom !== index) {
        this.store.moveSlide(this.dragFrom, index);
      }
      this.dragFrom = null;
    });
  }
}
