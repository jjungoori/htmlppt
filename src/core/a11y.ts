/**
 * Accessibility: ARIA semantics + keyboard navigation (M23, a11y slice) — pure core.
 *
 * A slide canvas is a spatial scene, not a document flow, so screen-reader users
 * and keyboard-only users need two things the DOM does not give for free: a
 * *named, ordered* list of objects to traverse, and a way to move the focus
 * between objects with the arrow keys the way a sighted user moves the eye. This
 * module is the DOM-free brain for both. It never touches the DOM and never
 * reads the wall clock — it maps a {@link Slide} (or a single {@link SlideObject})
 * to ARIA attributes and answers "which object is next in this direction?" so a
 * browser layer can apply the attributes and route the resulting selection
 * change through the command layer (a single undoable step).
 *
 * Tab order is *reading order* (top-to-bottom, then left-to-right by object
 * top-left), deliberately independent of paint `zIndex`: a screen reader should
 * walk the slide the way a person reads it, not the way it stacks. Arrow
 * navigation is *spatial* — from the current object's center it picks the
 * nearest object whose center lies in the pressed direction's 90° cone, the same
 * convention OS spatial-navigation uses.
 */

import type { Slide, SlideObject, ObjectId } from './model';
import { type Point } from './transform';

/** Arrow-key navigation directions. */
export type NavDirection = 'up' | 'down' | 'left' | 'right';

/** ARIA attributes for a single rendered slide object. */
export interface AriaAttrs {
  role: 'group';
  'aria-roledescription': string;
  'aria-label': string;
  /** -1 (programmatically focusable) or 0 (in Tab order) — set by the renderer. */
  tabindex: number;
  /** Mirrors selection state for assistive tech. */
  'aria-selected': boolean;
}

const MAX_LABEL = 80;

function objectCenter(o: SlideObject): Point {
  return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
}

/**
 * Derive a human-readable label from an object's HTML content. Tags are
 * stripped, entities for the common cases decoded, whitespace collapsed and the
 * result trimmed to {@link MAX_LABEL}. Empty content falls back to a generic
 * label so the object is never announced as nameless.
 */
export function objectAriaLabel(o: SlideObject): string {
  const text = o.html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return o.placeholder ? `${o.placeholder} placeholder` : 'Empty object';
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
}

/** Build the ARIA attribute set for an object given whether it is selected. */
export function objectAriaAttrs(o: SlideObject, selected: boolean): AriaAttrs {
  return {
    role: 'group',
    'aria-roledescription': o.locked ? 'locked slide object' : 'slide object',
    'aria-label': objectAriaLabel(o),
    tabindex: selected ? 0 : -1,
    'aria-selected': selected,
  };
}

/**
 * Tab/reading order of a slide's objects: top-to-bottom by top-left y, ties
 * broken left-to-right by x, then by id for full determinism. Independent of
 * paint `zIndex`.
 */
export function tabOrder(slide: Slide): ObjectId[] {
  return [...slide.objects]
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((o) => o.id);
}

/** Next object id when Tab/Shift+Tab cycles through {@link tabOrder}. */
export function tabNavigate(slide: Slide, currentId: ObjectId | null, backward = false): ObjectId | null {
  const order = tabOrder(slide);
  if (order.length === 0) return null;
  const i = currentId == null ? -1 : order.indexOf(currentId);
  if (i === -1) return backward ? order[order.length - 1] : order[0];
  const next = backward ? i - 1 : i + 1;
  // Wrap around so keyboard focus never gets stuck at an end.
  return order[(next + order.length) % order.length];
}

const DIR_VECTOR: Record<NavDirection, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Spatial arrow navigation: from `currentId`'s center, return the nearest object
 * whose center lies inside the pressed direction's 90° cone. Distance is the
 * straight-line gap, lightly biased toward the pressed axis so a near-aligned
 * neighbour wins over a closer but off-axis one. Returns null if nothing lies in
 * that direction (no wrap — spatial nav stops at the edge).
 */
export function spatialNavigate(slide: Slide, currentId: ObjectId, dir: NavDirection): ObjectId | null {
  const current = slide.objects.find((o) => o.id === currentId);
  if (!current) return null;
  const from = objectCenter(current);
  const v = DIR_VECTOR[dir];

  let best: ObjectId | null = null;
  let bestCost = Infinity;
  for (const o of slide.objects) {
    if (o.id === currentId) continue;
    const to = objectCenter(o);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const along = dx * v.x + dy * v.y; // projection onto the pressed direction
    if (along <= 0) continue; // behind or perpendicular — not in this direction
    const ortho = Math.abs(dx * v.y - dy * v.x); // perpendicular offset
    if (ortho > along) continue; // outside the 90° cone
    const cost = along + ortho * 2; // bias toward axis-aligned neighbours
    if (cost < bestCost || (cost === bestCost && best != null && o.id < best)) {
      bestCost = cost;
      best = o.id;
    }
  }
  return best;
}
