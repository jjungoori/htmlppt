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
  /**
   * Placeholder key (M21). When set on a master object it defines an inheritable
   * slot (e.g. 'title', 'body'); a slide object with the same key *fills* that
   * slot — it inherits the master placeholder's geometry for any unset fields
   * and suppresses the master's own placeholder render. Absent = ordinary object.
   */
  placeholder?: string;
  /** Arbitrary, untouched user HTML — the "hybrid" content slot. */
  html: string;
  animations: AnimationSpec[];
}

/**
 * A reusable slide master (M21): shared background/decoration objects plus
 * named placeholders that inheriting slides fill. Resolved against a slide by
 * {@link resolveSlideObjects} in `core/master.ts`.
 */
export interface SlideMaster {
  id: SlideId;
  name: string;
  /** Shared objects painted behind every slide that inherits this master. */
  objects: SlideObject[];
}

export interface Slide {
  id: SlideId;
  objects: SlideObject[];
  /** Presenter-only speaker notes (M14). Plain text; absent/empty = none. */
  notes?: string;
  /** Inherited master (M21). References a {@link SlideMaster} id; absent = none. */
  masterId?: SlideId;
}

export interface SlideDocument {
  version: 1;
  width: number;
  height: number;
  slides: Slide[];
  /** Active theme id (M10). Resolved against built-in themes; absent = default. */
  themeId?: string;
  /** Reusable slide masters (M21). Slides reference one by `masterId`. */
  masters?: SlideMaster[];
}

let _seq = 0;
export function uid(prefix = 'o'): string {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

export function createObject(partial: Partial<SlideObject> & { html: string }): SlideObject {
  return {
    id: partial.id ?? uid('o'),
    x: num(partial.x, 0),
    y: num(partial.y, 0),
    w: num(partial.w, 200),
    h: num(partial.h, 120),
    angle: num(partial.angle, 0),
    scaleX: num(partial.scaleX, 1),
    scaleY: num(partial.scaleY, 1),
    opacity: num(partial.opacity, 1),
    zIndex: num(partial.zIndex, 0),
    locked: partial.locked ?? false,
    groupId: partial.groupId ?? null,
    ...(typeof partial.placeholder === 'string' && partial.placeholder
      ? { placeholder: partial.placeholder }
      : {}),
    html: partial.html,
    animations: partial.animations ?? [],
  };
}

export function createSlide(partial: Partial<Slide> = {}): Slide {
  const notes = typeof partial.notes === 'string' ? partial.notes : '';
  return {
    id: partial.id ?? uid('s'),
    objects: partial.objects ?? [],
    ...(notes ? { notes } : {}),
    ...(typeof partial.masterId === 'string' && partial.masterId
      ? { masterId: partial.masterId }
      : {}),
  };
}

export function createDocument(width = 1280, height = 720): SlideDocument {
  return { version: 1, width, height, slides: [createSlide()] };
}

const ANIMATION_KINDS = new Set<AnimationSpec['kind']>(['enter', 'exit', 'emphasis']);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function normalizeAnimation(raw: unknown): AnimationSpec | null {
  if (!isObj(raw) || typeof raw.preset !== 'string') return null;
  const kind = ANIMATION_KINDS.has(raw.kind as AnimationSpec['kind'])
    ? (raw.kind as AnimationSpec['kind'])
    : 'enter';
  return {
    preset: raw.preset,
    durationMs: num(raw.durationMs, 400),
    delayMs: num(raw.delayMs, 0),
    kind,
  };
}

/**
 * Validate and normalize an untrusted value (e.g. parsed file JSON) into a
 * well-formed {@link SlideDocument}. Every object is rebuilt through
 * {@link createObject} so missing fields (like `animations`) get defaults
 * instead of silently breaking downstream consumers. Throws on a shape that
 * cannot be recovered (not a document / unsupported version / no slides).
 */
export function parseDocument(input: unknown): SlideDocument {
  if (!isObj(input)) throw new Error('parseDocument: input is not an object');
  if (input.version !== 1) {
    throw new Error(`parseDocument: unsupported document version ${String(input.version)}`);
  }
  if (!Array.isArray(input.slides) || input.slides.length === 0) {
    throw new Error('parseDocument: document has no slides');
  }
  const slides: Slide[] = input.slides.map((rawSlide) => {
    const objects = isObj(rawSlide) && Array.isArray(rawSlide.objects) ? rawSlide.objects : [];
    return createSlide({
      id: isObj(rawSlide) && typeof rawSlide.id === 'string' ? rawSlide.id : undefined,
      notes: isObj(rawSlide) && typeof rawSlide.notes === 'string' ? rawSlide.notes : undefined,
      masterId:
        isObj(rawSlide) && typeof rawSlide.masterId === 'string' ? rawSlide.masterId : undefined,
      objects: objects.flatMap(parseObject),
    });
  });
  const masters = Array.isArray(input.masters)
    ? input.masters.flatMap((m) => (isObj(m) ? [parseMaster(m)] : []))
    : [];
  return {
    version: 1,
    width: num(input.width, 1280),
    height: num(input.height, 720),
    slides,
    ...(typeof input.themeId === 'string' ? { themeId: input.themeId } : {}),
    ...(masters.length ? { masters } : {}),
  };
}

/** Rebuild one untrusted object through {@link createObject}; drops invalid. */
function parseObject(rawObj: unknown): SlideObject[] {
  if (!isObj(rawObj) || typeof rawObj.html !== 'string') return [];
  const animations = Array.isArray(rawObj.animations)
    ? rawObj.animations.map(normalizeAnimation).filter((a): a is AnimationSpec => a !== null)
    : [];
  return [createObject({ ...(rawObj as Partial<SlideObject>), html: rawObj.html, animations })];
}

/** Rebuild one untrusted master (M21), rebuilding each shared object. */
function parseMaster(raw: Record<string, unknown>): SlideMaster {
  const objects = Array.isArray(raw.objects) ? raw.objects.flatMap(parseObject) : [];
  return {
    id: typeof raw.id === 'string' ? raw.id : uid('m'),
    name: typeof raw.name === 'string' ? raw.name : 'Master',
    objects,
  };
}

/** Create a {@link SlideMaster} with defaults (M21). */
export function createMaster(partial: Partial<SlideMaster> = {}): SlideMaster {
  return {
    id: partial.id ?? uid('m'),
    name: partial.name ?? 'Master',
    objects: partial.objects ?? [],
  };
}
