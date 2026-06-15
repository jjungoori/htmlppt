/**
 * Two-finger touch gesture math (M23, touch slice) — pure core.
 *
 * Touch manipulation on a slide object is a single combined transform: two
 * fingers can pan (both move together), pinch-resize (spread apart / together)
 * and twist-rotate (turn around each other) all at once. This module is the
 * DOM-free brain that turns a *pair of pointer samples* (where the two fingers
 * started, where they are now) into that transform, and applies it to an object
 * as a property patch. A browser touch handler feeds raw `Touch` coordinates in
 * and routes the resulting patch through the command layer (so the gesture is a
 * single undoable step) — this file never touches the DOM and never reads the
 * wall clock, so it is deterministic and unit-testable.
 *
 * Coordinates are slide-space {@link Point}s. A gesture is read off the two
 * fingers' centroid (pan), the change in their distance (scale) and the change
 * in the angle of the line between them (rotate), pivoting around the centroid
 * where the gesture began — the same convention PowerPoint/Keynote use.
 */

import type { SlideObject } from './model';
import { type Point, center, rotatePoint } from './transform';

/** A two-finger gesture decomposed into pan / pinch / twist about a pivot. */
export interface Gesture {
  /** Centroid translation from gesture start to now, in slide space. */
  pan: Point;
  /** Pinch factor: current finger distance ÷ starting distance (1 = no change). */
  scale: number;
  /** Twist in degrees (clockwise positive in screen space). */
  rotate: number;
  /** Slide-space point the scale/rotate pivot around (the starting centroid). */
  pivot: Point;
}

const EPSILON = 1e-9;

function centroid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Angle of the vector a→b in degrees (clockwise positive, screen y-down). */
function angleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Smallest signed difference (deg) bringing `from` to `to`, in [-180, 180]. */
function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Decompose a two-finger gesture from its start sample (`s0`,`s1`) to its
 * current sample (`c0`,`c1`). When the fingers start coincident, the pinch
 * factor degrades gracefully to 1 and the twist to 0 (no defined line yet).
 */
export function gestureFromPointers(
  s0: Point,
  s1: Point,
  c0: Point,
  c1: Point,
): Gesture {
  const startMid = centroid(s0, s1);
  const nowMid = centroid(c0, c1);
  const startDist = distance(s0, s1);
  const degenerate = startDist < EPSILON;
  return {
    pan: { x: nowMid.x - startMid.x, y: nowMid.y - startMid.y },
    scale: degenerate ? 1 : distance(c0, c1) / startDist,
    rotate: degenerate ? 0 : angleDelta(angleDeg(s0, s1), angleDeg(c0, c1)),
    pivot: startMid,
  };
}

/**
 * Apply a gesture to an object, returning a patch of changed transform fields.
 * The object's center is scaled and rotated around the gesture pivot, then
 * panned; the object's own rotation and scale absorb the twist and pinch. Width
 * and height are untouched (size lives in `scaleX`/`scaleY`, matching the rest
 * of the transform model), so the result composes cleanly with undo/redo.
 */
export function applyGesture(
  o: SlideObject,
  g: Gesture,
): Pick<SlideObject, 'x' | 'y' | 'angle' | 'scaleX' | 'scaleY'> {
  const c = center(o);
  // Scale the center's offset from the pivot, then rotate it about the pivot.
  const scaled: Point = {
    x: g.pivot.x + (c.x - g.pivot.x) * g.scale,
    y: g.pivot.y + (c.y - g.pivot.y) * g.scale,
  };
  const rotated = rotatePoint(scaled, g.pivot, g.rotate);
  const newCenter: Point = { x: rotated.x + g.pan.x, y: rotated.y + g.pan.y };
  return {
    x: newCenter.x - o.w / 2,
    y: newCenter.y - o.h / 2,
    angle: o.angle + g.rotate,
    scaleX: o.scaleX * g.scale,
    scaleY: o.scaleY * g.scale,
  };
}
