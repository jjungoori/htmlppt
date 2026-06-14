/**
 * Selection overlay — a layer above the stage that draws the bounding box of
 * the current selection and the marquee rubber-band. It is purely visual;
 * mutation still flows through the Store. Handles (resize/rotate) land in M3.
 */
import { aabb, unionRect, type Rect } from '../core/transform';
import type { Store } from './store';

export class Overlay {
  readonly layer: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private readonly marquee: HTMLDivElement;

  constructor(
    private readonly stage: HTMLElement,
    private readonly store: Store,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'sc-overlay';

    this.box = document.createElement('div');
    this.box.className = 'sc-selbox';
    this.box.style.display = 'none';

    this.marquee = document.createElement('div');
    this.marquee.className = 'sc-marquee';
    this.marquee.style.display = 'none';

    this.layer.append(this.box, this.marquee);
    this.stage.appendChild(this.layer);

    this.store.on('selection', () => this.renderSelection());
    this.store.on('change', () => this.renderSelection());
    this.renderSelection();
  }

  /** Bounding rect (slide space) of the current selection, or null. */
  selectionRect(): Rect | null {
    const rects: Rect[] = [];
    for (const id of this.store.selection) {
      const o = this.store.find(id);
      if (o) rects.push(aabb(o));
    }
    return unionRect(rects);
  }

  renderSelection(): void {
    const r = this.selectionRect();
    if (!r) {
      this.box.style.display = 'none';
      return;
    }
    place(this.box, r);
    this.box.style.display = 'block';
  }

  showMarquee(r: Rect): void {
    place(this.marquee, r);
    this.marquee.style.display = 'block';
  }

  hideMarquee(): void {
    this.marquee.style.display = 'none';
  }
}

function place(el: HTMLElement, r: Rect): void {
  el.style.transform = `translate(${r.x}px, ${r.y}px)`;
  el.style.width = `${r.w}px`;
  el.style.height = `${r.h}px`;
}
