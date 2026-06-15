// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractBlocks, extractTopLevel, importHTMLDocument } from './import';
import { createDocument } from './model';

describe('extractBlocks (unwrap for AI slides)', () => {
  it('unwraps a single slide container into its child blocks', () => {
    const html = `<div class="slide"><h1>제목</h1><p>본문</p><img src="x.png"></div>`;
    expect(extractBlocks(html)).toEqual([
      '<h1>제목</h1>',
      '<p>본문</p>',
      '<img src="x.png">',
    ]);
  });

  it('descends through nested single-child wrappers', () => {
    const html = `<main><section><h1>A</h1><p>B</p></section></main>`;
    expect(extractBlocks(html)).toEqual(['<h1>A</h1>', '<p>B</p>']);
  });

  it('leaves already-flat top-level elements as-is', () => {
    const html = `<h1>A</h1><p>B</p>`;
    expect(extractBlocks(html)).toEqual(['<h1>A</h1>', '<p>B</p>']);
    expect(extractBlocks(html)).toEqual(extractTopLevel(html));
  });

  it('keeps a leaf element (no element children) intact', () => {
    const html = `<div class="card">just text</div>`;
    expect(extractBlocks(html)).toEqual(['<div class="card">just text</div>']);
  });

  it('importHTMLDocument with unwrap places each child block', () => {
    const doc = createDocument(1280, 720);
    const html = `<div class="slide"><h1>제목</h1><p>본문</p></div>`;
    const flat = importHTMLDocument(html, doc); // no unwrap → single object
    const unwrapped = importHTMLDocument(html, doc, { unwrap: true });
    expect(flat).toHaveLength(1);
    expect(unwrapped).toHaveLength(2);
    expect(unwrapped.map((o) => o.html)).toEqual(['<h1>제목</h1>', '<p>본문</p>']);
  });
});
