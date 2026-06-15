/**
 * M7 arrange operations as pure functions: z-order reordering, alignment and
 * distribution. Each returns a map of id → field changes so the store can wrap
 * the whole multi-object edit in a single undo entry. AABBs (rotation-aware)
 * drive align/distribute so the geometry matches what the user sees.
 */
import type { SlideObject } from './model';
import { aabb, unionRect } from './transform';

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type ZOp = 'front' | 'back' | 'forward' | 'backward';

export interface Delta {
  dx: number;
  dy: number;
}

/**
 * id → {dx,dy} to snap each object's AABB to the selection's bounding edge.
 * No-op (empty map) for fewer than 2 objects — alignment needs a reference.
 */
export function alignDeltas(objects: SlideObject[], edge: AlignEdge): Map<string, Delta> {
  const m = new Map<string, Delta>();
  if (objects.length < 2) return m;
  const boxes = objects.map((o) => ({ o, r: aabb(o) }));
  const union = unionRect(boxes.map((b) => b.r));
  if (!union) return m;
  for (const { o, r } of boxes) {
    let dx = 0;
    let dy = 0;
    switch (edge) {
      case 'left':
        dx = union.x - r.x;
        break;
      case 'right':
        dx = union.x + union.w - (r.x + r.w);
        break;
      case 'hcenter':
        dx = union.x + union.w / 2 - (r.x + r.w / 2);
        break;
      case 'top':
        dy = union.y - r.y;
        break;
      case 'bottom':
        dy = union.y + union.h - (r.y + r.h);
        break;
      case 'vcenter':
        dy = union.y + union.h / 2 - (r.y + r.h / 2);
        break;
    }
    if (dx || dy) m.set(o.id, { dx, dy });
  }
  return m;
}

/**
 * id → {dx,dy} to spread objects with equal gaps along an axis. The two end
 * objects stay put; the rest are repositioned so inter-object gaps are equal.
 * Needs at least 3 objects to be meaningful.
 */
export function distributeDeltas(objects: SlideObject[], axis: 'h' | 'v'): Map<string, Delta> {
  const m = new Map<string, Delta>();
  if (objects.length < 3) return m;
  const pos = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  const boxes = objects.map((o) => ({ o, r: aabb(o) })).sort((a, b) => a.r[pos] - b.r[pos]);
  const first = boxes[0].r;
  const last = boxes[boxes.length - 1].r;
  const start = first[pos];
  const end = last[pos] + last[size];
  const sumSizes = boxes.reduce((s, b) => s + b.r[size], 0);
  const gap = (end - start - sumSizes) / (boxes.length - 1);
  let cur = start;
  for (const { o, r } of boxes) {
    const delta = cur - r[pos];
    if (delta) m.set(o.id, axis === 'h' ? { dx: delta, dy: 0 } : { dx: 0, dy: delta });
    cur += r[size] + gap;
  }
  return m;
}

/**
 * id → new contiguous zIndex (0..n-1) after a z-order operation. The current
 * paint order is taken from zIndex (array index breaks ties); the result is
 * re-normalized so zIndex always equals paint position. Only changed ids are
 * returned.
 */
export function reorderZ(
  objects: SlideObject[],
  selected: Set<string>,
  op: ZOp,
): Map<string, number> {
  const order = objects
    .map((o, i) => ({ o, i }))
    .sort((a, b) => a.o.zIndex - b.o.zIndex || a.i - b.i)
    .map((x) => x.o);
  const isSel = (o: SlideObject) => selected.has(o.id);

  let next: SlideObject[];
  if (op === 'front') {
    next = [...order.filter((o) => !isSel(o)), ...order.filter(isSel)];
  } else if (op === 'back') {
    next = [...order.filter(isSel), ...order.filter((o) => !isSel(o))];
  } else {
    next = [...order];
    if (op === 'forward') {
      for (let i = next.length - 2; i >= 0; i--) {
        if (isSel(next[i]) && !isSel(next[i + 1])) {
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
      }
    } else {
      for (let i = 1; i < next.length; i++) {
        if (isSel(next[i]) && !isSel(next[i - 1])) {
          [next[i], next[i - 1]] = [next[i - 1], next[i]];
        }
      }
    }
  }

  const m = new Map<string, number>();
  next.forEach((o, idx) => {
    if (o.zIndex !== idx) m.set(o.id, idx);
  });
  return m;
}
