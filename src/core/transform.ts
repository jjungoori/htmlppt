/**
 * Single-matrix transform helpers. Every object's on-screen placement is
 * derived here so selection, drag, resize and rotate all speak one language.
 */
import type { SlideObject } from './model';

export interface Point {
  x: number;
  y: number;
}

/** CSS transform string for an object, applied to a box of size w×h at (x,y). */
export function cssTransform(o: SlideObject): string {
  // translate to position, rotate around the box center, then scale.
  return `translate(${o.x}px, ${o.y}px) rotate(${o.angle}deg) scale(${o.scaleX}, ${o.scaleY})`;
}

/** Center of the object in slide coordinates. */
export function center(o: SlideObject): Point {
  return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Rotate point p around pivot by `deg` degrees (clockwise in screen space). */
export function rotatePoint(p: Point, pivot: Point, deg: number): Point {
  const a = toRad(deg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

/** Convert a slide-space point into the object's local (unrotated) space. */
export function toLocal(p: Point, o: SlideObject): Point {
  const c = center(o);
  const r = rotatePoint(p, c, -o.angle);
  return { x: r.x - o.x, y: r.y - o.y };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Union of several axis-aligned rects; null if the list is empty. */
export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** True when two axis-aligned rects overlap (touching edges count). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y
  );
}

/** Axis-aligned bounding box of an object accounting for rotation. */
export function aabb(o: SlideObject): Rect {
  const c = center(o);
  const corners: Point[] = [
    { x: o.x, y: o.y },
    { x: o.x + o.w, y: o.y },
    { x: o.x + o.w, y: o.y + o.h },
    { x: o.x, y: o.y + o.h },
  ].map((pt) => rotatePoint(pt, c, o.angle));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}
