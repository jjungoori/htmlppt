/**
 * Editor — public façade tying Store + Renderer together and exposing the
 * library API. Selection-by-click and keyboard undo/redo are wired here;
 * drag/resize/rotate land in M2–M3.
 */
import { type SlideDocument } from '../core/model';
import { aabb, rectsIntersect, type Rect } from '../core/transform';
import { Store } from './store';
import { Renderer } from './renderer';
import { Overlay } from './overlay';
import { ensureBaseCss } from './styles';

export interface EditorOptions {
  width?: number;
  height?: number;
  doc?: SlideDocument;
}

export class Editor {
  readonly store: Store;
  readonly renderer: Renderer;
  readonly overlay: Overlay;

  constructor(host: HTMLElement, opts: EditorOptions = {}) {
    ensureBaseCss();
    this.store = new Store(opts.doc);
    if (opts.width) this.store.doc.width = opts.width;
    if (opts.height) this.store.doc.height = opts.height;
    this.renderer = new Renderer(host, this.store);
    this.overlay = new Overlay(this.renderer.stage, this.store);
    this.wireSelection();
    this.wireKeyboard();
  }

  /** Pointer position in slide-space coordinates. */
  private toStage(e: PointerEvent): { x: number; y: number } {
    const r = this.renderer.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Ids of objects whose AABB intersects a slide-space rect. */
  private objectsIn(rect: Rect): string[] {
    return this.store.slide.objects
      .filter((o) => rectsIntersect(aabb(o), rect))
      .map((o) => o.id);
  }

  /** Import arbitrary, untouched HTML as a manipulable object. */
  importHTML(html: string, box?: { x?: number; y?: number; w?: number; h?: number }) {
    return this.store.addObject({ html, ...box });
  }

  toJSON(): SlideDocument {
    return this.store.toJSON();
  }
  fromJSON(doc: SlideDocument): void {
    this.store.fromJSON(doc);
  }
  undo(): void {
    this.store.history.undo();
  }
  redo(): void {
    this.store.history.redo();
  }

  private wireSelection(): void {
    const stage = this.renderer.stage;
    stage.addEventListener('pointerdown', (e) => {
      const target = (e.target as HTMLElement).closest('.sc-object') as HTMLElement | null;
      if (target) {
        const id = target.dataset.id!;
        if (e.shiftKey) this.store.toggleSelection(id);
        else if (!this.store.selection.has(id)) this.store.setSelection([id]);
        return;
      }
      // Empty-area press starts a marquee.
      this.startMarquee(e);
    });
  }

  private startMarquee(down: PointerEvent): void {
    const stage = this.renderer.stage;
    const start = this.toStage(down);
    const additive = down.shiftKey;
    const base = additive ? [...this.store.selection] : [];
    if (!additive) this.store.setSelection([]);
    stage.setPointerCapture(down.pointerId);
    let moved = false;

    const onMove = (e: PointerEvent) => {
      const p = this.toStage(e);
      const rect: Rect = {
        x: Math.min(start.x, p.x),
        y: Math.min(start.y, p.y),
        w: Math.abs(p.x - start.x),
        h: Math.abs(p.y - start.y),
      };
      if (!moved && rect.w + rect.h < 3) return; // ignore micro-jitter clicks
      moved = true;
      this.overlay.showMarquee(rect);
      this.store.setSelection([...new Set([...base, ...this.objectsIn(rect)])]);
    };
    const onUp = () => {
      stage.releasePointerCapture(down.pointerId);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      this.overlay.hideMarquee();
      if (!moved && !additive) this.store.setSelection([]);
    };
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
  }

  private wireKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (meta && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        this.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.store.selection.size) {
        e.preventDefault();
        this.store.removeObjects([...this.store.selection]);
      }
    });
  }
}
