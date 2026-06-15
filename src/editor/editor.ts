/**
 * Editor — public façade tying Store + Renderer together and exposing the
 * library API. Selection-by-click and keyboard undo/redo are wired here;
 * drag/resize/rotate land in M2–M3.
 */
import { type SlideDocument, type SlideObject } from '../core/model';
import {
  createShape,
  createImage,
  type ShapeKind,
  type ShapeStyle,
  type ImageOptions,
} from '../core/shapes';
import { aabb, rectsIntersect, unionRect, type Rect } from '../core/transform';
import { computeResize, computeRotate, type Handle } from '../core/manipulate';
import { computeSnap } from '../core/snap';
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
    this.wireManipulation();
    this.wireTextEdit();
    this.wireKeyboard();
  }

  private dragSeq = 0;
  /** Id of the object currently in inline text-edit, or null. */
  private editingId: string | null = null;

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

  /** Add a vector shape (rect/ellipse/triangle/line) as a manipulable object. */
  addShape(kind: ShapeKind, style?: ShapeStyle, box?: Partial<SlideObject>) {
    return this.store.addObject(createShape(kind, style, box));
  }

  /** Add an image (URL or data URI) as a manipulable object. */
  addImage(src: string, box?: Partial<SlideObject>, opts?: ImageOptions) {
    return this.store.addObject(createImage(src, box, opts));
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
      // While editing text, let pointer events inside the edited object reach
      // the caret untouched; a press elsewhere just commits and falls through.
      if (this.editingId) {
        const within = (e.target as HTMLElement).closest('.sc-object') as HTMLElement | null;
        if (within?.dataset.id === this.editingId) return;
        this.commitEdit();
      }
      const target = (e.target as HTMLElement).closest('.sc-object') as HTMLElement | null;
      if (target) {
        const id = target.dataset.id!;
        if (e.shiftKey) this.store.toggleSelection(id);
        else if (!this.store.selection.has(id)) this.store.setSelection([id]);
        if (!e.shiftKey) this.startMove(e);
        return;
      }
      // Empty-area press starts a marquee.
      this.startMarquee(e);
    });
  }

  /** Drag the current selection. Move is relative, coalesced into one undo. */
  private startMove(down: PointerEvent): void {
    const stage = this.renderer.stage;
    const ids = [...this.store.selection];
    if (!ids.length) return;
    const start = this.toStage(down);
    const origins = ids.map((id) => {
      const o = this.store.find(id)!;
      return { id, x: o.x, y: o.y };
    });
    const selSet = new Set(ids);
    // Static targets to align against + the moving selection's union AABB.
    const targets = this.store.slide.objects
      .filter((o) => !selSet.has(o.id))
      .map((o) => aabb(o));
    const baseRect = unionRect(ids.map((id) => aabb(this.store.find(id)!)))!;
    const key = `move-${++this.dragSeq}`;
    stage.setPointerCapture(down.pointerId);
    let moved = false;

    const onMove = (e: PointerEvent) => {
      const p = this.toStage(e);
      let dx = p.x - start.x;
      let dy = p.y - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      if (!e.altKey) {
        const moving: Rect = { x: baseRect.x + dx, y: baseRect.y + dy, w: baseRect.w, h: baseRect.h };
        const snap = computeSnap(moving, targets, this.store.doc);
        dx += snap.dx;
        dy += snap.dy;
        this.overlay.showGuides(snap.guides);
      } else {
        this.overlay.hideGuides();
      }
      for (const o of origins) this.store.patch(o.id, { x: o.x + dx, y: o.y + dy }, key);
    };
    const onUp = () => {
      stage.releasePointerCapture(down.pointerId);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      this.overlay.hideGuides();
    };
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
  }

  /** Wire resize/rotate handles on the selection overlay. */
  private wireManipulation(): void {
    this.overlay.layer.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest('[data-handle]') as HTMLElement | null;
      if (!el) return;
      const sole = this.overlay.soleSelection();
      if (!sole) return;
      e.stopPropagation();
      const handle = el.dataset.handle!;
      if (handle === 'rotate') this.startRotate(e, sole.id);
      else this.startResize(e, sole.id, handle as Handle);
    });
  }

  private startResize(down: PointerEvent, id: string, handle: Handle): void {
    const layer = this.overlay.layer;
    const o0 = { ...this.store.find(id)! };
    const key = `resize-${++this.dragSeq}`;
    layer.setPointerCapture(down.pointerId);
    const onMove = (e: PointerEvent) => {
      const next = computeResize(o0, handle, this.toStage(e));
      this.store.patch(id, next, key);
    };
    const onUp = () => {
      layer.releasePointerCapture(down.pointerId);
      layer.removeEventListener('pointermove', onMove);
      layer.removeEventListener('pointerup', onUp);
    };
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
  }

  private startRotate(down: PointerEvent, id: string): void {
    const layer = this.overlay.layer;
    const o0 = { ...this.store.find(id)! };
    const start = this.toStage(down);
    const key = `rotate-${++this.dragSeq}`;
    layer.setPointerCapture(down.pointerId);
    const onMove = (e: PointerEvent) => {
      const angle = computeRotate(o0, start, this.toStage(e), e.shiftKey ? 15 : 0);
      this.store.patch(id, { angle }, key);
    };
    const onUp = () => {
      layer.releasePointerCapture(down.pointerId);
      layer.removeEventListener('pointermove', onMove);
      layer.removeEventListener('pointerup', onUp);
    };
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
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

  /** Double-click an object to edit its HTML content inline (M5). */
  private wireTextEdit(): void {
    this.renderer.stage.addEventListener('dblclick', (e) => {
      const target = (e.target as HTMLElement).closest('.sc-object') as HTMLElement | null;
      if (!target) return;
      const o = this.store.find(target.dataset.id!);
      if (o && !o.locked) this.enterEdit(o.id);
    });
  }

  /** Cached teardown for the active edit session, set by enterEdit. */
  private editFinish: ((commit: boolean) => void) | null = null;

  private enterEdit(id: string): void {
    if (this.editingId) this.commitEdit();
    const node = this.renderer.nodeFor(id);
    const content = node?.querySelector('.sc-content') as HTMLElement | null;
    if (!node || !content) return;
    const before = this.store.find(id)!.html;
    this.editingId = id;
    this.store.setSelection([id]);
    node.classList.add('sc-editing');
    content.contentEditable = 'true';
    content.focus();

    const finish = (commit: boolean): void => {
      if (this.editingId !== id) return;
      content.removeEventListener('blur', onBlur);
      content.removeEventListener('keydown', onKey);
      content.contentEditable = 'false';
      node.classList.remove('sc-editing');
      this.editingId = null;
      this.editFinish = null;
      const html = content.innerHTML;
      if (commit && html !== before) {
        // dataset.html still holds `before`, so renderer re-injects on change.
        this.store.patch(id, { html });
      } else if (!commit) {
        content.innerHTML = before; // revert
      }
    };
    const onBlur = (): void => finish(true);
    const onKey = (e: KeyboardEvent): void => {
      // Keep typing local: don't leak to global undo/redo/delete shortcuts.
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    };
    content.addEventListener('blur', onBlur);
    content.addEventListener('keydown', onKey);
    this.editFinish = finish;
  }

  /** Commit the in-progress edit, if any. */
  private commitEdit(): void {
    this.editFinish?.(true);
  }

  private wireKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (this.editingId) return; // inline edit owns the keyboard
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (meta && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        this.redo();
      } else if (meta && e.key.toLowerCase() === 'g' && e.shiftKey) {
        e.preventDefault();
        this.store.ungroup();
      } else if (meta && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        this.store.group();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.store.selection.size) {
        e.preventDefault();
        this.store.removeObjects([...this.store.selection]);
      }
    });
  }
}
