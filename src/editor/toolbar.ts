/**
 * Editor toolbar (M15). A horizontal command bar that turns the demo into a real
 * editor shell: insert shapes/text/image, align, distribute, z-order, group, and
 * undo/redo. Every button routes through the Editor's existing command-layer API
 * (Store mutations are undoable), so the toolbar never touches model state
 * directly — it only dispatches commands and reflects nothing of its own.
 */
import type { ShapeKind } from '../core/shapes';
import type { AlignEdge, ZOp } from '../core/arrange';
import type { Editor } from './editor';

export interface ToolbarOptions {
  /** Default box for inserted objects (slide-space px). */
  insertBox?: { x?: number; y?: number; w?: number; h?: number };
}

export class Toolbar {
  readonly root: HTMLDivElement;

  constructor(
    private readonly host: HTMLElement,
    private readonly editor: Editor,
    private readonly opts: ToolbarOptions = {},
  ) {
    this.root = document.createElement('div');
    this.root.className = 'sc-toolbar';
    this.build();
    this.host.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  private box() {
    return { x: 120, y: 120, w: 240, h: 160, ...this.opts.insertBox };
  }

  private build(): void {
    const shapes: [ShapeKind, string][] = [
      ['rect', '▭'],
      ['ellipse', '◯'],
      ['triangle', '△'],
      ['line', '╱'],
    ];
    for (const [kind, glyph] of shapes) {
      this.add(glyph, `${kind} 삽입`, () => this.editor.addShape(kind, undefined, this.box()));
    }
    this.add('T', '텍스트 삽입', () =>
      this.editor.importHTML(
        '<p style="margin:0;font:20px system-ui">텍스트</p>',
        this.box(),
      ),
    );
    this.add('🖼', '이미지 삽입', () => {
      const src = this.promptImage();
      if (src) this.editor.addImage(src, this.box());
    });

    this.sep();
    const aligns: [AlignEdge, string][] = [
      ['left', '⊢'],
      ['hcenter', '↔'],
      ['right', '⊣'],
      ['top', '⊤'],
      ['vcenter', '↕'],
      ['bottom', '⊥'],
    ];
    for (const [edge, glyph] of aligns) {
      this.add(glyph, `정렬 ${edge}`, () => this.editor.store.align(edge));
    }
    this.add('⇿', '가로 분배', () => this.editor.store.distribute('h'));
    this.add('⇳', '세로 분배', () => this.editor.store.distribute('v'));

    this.sep();
    const zops: [ZOp, string][] = [
      ['front', '⤒'],
      ['forward', '↑'],
      ['backward', '↓'],
      ['back', '⤓'],
    ];
    for (const [op, glyph] of zops) {
      this.add(glyph, `z-order ${op}`, () => this.editor.store.reorder(op));
    }

    this.sep();
    this.add('⧉', '그룹', () => this.editor.store.group());
    this.add('⊟', '그룹 해제', () => this.editor.store.ungroup());

    this.sep();
    this.add('↶', '실행 취소', () => this.editor.undo());
    this.add('↷', '다시 실행', () => this.editor.redo());
  }

  /** Overridable image source prompt (replaced in tests). */
  protected promptImage(): string | null {
    return typeof prompt === 'function' ? prompt('이미지 URL 또는 data URI') : null;
  }

  private add(label: string, title: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', fn);
    this.root.appendChild(b);
    return b;
  }

  private sep(): void {
    const s = document.createElement('span');
    s.className = 'sc-toolbar-sep';
    this.root.appendChild(s);
  }
}
