/**
 * Theme model (M10). A theme is a small, serializable palette + font pair that
 * drives the look of a document. It is applied as CSS custom properties on the
 * stage so untouched user HTML can opt in via `var(--sc-*)`, while the stage
 * itself gets a background, default text colour and font from the theme.
 *
 * Pure & DOM-free: this module only describes themes and turns them into a flat
 * variable map. The renderer is the only place that touches the DOM.
 */

export interface ThemePalette {
  /** slide background. */
  background: string;
  /** raised surfaces (cards, boxes). */
  surface: string;
  /** primary brand colour (titles, accents). */
  primary: string;
  /** secondary brand colour. */
  secondary: string;
  /** highlight / call-to-action colour. */
  accent: string;
  /** default body text colour. */
  text: string;
  /** muted/secondary text colour. */
  muted: string;
}

export interface ThemeFonts {
  /** font-family stack for headings. */
  heading: string;
  /** font-family stack for body text. */
  body: string;
}

export interface Theme {
  id: string;
  name: string;
  palette: ThemePalette;
  fonts: ThemeFonts;
}

const SANS = "'Segoe UI', system-ui, -apple-system, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'SF Mono', 'Cascadia Code', Menlo, monospace";

/** Built-in themes, keyed by id. The first is the default. */
export const BUILTIN_THEMES: Theme[] = [
  {
    id: 'light',
    name: 'Light',
    palette: {
      background: '#ffffff',
      surface: '#f4f6f8',
      primary: '#2684ff',
      secondary: '#5e6ad2',
      accent: '#ff3b6b',
      text: '#1a1a1a',
      muted: '#6b7280',
    },
    fonts: { heading: SANS, body: SANS },
  },
  {
    id: 'dark',
    name: 'Dark',
    palette: {
      background: '#0f1419',
      surface: '#1a2029',
      primary: '#4c9aff',
      secondary: '#8b95f6',
      accent: '#ff5c8a',
      text: '#e6e9ee',
      muted: '#9aa4b2',
    },
    fonts: { heading: SANS, body: SANS },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    palette: {
      background: '#fbf7f0',
      surface: '#f1e9dc',
      primary: '#1f3a5f',
      secondary: '#8a6d3b',
      accent: '#c2410c',
      text: '#26221c',
      muted: '#6f655a',
    },
    fonts: { heading: SERIF, body: SERIF },
  },
  {
    id: 'mono',
    name: 'Mono',
    palette: {
      background: '#fafafa',
      surface: '#eeeeee',
      primary: '#111111',
      secondary: '#444444',
      accent: '#16a34a',
      text: '#111111',
      muted: '#777777',
    },
    fonts: { heading: MONO, body: MONO },
  },
];

/** The default theme used when a document declares none. */
export const DEFAULT_THEME: Theme = BUILTIN_THEMES[0];

/** Look up a built-in theme by id (undefined if unknown). */
export function getTheme(id: string): Theme | undefined {
  return BUILTIN_THEMES.find((t) => t.id === id);
}

/**
 * Flatten a theme into the CSS custom-property map the renderer applies to the
 * stage. Keys are valid CSS variable names (`--sc-*`).
 */
export function themeVars(theme: Theme): Record<string, string> {
  const p = theme.palette;
  return {
    '--sc-bg': p.background,
    '--sc-surface': p.surface,
    '--sc-primary': p.primary,
    '--sc-secondary': p.secondary,
    '--sc-accent': p.accent,
    '--sc-text': p.text,
    '--sc-muted': p.muted,
    '--sc-font-heading': theme.fonts.heading,
    '--sc-font-body': theme.fonts.body,
  };
}
