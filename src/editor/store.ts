/**
 * Document store. Holds the SlideDocument + current slide + selection, and is
 * the only place the document is mutated — always via History commands.
 */
import {
  type SlideDocument,
  type Slide,
  type SlideObject,
  type ObjectId,
  createDocument,
  createObject,
} from '../core/model';
import { History, type Command } from '../core/history';
import {
  alignDeltas,
  distributeDeltas,
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

  // ---- selection (not part of undo history) ----

  setSelection(ids: ObjectId[]): void {
    this.selection = new Set(ids);
    this.emit('selection');
  }

  toggleSelection(id: ObjectId): void {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
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
