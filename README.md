# SlideCraft

> Add PowerPoint-style direct-manipulation UX to arbitrary HTML in the browser.

SlideCraft turns ordinary HTML into an editable, presentable slide deck: select,
drag, resize, rotate, snap, group, animate, and present — all driven through a
single command layer so every change is undoable and every deck round-trips
losslessly to HTML and back.

- **Zero-loss round trip** — `exportHTML(doc)` → `importDeckDocument(html)`
  reconstructs the same deck. HTML *is* the document format.
- **Command-layer everything** — all mutations flow through the store/history
  command layer, so undo/redo and grouping stay consistent.
- **Pure, testable core** — `src/core/*` is DOM-free and deterministic
  (geometry, snapping, layout, presenter view, a11y, culling). 274 unit tests.

## Install

```bash
npm install slidecraft
```

## Quickstart

```ts
import { Editor } from 'slidecraft';

const editor = new Editor(document.getElementById('stage')!, {
  width: 1280,
  height: 720,
});

// Optional editing chrome
editor.mountToolbar(document.getElementById('toolbar')!);
editor.mountSlidePanel(document.getElementById('slides')!);
editor.mountProperties(document.getElementById('props')!);
```

`new Editor(host, opts)` accepts `EditorOptions`:

| Option   | Type           | Description                          |
| -------- | -------------- | ------------------------------------ |
| `width`  | `number`       | Deck width in px (default doc width) |
| `height` | `number`       | Deck height in px                    |
| `doc`    | `SlideDocument`| Initial document to load             |

The editor exposes `store` (state + command layer), `renderer`, and `overlay`.

## Round-trip / persistence

```ts
import { exportHTML, importDeckDocument } from 'slidecraft';

const html = exportHTML(editor.store.doc); // serialize to standalone HTML
const doc = importDeckDocument(html);      // rebuild the deck losslessly
```

## Public API surface

- **Editor chrome** — `Editor`, `Toolbar`, `SlidePanel`, `PropertyPanel`,
  `Slideshow`, `Store`.
- **Model & objects** — `core/model`, `core/shapes`, `tables`, `charts`,
  `connectors`, `path`.
- **Pure core** — `transform`, `History`, presenter view, `a11y`
  (`objectAriaLabel`, `tabOrder`, `spatialNavigate`), performance culling
  (`cullObjects`, `buildSpatialGrid`, `queryGrid`).

See `src/index.ts` for the full export list.

## Develop

```bash
npm run dev        # vite dev server
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run build      # tsc + vite build → dist/
```

## License

MIT — see [LICENSE](./LICENSE).
