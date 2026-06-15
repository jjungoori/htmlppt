// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractDeck, importDeckDocument } from './import-deck';
import { exportHTML } from './export';
import { createDocument, createObject } from './model';

describe('extractDeck', () => {
  it('round-trips a plain exported deck (slide/object counts + html)', () => {
    const doc = createDocument(1280, 720);
    doc.slides[0].objects.push(createObject({ html: '<h1>A</h1>', x: 10, y: 20 }));
    doc.slides.push({ id: 's2', objects: [createObject({ html: '<p>B</p>', x: 5, y: 6 })] });

    const slides = extractDeck(exportHTML(doc));
    expect(slides).toHaveLength(2);
    expect(slides[0]).toHaveLength(1);
    expect(slides[0][0].html).toBe('<h1>A</h1>');
    expect(slides[1][0].html).toBe('<p>B</p>');
  });

  it('ignores nested .sc-slide/.sc-object inside an object\'s own html', () => {
    // An object whose arbitrary HTML embeds exported markup (deck-in-deck).
    const nested = '<section class="sc-slide"><div class="sc-object">inner</div></section>';
    const doc = createDocument(1280, 720);
    doc.slides[0].objects.push(createObject({ html: nested, x: 0, y: 0 }));

    const slides = extractDeck(exportHTML(doc));
    // Descendant queries would report 2 slides / 2 objects; scoped query sees 1/1.
    expect(slides).toHaveLength(1);
    expect(slides[0]).toHaveLength(1);
    expect(slides[0][0].html).toBe(nested);
  });
});

describe('importDeckDocument', () => {
  it('losslessly recovers width/height/themeId + objects from an exported deck', () => {
    const doc = createDocument(1024, 576);
    doc.themeId = 'dark';
    doc.slides[0].objects.push(createObject({ html: '<h1>A</h1>', x: 10, y: 20, w: 100, h: 40 }));

    const re = importDeckDocument(exportHTML(doc));
    expect(re.width).toBe(1024);
    expect(re.height).toBe(576);
    expect(re.themeId).toBe('dark');
    expect(re.slides[0].objects[0]).toMatchObject({ html: '<h1>A</h1>', x: 10, y: 20, w: 100, h: 40 });

    // Re-exporting the re-imported document is stable.
    expect(exportHTML(re)).toBe(exportHTML(doc));
  });

  it('falls back to defaults when metadata is absent / untrusted', () => {
    const re = importDeckDocument('<!doctype html><body><section class="sc-slide"></section></body>');
    expect(re.width).toBe(1280);
    expect(re.height).toBe(720);
    expect(re.themeId).toBeUndefined();
    expect(re.slides).toHaveLength(1);
  });

  it('preserves object animation specs across the round-trip (M11)', () => {
    const doc = createDocument(1280, 720);
    const anims = [
      { preset: 'fade', durationMs: 400, delayMs: 0, kind: 'enter' as const },
      { preset: 'fly-in', durationMs: 600, delayMs: 100, kind: 'emphasis' as const },
    ];
    doc.slides[0].objects.push(createObject({ html: '<h1>A</h1>', animations: anims }));

    const re = importDeckDocument(exportHTML(doc));
    expect(re.slides[0].objects[0].animations).toEqual(anims);
    // Objects without animations stay clean (no empty stamp emitted).
    expect(exportHTML(doc)).not.toContain('data-sc-anim=""');
    // Re-export is stable.
    expect(exportHTML(re)).toBe(exportHTML(doc));
  });
});
