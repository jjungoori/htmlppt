/**
 * Alignment snapping + smart guides (M4). Pure geometry: given the moving
 * selection's axis-aligned rect, the static target rects, and the slide size,
 * `computeSnap` returns a small {dx,dy} nudge plus the guide lines to draw so a
 * drag clicks into alignment "PPT-style". DOM-free so it is unit-testable.
 */
import type { Rect } from './transform';

export const SNAP_THRESHOLD = 6;

/** A guide line to render. Vertical lines have `x`; horizontal lines have `y`. */
export interface Guide {
  axis: 'x' | 'y';
  /** slide-space position of the line. */
  pos: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** The three alignment positions of a rect along each axis. */
function xLines(r: Rect): number[] {
  return [r.x, r.x + r.w / 2, r.x + r.w];
}
function yLines(r: Rect): number[] {
  return [r.y, r.y + r.h / 2, r.y + r.h];
}

/**
 * Snap `moving` (already AABB) against `targets` and the slide frame.
 * Returns the offset to add to the moving rect plus the guides at the matched
 * positions. `threshold` is the max slide-space distance that still snaps.
 */
export function computeSnap(
  moving: Rect,
  targets: Rect[],
  slide: { width: number; height: number },
  threshold = SNAP_THRESHOLD,
): SnapResult {
  // Candidate alignment positions from every target plus the slide frame.
  const targetX: number[] = [0, slide.width / 2, slide.width];
  const targetY: number[] = [0, slide.height / 2, slide.height];
  for (const t of targets) {
    targetX.push(...xLines(t));
    targetY.push(...yLines(t));
  }

  const best = (movingLines: number[], candidates: number[]) => {
    let dist = Infinity;
    let delta = 0;
    let pos = 0;
    for (const m of movingLines) {
      for (const c of candidates) {
        const d = c - m;
        if (Math.abs(d) < Math.abs(dist)) {
          dist = d;
          delta = d;
          pos = c;
        }
      }
    }
    return { hit: Math.abs(dist) <= threshold, delta, pos };
  };

  const bx = best(xLines(moving), targetX);
  const by = best(yLines(moving), targetY);

  const guides: Guide[] = [];
  let dx = 0;
  let dy = 0;
  if (bx.hit) {
    dx = bx.delta;
    guides.push({ axis: 'x', pos: bx.pos });
  }
  if (by.hit) {
    dy = by.delta;
    guides.push({ axis: 'y', pos: by.pos });
  }
  return { dx, dy, guides };
}
