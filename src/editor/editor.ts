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
import {
  createTable,
  parseTable,
  renderTable,
  type TableData,
  type TableStyle,
} from '../core/tables';
import {
  createChart,
  parseChart,
  renderChart,
  type ChartData,
  type ChartKind,
  type ChartSeries,
  type ChartStyle,
} from '../core/charts';
import {
  createConnector,
  createConnectorData,
  parseConnector,
  renderConnector,
  routeConnector,
  type AnchorSide,
  type ConnectorData,
  type ConnectorRouting,
  type ConnectorStyle,
} from '../core/connectors';
import {
  createPath,
  parsePath,
  booleanPath,
  type PathData,
  type BooleanOp,
} from '../core/path';
import { aabb, rectsIntersect, unionRect, type Rect } from '../core/transform';
import { computeResize, computeRotate, type Handle } from '../core/manipulate';
import { computeSnap } from '../core/snap';
import { Store } from './store';
import { Renderer } from './renderer';
import { Overlay } from './overlay';
import { SlidePanel, type SlidePanelOptions } from './panel';
import { Toolbar, type ToolbarOptions } from './toolbar';
import { PropertyPanel } from './properties';
import { Slideshow, type SlideshowOptions } from './slideshow';
import { importHTMLDocument, type ImportLayout } from '../core/import';
import { importDeckDocument } from '../core/import-deck';
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

  /**
   * Pointer position in slide-space coordinates. Divides by the stage's actual
   * rendered scale (rect size vs. layout size) so direct manipulation stays
   * correct even when the host CSS-scales the stage to fit (e.g. demo auto-fit).
   */
  private toStage(e: PointerEvent): { x: number; y: number } {
    const stage = this.renderer.stage;
    const r = stage.getBoundingClientRect();
    const sx = stage.offsetWidth ? r.width / stage.offsetWidth : 1;
    const sy = stage.offsetHeight ? r.height / stage.offsetHeight : 1;
    return { x: (e.clientX - r.left) / (sx || 1), y: (e.clientY - r.top) / (sy || 1) };
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

  /**
   * Import an arbitrary HTML document/fragment, splitting its top-level elements
   * into one manipulable object each (markup untouched) and auto-laying them out
   * in a grid across the slide. Added as a single undo entry; returns the new
   * objects, which become the selection.
   */
  importDocument(html: string, layout?: ImportLayout): SlideObject[] {
    const objs = this.store.addObjects(importHTMLDocument(html, this.store.doc, layout));
    if (objs.length) this.store.setSelection(objs.map((o) => o.id));
    return objs;
  }

  /**
   * Import an AI-generated HTML slide as editable objects — the headline use
   * case. Unwraps a single wrapping container (e.g. `<div class="slide">…</div>`)
   * into its child blocks so each heading/paragraph/image becomes an
   * independently movable, resizable, editable object, just like PowerPoint.
   * Markup is left untouched. One undo entry; the new objects become selection.
   */
  importSlideHTML(html: string, layout?: ImportLayout): SlideObject[] {
    return this.importDocument(html, { unwrap: true, ...layout });
  }

  /**
   * Load a full multi-slide deck (SlideCraft-exported HTML or a page of slide
   * sections) — replaces the current document. Returns this editor for chaining.
   */
  importDeck(html: string): this {
    this.store.fromJSON(importDeckDocument(html));
    return this;
  }

  /** Append a new blank slide after `at` (default: after current) and show it. */
  addSlide(at?: number) {
    return this.store.addSlide(at);
  }
  /** Duplicate a slide by id (default: current) and show the copy. */
  duplicateSlide(id?: string) {
    return this.store.duplicateSlide(id);
  }
  /** Remove a slide by id (default: current). Keeps at least one slide. */
  removeSlide(id?: string): void {
    this.store.removeSlide(id);
  }
  /** Switch the visible slide by index. */
  setCurrentSlide(index: number): void {
    this.store.setCurrentSlide(index);
  }

  /** Add a vector shape (rect/ellipse/triangle/line) as a manipulable object. */
  addShape(kind: ShapeKind, style?: ShapeStyle, box?: Partial<SlideObject>) {
    return this.store.addObject(createShape(kind, style, box));
  }

  /** Add an image (URL or data URI) as a manipulable object. */
  addImage(src: string, box?: Partial<SlideObject>, opts?: ImageOptions) {
    return this.store.addObject(createImage(src, box, opts));
  }

  /** Add a table object (rows×cols) as a manipulable object (M16). */
  addTable(
    rows = 3,
    cols = 3,
    opts?: { headerRow?: boolean; style?: TableStyle },
    box?: Partial<SlideObject>,
  ) {
    return this.store.addObject(createTable(rows, cols, opts, box));
  }

  /**
   * Edit the table inside object `id`: read its html back into a grid, apply a
   * pure transform, and re-render through the command layer (undoable). No-op if
   * the object isn't a table. Returns the new {@link TableData} (or null).
   */
  editTable(id: string, fn: (data: TableData) => TableData): TableData | null {
    const obj = this.store.find(id);
    if (!obj) return null;
    const data = parseTable(obj.html);
    if (!data) return null;
    const next = fn(data);
    this.store.patch(id, { html: renderTable(next) });
    return next;
  }

  /** Add a chart object (bar/line/pie) as a manipulable object (M17). */
  addChart(
    kind: ChartKind,
    categories: string[],
    series: ChartSeries[],
    style?: ChartStyle,
    box?: Partial<SlideObject>,
  ) {
    return this.store.addObject(createChart(kind, categories, series, style, box));
  }

  /**
   * Edit the chart inside object `id`: read its html back into a {@link ChartData}
   * spec, apply a pure transform, and re-render through the command layer
   * (undoable). No-op if the object isn't a chart. Returns the new spec (or null).
   */
  editChart(id: string, fn: (data: ChartData) => ChartData): ChartData | null {
    const obj = this.store.find(id);
    if (!obj) return null;
    const data = parseChart(obj.html);
    if (!data) return null;
    const next = fn(data);
    this.store.patch(id, { html: renderChart(next) });
    return next;
  }

  /**
   * Add a connector (M18) anchoring object `fromId` to object `toId`. Routes
   * between their current boxes and adds the line as a manipulable object.
   * No-op (returns null) if either endpoint is missing.
   */
  addConnector(
    fromId: string,
    toId: string,
    opts: {
      fromSide?: AnchorSide;
      toSide?: AnchorSide;
      routing?: ConnectorRouting;
      arrowStart?: boolean;
      arrowEnd?: boolean;
      style?: ConnectorStyle;
    } = {},
    box?: Partial<SlideObject>,
  ): SlideObject | null {
    const from = this.store.find(fromId);
    const to = this.store.find(toId);
    if (!from || !to) return null;
    const data = createConnectorData(fromId, toId, opts);
    return this.store.addObject(createConnector(data, aabb(from), aabb(to), box));
  }

  /**
   * Edit the connector inside object `id`: read its spec back, apply a pure
   * transform, re-route from the current endpoint boxes, and re-render through
   * the command layer (undoable). No-op if `id` isn't a connector or an endpoint
   * is missing. Returns the new spec (or null).
   */
  editConnector(id: string, fn: (data: ConnectorData) => ConnectorData): ConnectorData | null {
    const obj = this.store.find(id);
    if (!obj) return null;
    const data = parseConnector(obj.html);
    if (!data) return null;
    const next = fn(data);
    if (!this.reroute(id, next)) return null;
    return next;
  }

  /**
   * Re-route every connector whose endpoints still exist to follow the current
   * object boxes (M18 auto-tracking). Called after a move/resize. Coalesces into
   * the given undo key, if any.
   */
  reflowConnectors(key?: string): void {
    for (const o of this.store.slide.objects.slice()) {
      const data = parseConnector(o.html);
      if (data) this.reroute(o.id, data, key);
    }
  }

  /** Route `data` from its current endpoints and patch object `id`. */
  private reroute(id: string, data: ConnectorData, key?: string): boolean {
    const from = this.store.find(data.from.ref);
    const to = this.store.find(data.to.ref);
    if (!from || !to) return false;
    const { points, bbox } = routeConnector(data, aabb(from), aabb(to));
    this.store.patch(
      id,
      { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h, html: renderConnector(data, points, bbox) },
      key,
    );
    return true;
  }

  /** Add an editable path object (M19) as a manipulable object. */
  addPath(data: PathData, box?: Partial<SlideObject>): SlideObject {
    return this.store.addObject(createPath(data, box));
  }

  /**
   * Edit the path inside object `id`: read its spec back, apply a pure point
   * transform, re-fit the object box to the new bbox, and re-render through the
   * command layer (undoable). No-op if `id` isn't a path. Returns the new spec.
   */
  editPath(id: string, fn: (data: PathData) => PathData): PathData | null {
    const obj = this.store.find(id);
    if (!obj) return null;
    const data = parsePath(obj.html);
    if (!data) return null;
    const next = fn(data);
    const init = createPath(next);
    this.store.patch(id, { x: init.x, y: init.y, w: init.w, h: init.h, html: init.html });
    return next;
  }

  /**
   * Merge two path objects with a boolean op (union/intersection/difference,
   * M19). Reads both specs (which already share slide-space coordinates), runs
   * the pure {@link booleanPath}, then — through the command layer — removes the
   * operands and adds the result ring(s) in a single undo step. Returns the new
   * object id(s), or an empty array if `idA`/`idB` aren't paths or the op yields
   * nothing.
   */
  mergeShapes(idA: string, idB: string, op: BooleanOp): string[] {
    const a = this.store.find(idA);
    const b = this.store.find(idB);
    if (!a || !b) return [];
    const da = parsePath(a.html);
    const db = parsePath(b.html);
    if (!da || !db) return [];
    const rings = booleanPath(da, db, op);
    if (rings.length === 0) return [];
    const added = this.store.replaceObjects([idA, idB], rings.map((r) => createPath(r)));
    return added.map((o) => o.id);
  }

  /** Switch the document theme by id (M10). Undoable. */
  setTheme(id: string): void {
    this.store.setTheme(id);
  }

  /** Mount a live slide-thumbnail panel (M8) into `host`. */
  mountSlidePanel(host: HTMLElement, opts?: SlidePanelOptions): SlidePanel {
    return new SlidePanel(host, this.store, opts);
  }

  /** Mount the command toolbar (M15) into `host`. */
  mountToolbar(host: HTMLElement, opts?: ToolbarOptions): Toolbar {
    return new Toolbar(host, this, opts);
  }

  /** Mount the selection property inspector (M15) into `host`. */
  mountProperties(host: HTMLElement): PropertyPanel {
    return new PropertyPanel(host, this.store);
  }

  /** Active slideshow, if any (guards against double-launch). */
  private show: Slideshow | null = null;

  /**
   * Launch a fullscreen slideshow (M11) from the current slide. Snapshots the
   * document so playback never mutates the editor's state. Returns the running
   * {@link Slideshow}; Escape (or running off the end) closes it.
   */
  startSlideshow(opts: SlideshowOptions = {}): Slideshow {
    this.show?.close();
    if (this.editingId) this.commitEdit();
    this.show = new Slideshow(this.store.toJSON(), {
      startIndex: this.store.currentSlideIndex,
      ...opts,
      onClose: () => {
        this.show = null;
        opts.onClose?.();
      },
    });
    return this.show;
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
      this.reflowConnectors(key);
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
      this.reflowConnectors(key);
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
      if (e.key === 'F5') {
        e.preventDefault();
        this.startSlideshow();
        return;
      }
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
      } else if (meta && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        this.store.copy();
      } else if (meta && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        this.store.cut();
      } else if (meta && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        this.store.paste();
      } else if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        this.store.duplicate();
      } else if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.store.selectAll();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.store.selection.size) {
        e.preventDefault();
        this.store.removeObjects([...this.store.selection]);
      } else if (e.key.startsWith('Arrow') && this.store.selection.size) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        this.store.nudge(dx, dy);
      }
    });
  }
}
