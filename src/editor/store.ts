/**
 * Document store. Holds the SlideDocument + current slide + selection, and is
 * the only place the document is mutated — always via History commands.
 */
import {
  type SlideDocument,
  type Slide,
  type SlideObject,
  type ObjectId,
  type SlideId,
  createDocument,
  createObject,
  createSlide,
  uid,
} from '../core/model';
import { History, type Command } from '../core/history';
import {
  alignDeltas,
  distributeDeltas,
  expandToGroups,
  reorderZ,
  type AlignEdge,
  type ZOp,
} from '../core/arrange';

export type StoreEvent = 'change' | 'selection';

export class Store {
  doc: SlideDocument;
  currentSlideIndex = 0;
  selection = new Set<ObjectId>();
  readonly history = new History();

  private listeners: Record<StoreEvent, Set<() => void>> = {
    change: new Set(),
    selection: new Set(),
  };

  constructor(doc?: SlideDocument) {
    this.doc = doc ?? createDocument();
    this.history.subscribe(() => this.emit('change'));
  }

  get slide(): Slide {
    return this.doc.slides[this.currentSlideIndex];
  }

  find(id: ObjectId): SlideObject | undefined {
    return this.slide.objects.find((o) => o.id === id);
  }

  on(ev: StoreEvent, fn: () => void): () => void {
    this.listeners[ev].add(fn);
    return () => this.listeners[ev].delete(fn);
  }

  private emit(ev: StoreEvent): void {
    for (const fn of this.listeners[ev]) fn();
  }

  // ---- mutations (all routed through History) ----

  addObject(init: Partial<SlideObject> & { html: string }): SlideObject {
    const obj = createObject(init);
    const slide = this.slide;
    const cmd: Command = {
      label: 'add object',
      apply: () => slide.objects.push(obj),
      invert: () => {
        const i = slide.objects.indexOf(obj);
        if (i >= 0) slide.objects.splice(i, 1);
      },
    };
    this.history.push(cmd);
    return obj;
  }

  removeObjects(ids: ObjectId[]): void {
    const slide = this.slide;
    const removed = ids
      .map((id) => {
        const obj = slide.objects.find((o) => o.id === id);
        return obj ? { obj, index: slide.objects.indexOf(obj) } : null;
      })
      .filter((x): x is { obj: SlideObject; index: number } => !!x)
      .sort((a, b) => a.index - b.index);
    if (!removed.length) return;
    const cmd: Command = {
      label: 'remove objects',
      apply: () => {
        for (const { obj } of removed) {
          const i = slide.objects.indexOf(obj);
          if (i >= 0) slide.objects.splice(i, 1);
        }
      },
      invert: () => {
        for (const { obj, index } of removed) slide.objects.splice(index, 0, obj);
      },
    };
    this.history.push(cmd);
    this.setSelection([]);
  }

  /**
   * Patch one object's transform/style fields. `coalesceKey` lets a drag emit
   * many patches that collapse into a single undo entry.
   */
  patch(id: ObjectId, changes: Partial<SlideObject>, coalesceKey?: string): void {
    const obj = this.find(id);
    if (!obj) return;
    const before: Partial<SlideObject> = {};
    const after: Partial<SlideObject> = {};
    for (const k of Object.keys(changes) as (keyof SlideObject)[]) {
      (before as Record<string, unknown>)[k] = obj[k];
      (after as Record<string, unknown>)[k] = changes[k];
    }
    const cmd: PatchCommand = {
      label: 'patch',
      coalesceKey,
      ids: new Set([id]),
      apply: () => Object.assign(obj, after),
      invert: () => Object.assign(obj, before),
      mergeWith(next) {
        if (
          next instanceof Object &&
          'coalesceKey' in next &&
          (next as PatchCommand).coalesceKey === coalesceKey &&
          coalesceKey != null &&
          (next as PatchCommand).ids?.has(id)
        ) {
          Object.assign(after, (next as PatchCommand).after ?? {});
          Object.assign(obj, after);
          return true;
        }
        return false;
      },
      after,
    };
    this.history.push(cmd, coalesceKey != null);
  }

  /** Apply per-object field changes as one undo entry. */
  private patchMany(label: string, changes: Map<ObjectId, Partial<SlideObject>>): void {
    const before = new Map<ObjectId, Partial<SlideObject>>();
    const after = new Map<ObjectId, Partial<SlideObject>>();
    for (const [id, ch] of changes) {
      const obj = this.find(id);
      if (!obj) continue;
      const b: Partial<SlideObject> = {};
      const a: Partial<SlideObject> = {};
      for (const k of Object.keys(ch) as (keyof SlideObject)[]) {
        (b as Record<string, unknown>)[k] = obj[k];
        (a as Record<string, unknown>)[k] = ch[k];
      }
      before.set(id, b);
      after.set(id, a);
    }
    if (!after.size) return;
    const apply = (m: Map<ObjectId, Partial<SlideObject>>) => () => {
      for (const [id, vals] of m) {
        const obj = this.find(id);
        if (obj) Object.assign(obj, vals);
      }
    };
    this.history.push({ label, apply: apply(after), invert: apply(before) });
  }

