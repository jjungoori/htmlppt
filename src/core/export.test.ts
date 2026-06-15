import { describe, it, expect } from 'vitest';
import { exportHTML } from './export';
import { createDocument, createObject, createSlide } from './model';
import { cssTransform } from './transform';
import { getTheme } from './theme';
import { parseObjectStyle } from './import-deck';

function docWith(...objects: ReturnType<typeof createObject>[]) {
  const doc = createDocument(800, 600);
  doc.slides = [createSlide({ objects })];
  return doc;
}

describe('exportHTML', () => {
  it('emits a standalone document sized to the deck', () => {
    const html = exportHTML(createDocument(1280, 720));
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('width:1280px');
    expect(html).toContain('height:720px');
    expect(html).toContain('<section class="sc-slide">');
  });

  it('emits user object HTML byte-for-byte untouched (invariant #1)', () => {
    const raw = '<h1 data-x="a&b">Hi <em>there</em></h1>';
    const html = exportHTML(docWith(createObject({ html: raw })));
    expect(html).toContain(raw);
  });

  it('places each object with the shared transform convention', () => {
    const o = createObject({ html: '<p>x</p>', x: 10, y: 20, w: 100, h: 40, angle: 15 });
    const html = exportHTML(docWith(o));
    expect(html).toContain(`transform:${cssTransform(o)}`);
    expect(html).toContain('width:100px');
    expect(html).toContain('height:40px');
  });

  it('renders objects in z-index order (back to front)', () => {
    const back = createObject({ html: '<i id="back"></i>', zIndex: 1 });
    const front = createObject({ html: '<i id="front"></i>', zIndex: 5 });
    // Pass front first; export should still sort back before front.
    const html = exportHTML(docWith(front, back));
    expect(html.indexOf('id="back"')).toBeLessThan(html.indexOf('id="front"'));
  });

  it('applies the document theme as CSS variables', () => {
    const doc = createDocument(800, 600);
    doc.themeId = 'dark';
    const html = exportHTML(doc);
    const dark = getTheme('dark')!;
    expect(html).toContain(`--sc-bg:${dark.palette.background}`);
  });

  it('escapes the title but allows an override', () => {
    const html = exportHTML(createDocument(), { title: 'A & B <x>' });
    expect(html).toContain('<title>A &amp; B &lt;x&gt;</title>');
  });

  it('round-trips object count across all slides', () => {
    const doc = createDocument(800, 600);
    doc.slides = [
      createSlide({ objects: [createObject({ html: '<a></a>' })] }),
      createSlide({ objects: [createObject({ html: '<b></b>' }), createObject({ html: '<c></c>' })] }),
    ];
    const html = exportHTML(doc);
    expect((html.match(/class="sc-object"/g) ?? []).length).toBe(3);
    expect((html.match(/class="sc-slide"/g) ?? []).length).toBe(2);
  });

  // Guards against silent format drift between export's renderObject and
  // import-deck's parseObjectStyle — drives the REAL export output through the
  // inverse parser instead of a hand-rebuilt style string (DOM-free).
  it('geometry survives a real export -> parseObjectStyle round-trip', () => {
    const o = createObject({
      html: '<p>x</p>', x: -12.5, y: 34, w: 100, h: 40,
      angle: 15, scaleX: 1.5, scaleY: 2, opacity: 0.5, zIndex: 7,
    });
    const html = exportHTML(docWith(o));
    const m = /<div class="sc-object" style="([^"]*)"/.exec(html);
    expect(m).not.toBeNull();
    expect(parseObjectStyle(m![1])).toEqual({
      x: -12.5, y: 34, w: 100, h: 40,
      angle: 15, scaleX: 1.5, scaleY: 2, opacity: 0.5, zIndex: 7,
    });
  });

  it('omits the presentation runtime by default (M12 static layout)', () => {
    const html = exportHTML(docWith(createObject({ html: '<p>x</p>' })));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('sc-present');
  });

  it('embeds a self-contained slideshow runtime when present:true', () => {
    const html = exportHTML(docWith(createObject({ html: '<p>x</p>' })), { present: true });
    expect(html).toContain('<script>');
    expect(html).toContain('sc-present');
    expect(html).toContain('sc-current');
    // No external dependency is referenced — the runtime is fully inlined.
    expect(html).not.toMatch(/<script[^>]+src=/);
    // Click-to-advance must guard interactive content so embedded links/buttons
    // (arbitrary user HTML) stay functional instead of being hijacked.
    expect(html).toContain('a[href]');
  });

  it('present runtime does not disturb object HTML or round-trip parsing', () => {
    const o = createObject({ html: '<h1>Title</h1>', x: 10, y: 20, w: 100, h: 40 });
    const html = exportHTML(docWith(o), { present: true });
    expect(html).toContain('<h1>Title</h1>');
    const m = /<div class="sc-object"[^>]*style="([^"]*)"/.exec(html);
    expect(parseObjectStyle(m![1])).toMatchObject({ x: 10, y: 20, w: 100, h: 40 });
  });
});
