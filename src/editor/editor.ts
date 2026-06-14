/**
 * Editor — public façade tying Store + Renderer together and exposing the
 * library API. Selection-by-click and keyboard undo/redo are wired here;
 * drag/resize/rotate land in M2–M3.
 */
import { type SlideDocument } from '../core/model';
import { Store } from './store';
import { Renderer } from './renderer';
import { ensureBaseCss } from './styles';

export interface EditorOptions {
  width?: number;
  height?: number;
  doc?: SlideDocument;
}

export class Editor {
  readonly store: Store;
  readonly renderer: Renderer;

  constructor(host: HTMLElement, opts: EditorOptions = {}) {
    ensureBaseCss();
    this.store = new Store(opts.doc);
    if (opts.width) this.store.doc.width = opts.width;
    if (opts.height) this.store.doc.height = opts.height;
    this.renderer = new Renderer(host, this.store);
    this.wireSelection();
    this.wireKeyboard();
  }

  /** Import arbitrary, untouched HTML as a manipulable object. */
  importHTML(html: string, box?: { x?: number; y?: number; w?: number; h?: number }) {
    return this.store.addObject({ html, ...box });
  }

  toJSON(): SlideDocument {
    return this.store.toJSON();
  }
  fromJSON(doc: SlideDocument): void {
    this.store.fromJSON(doc);
  }
  undo(): void {
    this.store.history.undo();
  }
  redo(): void {
    this.store.history.redo();
  }

  private wireSelection(): void {
    this.renderer.stage.addEventListener('pointerdown', (e) => {
      const target = (e.target as HTMLElement).closest('.sc-object') as HTMLElement | null;
      if (!target) {
        this.store.setSelection([]);
        return;
      }
      const id = target.dataset.id!;
      if (e.shiftKey) this.store.toggleSelection(id);
      else this.store.setSelection([id]);
    });
  }

  private wireKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (meta && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        this.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.store.selection.size) {
        e.preventDefault();
        this.store.removeObjects([...this.store.selection]);
      }
    });
  }
}
