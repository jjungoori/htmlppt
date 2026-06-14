/**
 * Pure geometry for direct manipulation (M3). Drag/resize/rotate all reduce to
 * functions from (original object, pointer in slide space) → new transform
 * fields, so they can be unit-tested without the DOM. Resize keeps the handle's
 * opposite anchor fixed even when the object is rotated.
 */
import type { SlideObject } from './model';
import { center, type Point } from './transform';

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const MIN_SIZE = 8;

/** Which edges a handle drags: -1 = left/top, +1 = right/bottom, 0 = fixed. */
function handleAxes(h: Handle): { mx: -1 | 0 | 1; my: -1 | 0 | 1 } {
  const mx = h.includes('w') ? -1 : h.includes('e') ? 1 : 0;
  const my = h.includes('n') ? -1 : h.includes('s') ? 1 : 0;
  return { mx, my };
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * New {x,y,w,h} after dragging `handle` to slide-space `pointer`. The anchor
 * (opposite edge/corner) is held fixed in slide space, accounting for rotation.
 */
export function computeResize(
  o: SlideObject,
  handle: Handle,
  pointer: Point,
): { x: number; y: number; w: number; h: number } {
  const { mx, my } = handleAxes(handle);
  const a = rad(o.angle);
  const ux: Point = { x: Math.cos(a), y: Math.sin(a) }; // local +x in slide space
  const uy: Point = { x: -Math.sin(a), y: Math.cos(a) }; // local +y in slide space

  // Anchor = the fixed corner in local coords (0 or w / 0 or h), then to slide.
  const ax = mx === -1 ? o.w : 0;
  const ay = my === -1 ? o.h : 0;
  const A: Point = {
    x: o.x + ux.x * ax + uy.x * ay,
    y: o.y + ux.y * ax + uy.y * ay,
  };

  const rel: Point = { x: pointer.x - A.x, y: pointer.y - A.y };
  const projX = dot(rel, ux);
  const projY = dot(rel, uy);

  let w = mx === 0 ? o.w : Math.max(MIN_SIZE, mx === 1 ? projX : -projX);
  let h = my === 0 ? o.h : Math.max(MIN_SIZE, my === 1 ? projY : -projY);

  // New top-left: shift back from the anchor when the anchor sits on the far edge.
  const offX = mx === -1 ? -w : 0;
  const offY = my === -1 ? -h : 0;
  const x = A.x + ux.x * offX + uy.x * offY;
  const y = A.y + ux.y * offX + uy.y * offY;
  return { x, y, w, h };
}

/**
 * New angle (degrees) while rotating. The pointer angle is measured from the
 * object's center; `start` is the pointer position when the drag began.
 * `snapDeg` (e.g. 15) snaps the result when truthy.
 */
export function computeRotate(
  o: SlideObject,
  start: Point,
  pointer: Point,
  snapDeg = 0,
): number {
  const c = center(o);
  const a0 = Math.atan2(start.y - c.y, start.x - c.x);
  const a1 = Math.atan2(pointer.y - c.y, pointer.x - c.x);
  let deg = o.angle + ((a1 - a0) * 180) / Math.PI;
  if (snapDeg > 0) deg = Math.round(deg / snapDeg) * snapDeg;
  // normalize to (-180, 180]
  deg = ((((deg + 180) % 360) + 360) % 360) - 180;
  return deg;
}
