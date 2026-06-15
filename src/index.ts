/** SlideCraft public entry. */
export { Editor } from './editor/editor';
export type { EditorOptions } from './editor/editor';
export { SlidePanel } from './editor/panel';
export type { SlidePanelOptions } from './editor/panel';
export { Store } from './editor/store';
export { Slideshow } from './editor/slideshow';
export type { SlideshowOptions } from './editor/slideshow';
export * from './core/model';
export * from './core/shapes';
export {
  placeImports,
  extractTopLevel,
  importHTMLDocument,
  type ImportLayout,
} from './core/import';
export { exportHTML, type ExportOptions } from './core/export';
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
export {
  createDeck,
  currentSlide,
  deckAdvance,
  deckRetreat,
  goToSlide,
  isDeckAtEnd,
  isDeckAtStart,
  type DeckAdvance,
  type DeckState,
} from './core/deck';
export * as transform from './core/transform';
export { History } from './core/history';
export type { Command } from './core/history';
