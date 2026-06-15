/**
 * Standalone HTML export (round-trip with {@link importDeck}).
 *
 * SlideCraft imports arbitrary HTML into a transform model; this module does the
 * reverse — serialize a {@link SlideDocument} back into a self-contained HTML
 * document that renders each slide as a fixed-size stage with every object
 * placed by the *same* single-transform convention the editor/slideshow use
 * (`position:absolute; transform-origin:50% 50%; transform=cssTransform(o)`).
 *
 * Pure and DOM-less: it only builds a string, so it stays unit-testable and the
 * user's object HTML is emitted byte-for-byte untouched (invariant #1).
 */
import type { SlideDocument, SlideObject } from './model';
import { cssTransform } from './transform';
import { DEFAULT_THEME, getTheme, themeVars, type Theme } from './theme';

export interface ExportOptions {
  /** Document <title>. Default 'SlideCraft Deck'. */
  title?: string;
  /** Override the resolved theme. Default: doc.themeId → built-in → default. */
  theme?: Theme;
}

/** Minimal HTML-attribute/text escaper for the few values we interpolate. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render one object box. User `html` is emitted verbatim (already trusted). */
function renderObject(o: SlideObject): string {
  const style = [
    'position:absolute',
    'top:0',
    'left:0',
    'transform-origin:50% 50%',
    `width:${o.w}px`,
    `height:${o.h}px`,
    `transform:${cssTransform(o)}`,
    `opacity:${o.opacity}`,
    `z-index:${o.zIndex}`,
  ].join(';');
  // Animation specs are structured (not expressible via CSS px/vars), so stamp
  // them as a JSON `data-sc-anim` attribute — importDeck parses them back so the
  // round-trip preserves M11 build timelines instead of silently dropping them.
  const anim = o.animations.length ? ` data-sc-anim="${esc(JSON.stringify(o.animations))}"` : '';
  return `<div class="sc-object"${anim} style="${style}">${o.html}</div>`;
}

/**
 * Serialize `doc` into a standalone HTML document string. Slides stack
 * vertically as `.sc-slide` stages sized to the document; theme palette/fonts
 * are exposed as `--sc-*` CSS variables on `:root`.
 */
export function exportHTML(doc: SlideDocument, options: ExportOptions = {}): string {
  const theme =
    options.theme ?? (doc.themeId ? getTheme(doc.themeId) : undefined) ?? DEFAULT_THEME;
  const title = esc(options.title ?? 'SlideCraft Deck');
  const vars = Object.entries(themeVars(theme))
    .map(([k, v]) => `${k}:${v};`)
    .join('');
  // Document metadata stamped on <body> so importDeckDocument can losslessly
  // recover canvas size + theme id (CSS px/vars alone are lossy / unparseable).
  const meta =
    ` data-sc-width="${doc.width}" data-sc-height="${doc.height}"` +
    (doc.themeId ? ` data-sc-theme="${esc(doc.themeId)}"` : '');

  const slides = doc.slides
    .map((slide) => {
      const objects = [...slide.objects]
        .sort((a, b) => a.zIndex - b.zIndex)
        .map(renderObject)
        .join('');
      return `<section class="sc-slide">${objects}</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root{${vars}}
body{margin:0;background:var(--sc-bg);font-family:var(--sc-font-body);}
.sc-slide{position:relative;width:${doc.width}px;height:${doc.height}px;margin:24px auto;background:var(--sc-surface);box-shadow:0 2px 16px rgba(0,0,0,.15);overflow:hidden;}
.sc-object{box-sizing:border-box;}
</style>
</head>
<body${meta}>
${slides}
</body>
</html>`;
}
