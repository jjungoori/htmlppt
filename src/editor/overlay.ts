/**
 * Selection overlay — a layer above the stage drawing the selection box,
 * resize/rotate handles, and the marquee rubber-band. Purely visual; all
 * mutation flows through the Store. For a single selected object the box is
 * oriented (rotated) with 8 resize handles + a rotate handle; for a
 * multi-selection it falls back to the axis-aligned union box (move only).
 */
import { aabb, cssTransform, unionRect, type Rect } from '../core/transform';
import { HANDLES } from '../core/manipulate';
import type { Guide } from '../core/snap';
import type { SlideObject } from '../core/model';
import type { Store } from './store';

export class Overlay {
  readonly layer: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private readonly rotateHandle: HTMLDivElement;
  private readonly handleEls: HTMLDivElement[] = [];
  private readonly marquee: HTMLDivElement;
  private readonly guideEls: HTMLDivElement[] = [];

  constructor(
    private readonly stage: HTMLElement,
    private readonly store: Store,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'sc-overlay';

    this.box = document.createElement('div');
    this.box.className = 'sc-selbox';
    this.box.style.display = 'none';

    for (const h of HANDLES) {
      const el = document.createElement('div');
      el.className = `sc-handle sc-h-${h}`;
      el.dataset.handle = h;
      this.box.appendChild(el);
      this.handleEls.push(el);
    }
    this.rotateHandle = document.createElement('div');
    this.rotateHandle.className = 'sc-rotate';
    this.rotateHandle.dataset.handle = 'rotate';
    this.box.appendChild(this.rotateHandle);

    this.marquee = document.createElement('div');
    this.marquee.className = 'sc-marquee';
    this.marquee.style.display = 'none';

    this.layer.append(this.box, this.marquee);
    this.stage.appendChild(this.layer);

    this.store.on('selection', () => this.renderSelection());
    this.store.on('change', () => this.renderSelection());
    this.renderSelection();
  }

  /** The single selected object, or null when 0 or >1 are selected. */
  soleSelection(): SlideObject | null {
    if (this.store.selection.size !== 1) return null;
    const [id] = this.store.selection;
    return this.store.find(id) ?? null;
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
    const sole = this.soleSelection();
    if (sole) {
      // Oriented box matching the object exactly — same size and the same
      // transform (translate + center rotate + scale) so the box never drifts
      // from the shape when rotated. transform-origin is 50% 50% (see styles).
      this.box.style.width = `${sole.w}px`;
      this.box.style.height = `${sole.h}px`;
      this.box.style.transform = cssTransform(sole);
      this.box.classList.add('sc-has-handles');
      this.box.style.display = 'block';
      return;
    }
    const r = this.selectionRect();
    if (!r) {
      this.box.style.display = 'none';
      return;
    }
    // Multi-selection: axis-aligned union, no handles.
    this.box.classList.remove('sc-has-handles');
    this.box.style.width = `${r.w}px`;
    this.box.style.height = `${r.h}px`;
    this.box.style.transform = `translate(${r.x}px, ${r.y}px)`;
    this.box.style.display = 'block';
  }

  showMarquee(r: Rect): void {
    this.marquee.style.transform = `translate(${r.x}px, ${r.y}px)`;
    this.marquee.style.width = `${r.w}px`;
    this.marquee.style.height = `${r.h}px`;
    this.marquee.style.display = 'block';
  }

  hideMarquee(): void {
    this.marquee.style.display = 'none';
  }

  /** Draw smart-guide lines (slide space); replaces any previously shown. */
  showGuides(guides: Guide[]): void {
    this.hideGuides();
    for (const g of guides) {
      const el = document.createElement('div');
      if (g.axis === 'x') {
        el.className = 'sc-guide sc-guide-x';
        el.style.transform = `translateX(${g.pos}px)`;
      } else {
        el.className = 'sc-guide sc-guide-y';
        el.style.transform = `translateY(${g.pos}px)`;
      }
      this.layer.appendChild(el);
      this.guideEls.push(el);
    }
  }

  hideGuides(): void {
    for (const el of this.guideEls) el.remove();
    this.guideEls.length = 0;
  }
}