  private selectedObjects(): SlideObject[] {
    return this.slide.objects.filter((o) => this.selection.has(o.id));
  }

  /** Align selected objects' bounding boxes to a shared edge (M7). */
  align(edge: AlignEdge): void {
    const objs = this.selectedObjects();
    const deltas = alignDeltas(objs, edge);
    const changes = new Map<ObjectId, Partial<SlideObject>>();
    for (const o of objs) {
      const d = deltas.get(o.id);
      if (d) changes.set(o.id, { x: o.x + d.dx, y: o.y + d.dy });
    }
    this.patchMany(`align ${edge}`, changes);
  }

  /** Distribute selected objects with equal gaps along an axis (M7). */
  distribute(axis: 'h' | 'v'): void {
    const objs = this.selectedObjects();
    const deltas = distributeDeltas(objs, axis);
    const changes = new Map<ObjectId, Partial<SlideObject>>();
    for (const o of objs) {
      const d = deltas.get(o.id);
      if (d) changes.set(o.id, { x: o.x + d.dx, y: o.y + d.dy });
    }
    this.patchMany(`distribute ${axis}`, changes);
  }

  /** Re-stack selected objects: front / back / forward / backward (M7). */
  reorder(op: ZOp): void {
    const z = reorderZ(this.slide.objects, this.selection, op);
    const changes = new Map<ObjectId, Partial<SlideObject>>();
    for (const [id, zIndex] of z) changes.set(id, { zIndex });
    this.patchMany(`z-order ${op}`, changes);
  }

  /** Bind selected objects (≥2) under a fresh shared groupId (M7). */
  group(): void {
    const objs = this.selectedObjects();
    if (objs.length < 2) return;
    const gid = uid('g');
    const changes = new Map<ObjectId, Partial<SlideObject>>();
    for (const o of objs) if (o.groupId !== gid) changes.set(o.id, { groupId: gid });
    this.patchMany('group', changes);
  }

  /** Clear groupId on every member of the selected objects' groups (M7). */
  ungroup(): void {
    const gids = new Set(
      this.selectedObjects()
        .map((o) => o.groupId)
        .filter((g): g is ObjectId => !!g),
    );
    if (!gids.size) return;
    const changes = new Map<ObjectId, Partial<SlideObject>>();
    for (const o of this.slide.objects) {
      if (o.groupId && gids.has(o.groupId)) changes.set(o.id, { groupId: null });
    }
    this.patchMany('ungroup', changes);
  }

  // ---- slide management (M8) ----

