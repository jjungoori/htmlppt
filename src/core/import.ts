/**
 * HTML document import (success criterion #1).
 *
 * `importHTML` wraps one HTML string into a single object; real decks arrive as
 * a fragment/page whose top-level elements should each become an independently
 * manipulable object. This module splits arbitrary HTML into its top-level
 * elements **without modifying their markup** and auto-lays them out in a grid.
 *
 * The split is two-phase so the value-bearing logic stays unit-testable in a
 * DOM-less environment: {@link extractTopLevel} (browser-only, uses DOMParser)
 * pulls each element's untouched outerHTML, and {@link placeImports} (pure)
 * turns those fragments into positioned init payloads.
 */
import type { SlideDocument } from './model';
import type { ObjectInit } from './shapes';

export interface ImportLayout {
  /** Columns in the placement grid. Default: ceil(sqrt(count)). */
  cols?: number;
  /** Inner padding from the slide edges, px. Default 48. */
  padding?: number;
  /** Gap between cells, px. Default 24. */
  gap?: number;
  /**
   * Decompose a single wrapping element into its children so an AI-generated
   * slide — typically one `<div class="slide">…</div>` holding everything — is
   * imported as several independently editable objects rather than one block.
   * Descends through single-child wrappers until reaching an element with two or
   * more element children. Default false (top-level split only).
   */
  unwrap?: boolean;
}

/**
 * Lay `fragments` out in a grid across the slide, returning one init payload
 * per fragment with its untouched HTML. Pure — no DOM needed. Empty input (or a
 * degenerate slide size) yields an empty array rather than NaN boxes.
 */
export function placeImports(
  fragments: string[],
  doc: SlideDocument,
  layout: ImportLayout = {},
): ObjectInit[] {
  const n = fragments.length;
  if (n === 0) return [];
  const padding = layout.padding ?? 48;
  const gap = layout.gap ?? 24;
  const cols = Math.max(1, layout.cols ?? Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);

  const usableW = Math.max(0, doc.width - padding * 2 - gap * (cols - 1));
  const usableH = Math.max(0, doc.height - padding * 2 - gap * (rows - 1));
  const cellW = usableW / cols;
  const cellH = usableH / rows;

  return fragments.map((html, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      x: padding + col * (cellW + gap),
      y: padding + row * (cellH + gap),
      w: cellW,
      h: cellH,
      html,
    };
  });
}

/**
 * Extract the outerHTML of each top-level **element** in `html`, in document
 * order, leaving each element's markup byte-for-byte intact. Text nodes between
 * elements (whitespace, stray text) are dropped — only elements become objects.
 * Browser-only: requires a global `DOMParser`.
 */
export function extractTopLevel(html: string): string[] {
  if (typeof DOMParser === 'undefined') {
    throw new Error('extractTopLevel requires a DOM environment (DOMParser).');
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(parsed.body.children).map((el) => el.outerHTML);
}

/**
 * Find the "content root" of a parsed document: descend from `<body>` through
 * any chain of single-element wrappers until reaching an element that holds two
 * or more element children, then return that element's children's outerHTML. If
 * the body already has multiple top-level elements, those are returned as-is.
 * Browser-only: requires a global `DOMParser`.
 */
export function extractBlocks(html: string): string[] {
  if (typeof DOMParser === 'undefined') {
    throw new Error('extractBlocks requires a DOM environment (DOMParser).');
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  let node: Element = parsed.body;
  // Descend while there is exactly one element child that itself has children.
  while (node.children.length === 1 && node.children[0].children.length > 0) {
    node = node.children[0];
  }
  return Array.from(node.children).map((el) => el.outerHTML);
}

/** Split arbitrary HTML into positioned init payloads (extract + place). */
export function importHTMLDocument(
  html: string,
  doc: SlideDocument,
  layout?: ImportLayout,
): ObjectInit[] {
  const fragments = layout?.unwrap ? extractBlocks(html) : extractTopLevel(html);
  return placeImports(fragments, doc, layout);
}
