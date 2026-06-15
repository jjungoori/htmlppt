/** SlideCraft public entry. */
export { Editor } from './editor/editor';
export type { EditorOptions } from './editor/editor';
export { SlidePanel } from './editor/panel';
export type { SlidePanelOptions } from './editor/panel';
export { Store } from './editor/store';
export * from './core/model';
export * from './core/shapes';
export {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  getTheme,
  themeVars,
  type Theme,
  type ThemePalette,
  type ThemeFonts,
} from './core/theme';
export {
  alignDeltas,
  distributeDeltas,
  reorderZ,
  type AlignEdge,
  type ZOp,
} from './core/arrange';
export {
  ANIMATION_PRESETS,
  animationEndMs,
  createAnimation,
  isKnownPreset,
  presetsForKind,
  resolveAnimation,
  type AnimationKind,
  type ResolvedAnimation,
} from './core/animate';
export {
  buildSlideTimeline,
  buildStepCount,
  type BuildStep,
  type SlideTimeline,
  type TimelineEntry,
} from './core/slideshow';
export {
  advance,
  createPresentation,
  isAtEnd,
  isAtStart,
  retreat,
  seek,
  visibleAfter,
  type AdvanceResult,
  type PresentationState,
} from './core/presentation';
export * as transform from './core/transform';
export { History } from './core/history';
export type { Command } from './core/history';