  /** Clamp + switch the active slide. Navigation only, not undoable. */
  setCurrentSlide(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.doc.slides.length - 1));
    if (clamped === this.currentSlideIndex) return;
    this.currentSlideIndex = clamped;
    this.setSelection([]);
    this.emit('change');
  }

  /** Insert a blank slide after `index` (default: after current) and select it. */
  addSlide(at?: number): Slide {
    const index = (at ?? this.currentSlideIndex) + 1;
    const slide = createSlide();
    const cmd: Command = {
      label: 'add slide',
      apply: () => {
        this.doc.slides.splice(index, 0, slide);
        this.currentSlideIndex = index;
      },
      invert: () => {
        const i = this.doc.slides.indexOf(slide);
        if (i >= 0) this.doc.slides.splice(i, 1);
        this.currentSlideIndex = Math.min(this.currentSlideIndex, this.doc.slides.length - 1);
      },
    };
    this.history.push(cmd);
    this.setSelection([]);
    return slide;
  }

  /** Deep-copy a slide (fresh ids) and insert it right after the source. */
  duplicateSlide(id?: SlideId): Slide | undefined {
    const srcIndex =
      id != null ? this.doc.slides.findIndex((s) => s.id === id) : this.currentSlideIndex;
    if (srcIndex < 0) return undefined;
    const src = this.doc.slides[srcIndex];
    const copy = createSlide({
      objects: src.objects.map((o) => createObject({ ...o, id: uid('o') })),
    });
    const index = srcIndex + 1;
    const cmd: Command = {
      label: 'duplicate slide',
      apply: () => {
        this.doc.slides.splice(index, 0, copy);
        this.currentSlideIndex = index;
      },
      invert: () => {
        const i = this.doc.slides.indexOf(copy);
        if (i >= 0) this.doc.slides.splice(i, 1);
        this.currentSlideIndex = Math.min(this.currentSlideIndex, this.doc.slides.length - 1);
      },
    };
    this.history.push(cmd);
    this.setSelection([]);
    return copy;
  }

  /** Remove a slide. The document always keeps at least one slide. */
  removeSlide(id?: SlideId): void {
    if (this.doc.slides.length <= 1) return;
    const index =
      id != null ? this.doc.slides.findIndex((s) => s.id === id) : this.currentSlideIndex;
    if (index < 0) return;
    const slide = this.doc.slides[index];
    const cmd: Command = {
      label: 'remove slide',
      apply: () => {
        this.doc.slides.splice(index, 1);
        this.currentSlideIndex = Math.min(this.currentSlideIndex, this.doc.slides.length - 1);
      },
      invert: () => {
        this.doc.slides.splice(index, 0, slide);
        this.currentSlideIndex = index;
      },
    };
    this.history.push(cmd);
    this.setSelection([]);
  }

  /** Reorder a slide from `from` to `to` (both clamped). */
  moveSlide(from: number, to: number): void {
    const n = this.doc.slides.length;
    if (from < 0 || from >= n) return;
    const dest = Math.max(0, Math.min(to, n - 1));
    if (dest === from) return;
    const slide = this.doc.slides[from];
    const cmd: Command = {
      label: 'move slide',
      apply: () => {
        this.doc.slides.splice(from, 1);
        this.doc.slides.splice(dest, 0, slide);
        this.currentSlideIndex = dest;
      },
      invert: () => {
        const i = this.doc.slides.indexOf(slide);
        if (i >= 0) this.doc.slides.splice(i, 1);
        this.doc.slides.splice(from, 0, slide);
        this.currentSlideIndex = from;
      },
    };
    this.history.push(cmd);
  }

  // ---- clipboard (M9) ----

  /** Detached snapshots of the last copied/cut objects, in paint order. */
  private clipboard: SlideObject[] = [];

  /** Snapshot the current selection into the clipboard (deep copies). */
  copy(): void {
    const objs = this.selectedObjects();
    if (!objs.length) return;
    this.clipboard = objs.map((o) => structuredClone(o));
  }

  /** Copy then remove the selection in one shot. */
  cut(): void {
    if (!this.selection.size) return;
    this.copy();
    this.removeObjects([...this.selection]);
  }

  /**
   * Insert the clipboard onto the current slide with fresh ids, nudged by
   * `offset` px so copies don't sit exactly on the originals. Group membership
   * is preserved among pasted objects (remapped to fresh groupIds). The newly
   * pasted objects become the selection. Single undoable entry.
   */
  paste(offset = 16): SlideObject[] {
    if (!this.clipboard.length) return [];
    const groupRemap = new Map<ObjectId, ObjectId>();
    const pasted = this.clipboard.map((src) => {
      let groupId = src.groupId;
      if (groupId != null) {
        let next = groupRemap.get(groupId);
        if (!next) {
          next = uid('g');
          groupRemap.set(groupId, next);
        }
        groupId = next;
      }
      return createObject({
        ...src,
        id: uid('o'),
        x: src.x + offset,
        y: src.y + offset,
        groupId,
      });
    });
    const slide = this.slide;
    const cmd: Command = {
      label: 'paste',
      apply: () => slide.objects.push(...pasted),
      invert: () => {
        for (const obj of pasted) {
          const i = slide.objects.indexOf(obj);
          if (i >= 0) slide.objects.splice(i, 1);
        }
      },
    };
    this.history.push(cmd);
    this.setSelection(pasted.map((o) => o.id));
    return pasted;
  }

  // ---- selection (not part of undo history) ----

  setSelection(ids: ObjectId[]): void {
    this.selection = expandToGroups(this.slide.objects, ids);
    this.emit('selection');
  }

  toggleSelection(id: ObjectId): void {
    const next = new Set(this.selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selection = expandToGroups(this.slide.objects, next);
    this.emit('selection');
  }

  // ---- serialization ----

  toJSON(): SlideDocument {
    return structuredClone(this.doc);
  }

  fromJSON(doc: SlideDocument): void {
    this.doc = structuredClone(doc);
    this.currentSlideIndex = 0;
    this.setSelection([]);
    this.emit('change');
  }
}

interface PatchCommand extends Command {
  coalesceKey?: string;
  ids?: Set<ObjectId>;
  after?: Partial<SlideObject>;
}
