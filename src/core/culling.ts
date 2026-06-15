/**
 * Viewport culling + uniform spatial grid (M23, performance slice) — pure core.
 *
 * A deck can hold thousands of objects, but at any zoom/scroll only the ones
 * overlapping the visible region need to be in the DOM. This module is the
 * DOM-free brain that, given the objects and a viewport rect (both in slide
 * space), decides *which objects are visible*. It never touches the DOM and is
 * fully deterministic — a renderer feeds it the current viewport and mounts only
 * the returned objects, which is what keeps large decks responsive.
 *
 * Two strategies, same result (precise AABB ∩ viewport):
 *  - {@link cullObjects} — a single linear pass; simplest, fine up to a few
 *    hundred objects.
 *  - {@link buildSpatialGrid} + {@link queryGrid} — a uniform grid bucketing
 *    objects by AABB so a viewport query only visits nearby cells, making the
 *    query sublinear in total object count for big decks.
 *
 * Both preserve the input order (so paint/z-order is unaffected) and accept an
 * optional `margin` to over-render a halo around the viewport (smoother scroll).
 */

import type { SlideObject } from './model';
import { type Rect, aabb, rectsIntersect } from './transform';

/** Grow a rect outward by `margin` on every side (negative shrinks). */
export function expandRect(r: Rect, margin: number): Rect {
  return {
    x: r.x - margin,
    y: r.y - margin,
    w: r.w + margin * 2,
    h: r.h + margin * 2,
  };
}

/**
 * Objects whose rotation-aware AABB overlaps `viewport` (expanded by `margin`),
 * in input order. Linear scan — the simple baseline.
 */
export function cullObjects(
  objects: SlideObject[],
  viewport: Rect,
  margin = 0,
): SlideObject[] {
  const view = margin ? expandRect(viewport, margin) : viewport;
  return objects.filter((o) => rectsIntersect(aabb(o), view));
}

/**
 * A uniform grid that buckets objects (by index) into square cells of
 * `cellSize`, so a viewport query only inspects the cells it covers. An object
 * spanning several cells is registered in each — `queryGrid` de-duplicates.
 */
export interface SpatialGrid {
  cellSize: number;
  /** key `"col,row"` → object indices whose AABB touches that cell. */
  cells: Map<string, number[]>;
  /** Cached AABBs, index-aligned with the source objects (avoids recompute). */
  boxes: Rect[];
}

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** Inclusive cell-coordinate range a rect spans for a given cell size. */
function cellRange(r: Rect, cellSize: number) {
  return {
    minCol: Math.floor(r.x / cellSize),
    maxCol: Math.floor((r.x + r.w) / cellSize),
    minRow: Math.floor(r.y / cellSize),
    maxRow: Math.floor((r.y + r.h) / cellSize),
  };
}

/**
 * Build a {@link SpatialGrid} over `objects`. `cellSize` should be roughly the
 * typical object size; must be > 0.
 */
export function buildSpatialGrid(objects: SlideObject[], cellSize: number): SpatialGrid {
  if (!(cellSize > 0)) throw new RangeError('cellSize must be > 0');
  const cells = new Map<string, number[]>();
  const boxes: Rect[] = [];
  objects.forEach((o, i) => {
    const box = aabb(o);
    boxes.push(box);
    const { minCol, maxCol, minRow, maxRow } = cellRange(box, cellSize);
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const key = cellKey(col, row);
        const bucket = cells.get(key);
        if (bucket) bucket.push(i);
        else cells.set(key, [i]);
      }
    }
  });
  return { cellSize, cells, boxes };
}

/**
 * Objects in `objects` visible in `viewport` (expanded by `margin`) using the
 * grid, returned in input order. Visits only the cells the viewport covers, then
 * confirms each candidate with a precise AABB test — same result as
 * {@link cullObjects} but sublinear for large decks.
 */
export function queryGrid(
  grid: SpatialGrid,
  objects: SlideObject[],
  viewport: Rect,
  margin = 0,
): SlideObject[] {
  const view = margin ? expandRect(viewport, margin) : viewport;
  const { minCol, maxCol, minRow, maxRow } = cellRange(view, grid.cellSize);
  const seen = new Set<number>();
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      const bucket = grid.cells.get(cellKey(col, row));
      if (!bucket) continue;
      for (const i of bucket) {
        if (!seen.has(i) && rectsIntersect(grid.boxes[i], view)) seen.add(i);
      }
    }
  }
  // Re-emit in input order so paint/z-order is preserved.
  const out: SlideObject[] = [];
  for (let i = 0; i < objects.length; i++) {
    if (seen.has(i)) out.push(objects[i]);
  }
  return out;
}
