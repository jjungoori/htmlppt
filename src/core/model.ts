/**
 * SlideCraft core data model.
 *
 * Invariant #1: every object is described by a single transform model
 * {x, y, w, h, angle, scaleX, scaleY}. The DOM is a render result, never the
 * source of truth. Arbitrary user HTML lives untouched inside `html`.
 */

export type ObjectId = string;
export type SlideId = string;

/** Entrance/transition animation spec (driven by WAAPI in M11). */
export interface AnimationSpec {
  /** e.g. 'fade', 'fly-in', 'zoom' — resolved by the animation engine. */
  preset: string;
  durationMs: number;
  delayMs: number;
  /** 'enter' | 'exit' | 'emphasis' */
  kind: 'enter' | 'exit' | 'emphasis';
}

export interface SlideObject {
  id: ObjectId;
  /** logical top-left in slide coordinates (px at 100% zoom). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** degrees, clockwise. */
  angle: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  /** paint order within the slide; higher = front. */
  zIndex: number;
  locked: boolean;
  /** Group membership: objects sharing a non-null groupId select/move together. */
  groupId: ObjectId | null;
  /** Arbitrary, untouched user HTML — the "hybrid" content slot. */
  html: string;
  animations: AnimationSpec[];
}

export interface Slide {
  id: SlideId;
  objects: SlideObject[];
}

export interface SlideDocument {
  version: 1;
  width: number;
  height: number;
  slides: Slide[];
}

let _seq = 0;
export function uid(prefix = 'o'): string {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

export function createObject(partial: Partial<SlideObject> & { html: string }): SlideObject {
  return {
    id: partial.id ?? uid('o'),
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    w: partial.w ?? 200,
    h: partial.h ?? 120,
    angle: partial.angle ?? 0,
    scaleX: partial.scaleX ?? 1,
    scaleY: partial.scaleY ?? 1,
    opacity: partial.opacity ?? 1,
    zIndex: partial.zIndex ?? 0,
    locked: partial.locked ?? false,
    groupId: partial.groupId ?? null,
    html: partial.html,
    animations: partial.animations ?? [],
  };
}

export function createSlide(partial: Partial<Slide> = {}): Slide {
  return { id: partial.id ?? uid('s'), objects: partial.objects ?? [] };
}

export function createDocument(width = 1280, height = 720): SlideDocument {
  return { version: 1, width, height, slides: [createSlide()] };
}
