/**
 * Renders the current slide into a stage element. The model is the source of
 * truth; this just reflects it. Object content HTML is injected untouched.
 */
import type { SlideObject } from '../core/model';
import { cssTransform } from '../core/transform';
import type { Store } from './store';

export class Renderer {
  readonly stage: HTMLDivElement;
  private nodes = new Map<string, HTMLDivElement>();

  constructor(
    private readonly host: HTMLElement,
    private readonly store: Store,
  ) {
    this.host.classList.add('sc-host');
    this.stage = document.createElement('div');
    this.stage.className = 'sc-stage';
    this.host.appendChild(this.stage);
    this.store.on('change', () => this.render());
    this.store.on('selection', () => this.renderSelection());
    this.render();
  }

  private applyBox(node: HTMLDivElement, o: SlideObject): void {
    node.style.width = `${o.w}px`;
    node.style.height = `${o.h}px`;
    node.style.transform = cssTransform(o);
    node.style.opacity = String(o.opacity);
    node.style.zIndex = String(o.zIndex);
  }

  render(): void {
    const { doc, slide } = this.store;
    this.stage.style.width = `${doc.width}px`;
    this.stage.style.height = `${doc.height}px`;

    const live = new Set(slide.objects.map((o) => o.id));
    for (const [id, node] of this.nodes) {
      if (!live.has(id)) {
        node.remove();
        this.nodes.delete(id);
      }
    }

    for (const o of slide.objects) {
      let node = this.nodes.get(o.id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'sc-object';
        node.dataset.id = o.id;
        this.stage.appendChild(node);
        this.nodes.set(o.id, node);
      }
      // Re-inject content only when it changed (cheap dirty check via attr).
      if (node.dataset.html !== o.html) {
        node.innerHTML = `<div class="sc-content">${o.html}</div>`;
        node.dataset.html = o.html;
      }
      this.applyBox(node, o);
    }
    this.renderSelection();
  }

  private renderSelection(): void {
    for (const [id, node] of this.nodes) {
      node.classList.toggle('sc-selected', this.store.selection.has(id));
    }
  }

  nodeFor(id: string): HTMLDivElement | undefined {
    return this.nodes.get(id);
  }
}
