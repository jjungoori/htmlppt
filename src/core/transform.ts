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

/** Axis-aligned bounding box of an object accounting for rotation. */
export function aabb(o: SlideObject): { x: number; y: number; w: number; h: number } {
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
