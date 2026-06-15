// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractDeck } from './import-deck';
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
