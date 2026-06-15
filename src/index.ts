/** SlideCraft public entry. */
export { Editor } from './editor/editor';
export type { EditorOptions } from './editor/editor';
export { SlidePanel } from './editor/panel';
export type { SlidePanelOptions } from './editor/panel';
export { Toolbar } from './editor/toolbar';
export type { ToolbarOptions } from './editor/toolbar';
export { PropertyPanel } from './editor/properties';
export { Store } from './editor/store';
export { Slideshow } from './editor/slideshow';
export type { SlideshowOptions } from './editor/slideshow';
export * from './core/model';
export * from './core/shapes';
export {
  createTable,
  createTableData,
  renderTable,
  parseTable,
  columnCount,
  addRow,
  deleteRow,
  addColumn,
  deleteColumn,
  setCellText,
  mergeCells,
  splitCell,
  type TableCell,
  type TableStyle,
  type TableData,
} from './core/tables';
export {
  createChart,
  createChartData,
  renderChart,
  parseChart,
  setValue,
  addCategory,
  removeCategory,
  addSeries,
  removeSeries,
  renameSeries,
  renameCategory,
  setChartKind,
  type ChartKind,
  type ChartSeries,
  type ChartStyle,
  type ChartData,
} from './core/charts';
export {
  createConnector,
  createConnectorData,
  renderConnector,
  routeConnector,
  parseConnector,
  anchorPoint,
  setRouting,
  setSide,
  setArrows,
  setStyle,
  type AnchorSide,
  type ConnectorRouting,
  type ConnectorEnd,
  type ConnectorStyle,
  type ConnectorData,
} from './core/connectors';
export {
  placeImports,
  extractTopLevel,
  importHTMLDocument,
  type ImportLayout,
} from './core/import';
export { exportHTML, type ExportOptions } from './core/export';
export {
  parseObjectStyle,
  parseAnimations,
  placeDeck,
  extractDeck,
  importDeck,
  importDeckDocument,
  type RawDeckObject,
} from './core/import-deck';
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
  MORPH_DURATION_MS,
  morphFrame,
  morphKeyframes,
  planMorph,
  type MorphPair,
  type MorphPlan,
  type MorphSnapshot,
} from './core/morph';
export {
  addMaster,
  getMaster,
  masterFromSlide,
  removeMaster,
  resolveSlideObjects,
  setSlideMaster,
  updateMaster,
} from './core/master';
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
export {
  presenterView,
  startTimer,
  createTimer,
  isRunning,
  elapsedMs,
  pauseTimer,
  resumeTimer,
  resetTimer,
  formatElapsed,
  type PresenterView,
  type TimerState,
} from './core/presenter';
export {
  gestureFromPointers,
  applyGesture,
  type Gesture,
} from './core/gesture';
export {
  expandRect,
  cullObjects,
  buildSpatialGrid,
  queryGrid,
  type SpatialGrid,
} from './core/culling';
export {
  objectAriaLabel,
  objectAriaAttrs,
  tabOrder,
  tabNavigate,
  spatialNavigate,
  type AriaAttrs,
  type NavDirection,
} from './core/a11y';
export * as transform from './core/transform';
export { History } from './core/history';
export type { Command } from './core/history';
