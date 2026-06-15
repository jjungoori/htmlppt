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
  /**
   * Embed a self-contained presentation runtime so the exported file is
   * navigable as a slideshow (arrows/space/PageDn advance, Esc exits, F
   * toggles browser fullscreen). Default `false` keeps the static stacked
   * layout (and the M12 round-trip byte output) unchanged.
   */
  present?: boolean;
}

/** Selector for content the click-to-advance handler must NOT hijack. */
const INTERACTIVE_SELECTOR =
  'a[href],button,input,select,textarea,label,summary,[contenteditable],[contenteditable="true"]';

/**
 * Vanilla, dependency-free presentation controller, inlined into the export when
 * `present` is set. Lives outside the SlideCraft model so the exported file runs
 * anywhere with zero runtime deps; reads only the DOM the exporter emits
 * (`.sc-slide` sections under `<body>`). Defined as a real function (embedded via
 * {@link Function.prototype.toString}) so it can be exercised in unit tests
 * instead of living as an opaque string.
 */
export function presentRuntime(sel: string): void {
  var slides = [].slice.call(document.querySelectorAll('body > .sc-slide')) as HTMLElement[];
  if (!slides.length) return;
  var i = 0;
  var counter = document.createElement('div');
  counter.className = 'sc-counter';
  document.body.appendChild(counter);
  function show(n: number) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    for (var k = 0; k < slides.length; k++) slides[k].classList.toggle('sc-current', k === i);
    counter.textContent = i + 1 + ' / ' + slides.length;
  }
  function next() {
    show(i + 1);
  }
  function prev() {
    show(i - 1);
  }
  document.body.classList.add('sc-present');
  show(0);
  document.addEventListener('keydown', function (e) {
    // Same arbitrary-HTML-preservation principle as the click guard: when focus
    // is inside an embedded editable field, let Space/arrows type & move the
    // caret instead of hijacking them into slide navigation.
    var a = document.activeElement as (HTMLElement & { isContentEditable?: boolean }) | null;
    if (a) {
      var tag = a.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a.isContentEditable)
        return;
    }
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
        next();
        e.preventDefault();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        prev();
        e.preventDefault();
        break;
      case 'Home':
        show(0);
        break;
      case 'End':
        show(slides.length - 1);
        break;
      case 'f':
      case 'F':
        if (document.fullscreenElement) document.exitFullscreen();
        else if (document.documentElement.requestFullscreen)
          document.documentElement.requestFullscreen();
        break;
      case 'Escape':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.body.classList.remove('sc-present');
        break;
    }
  });
  document.addEventListener('click', function (e) {
    if (e.button !== 0) return;
    // The whole point of SlideCraft is preserving arbitrary HTML — don't hijack
    // clicks on interactive content (links/buttons/form fields) into a slide
    // advance, and don't advance while the user is selecting text.
    var t = e.target as Element | null;
    if (t && t.closest && t.closest(sel)) return;
    var selection = document.getSelection && document.getSelection();
    if (selection && String(selection).length) return;
    next();
  });
}

/** Source of {@link presentRuntime}, inlined and self-invoked in the export. */
const PRESENT_RUNTIME = `(${presentRuntime.toString()})(${JSON.stringify(INTERACTIVE_SELECTOR)});`;

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
      // Speaker notes (M14): hidden `.sc-notes` aside carrying plain text so
      // importDeckDocument can losslessly recover them. Emitted only when set,
      // keeping note-free decks byte-for-byte unchanged.
      const notes = slide.notes ? `<aside class="sc-notes">${esc(slide.notes)}</aside>` : '';
      return `<section class="sc-slide">${objects}${notes}</section>`;
    })
    .join('\n');

  // Present mode: show only the `.sc-current` slide, centered and scaled to the
  // viewport. Purely additive CSS so the static (non-present) layout is byte-for
  // -byte unchanged when `present` is off.
  const presentCss = options.present
    ? `\nbody.sc-present{background:var(--sc-bg);height:100vh;overflow:hidden;display:flex;align-items:center;justify-content:center;}
body.sc-present .sc-slide{display:none;margin:0;}
body.sc-present .sc-slide.sc-current{display:block;}
.sc-counter{display:none;}
body.sc-present .sc-counter{display:block;position:fixed;right:12px;bottom:10px;z-index:2147483647;font:600 13px/1 system-ui,sans-serif;color:var(--sc-fg,#888);opacity:.6;pointer-events:none;}`
    : '';
  const presentScript = options.present ? `\n<script>${PRESENT_RUNTIME}</script>` : '';

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
.sc-notes{display:none;}
.sc-object{box-sizing:border-box;}${presentCss}
</style>
</head>
<body${meta}>
${slides}${presentScript}
</body>
</html>`;
}
