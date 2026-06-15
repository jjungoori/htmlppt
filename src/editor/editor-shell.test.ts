// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from './editor';
import { Toolbar } from './toolbar';
import { PropertyPanel } from './properties';
import { exportHTML } from '../core/export';
import { importDeckDocument } from '../core/import-deck';

function mount(): { editor: Editor; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return { editor: new Editor(host, { width: 1280, height: 720 }), host };
}

describe('M15 editor shell — toolbar', () => {
  let editor: Editor;
  let bar: HTMLElement;
  let toolbar: Toolbar;
  beforeEach(() => {
    ({ editor } = mount());
    bar = document.createElement('div');
    toolbar = editor.mountToolbar(bar);
  });

  const click = (title: string) => {
    const b = toolbar.root.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
    expect(b, title).toBeTruthy();
    b!.click();
  };

  it('insert buttons add objects through the command layer (undoable)', () => {
    expect(editor.store.slide.objects).toHaveLength(0);
    click('rect 삽입');
    click('텍스트 삽입');
    expect(editor.store.slide.objects).toHaveLength(2);
    editor.undo();
    expect(editor.store.slide.objects).toHaveLength(1);
    editor.undo();
    expect(editor.store.slide.objects).toHaveLength(0);
  });

  it('z-order / undo buttons dispatch store commands', () => {
    click('rect 삽입');
    click('ellipse 삽입');
    const [a, b] = editor.store.slide.objects;
    const z0 = editor.store.find(a.id)!.zIndex;
    editor.store.setSelection([a.id]);
    click('z-order front');
    expect(editor.store.find(a.id)!.zIndex).toBeGreaterThan(editor.store.find(b.id)!.zIndex);
    editor.undo(); // undo z-order restores the original stacking
    expect(editor.store.find(a.id)!.zIndex).toBe(z0);
  });
});

describe('M15 editor shell — property panel', () => {
  let editor: Editor;
  let props: PropertyPanel;
  beforeEach(() => {
    ({ editor } = mount());
    const host = document.createElement('div');
    props = editor.mountProperties(host);
  });

  const field = (label: string) =>
    [...props.root.querySelectorAll<HTMLLabelElement>('.sc-props-field')]
      .find((l) => l.querySelector('span')?.textContent === label)!
      .querySelector('input') as HTMLInputElement;

  it('reflects the sole selection and writes back via patch (undoable)', () => {
    const o = editor.addShape('rect', undefined, { x: 100, y: 100, w: 200, h: 120 });
    editor.store.setSelection([o.id]);
    expect(field('X').value).toBe('100');
    const x = field('X');
    x.value = '250';
    x.dispatchEvent(new Event('input'));
    expect(editor.store.find(o.id)!.x).toBe(250);
    editor.undo();
    expect(editor.store.find(o.id)!.x).toBe(100);
  });

  it('disables inputs when selection is not a single object', () => {
    const a = editor.addShape('rect');
    const b = editor.addShape('ellipse');
    editor.store.setSelection([a.id, b.id]);
    expect(field('X').disabled).toBe(true);
    editor.store.setSelection([a.id]);
    expect(field('X').disabled).toBe(false);
  });

  it('clamps opacity to [0,1]', () => {
    const o = editor.addShape('rect');
    editor.store.setSelection([o.id]);
    const op = field('투명도');
    op.value = '5';
    op.dispatchEvent(new Event('input'));
    expect(editor.store.find(o.id)!.opacity).toBe(1);
  });
});

describe('text editing — double-click / F2 (PowerPoint-style)', () => {
  const dblclick = (node: HTMLElement) =>
    node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 0, clientY: 0 }));

  it('double-clicking a text object makes its content editable and commits edits', () => {
    const { editor } = mount();
    const o = editor.importHTML('<h1>old</h1>', { x: 0, y: 0, w: 200, h: 80 })!;
    const node = editor.renderer.nodeFor(o.id)!;
    const content = node.querySelector('.sc-content') as HTMLElement;

    dblclick(node);
    expect(content.contentEditable).toBe('true');
    expect(node.classList.contains('sc-editing')).toBe(true);

    content.innerHTML = '<h1>new</h1>';
    content.dispatchEvent(new FocusEvent('blur'));
    expect(editor.store.find(o.id)!.html).toBe('<h1>new</h1>');
    expect(content.contentEditable).toBe('false');
  });

  it('does not enter edit on a locked object', () => {
    const { editor } = mount();
    const o = editor.importHTML('<p>x</p>')!;
    editor.store.patch(o.id, { locked: true });
    const node = editor.renderer.nodeFor(o.id)!;
    dblclick(node);
    expect((node.querySelector('.sc-content') as HTMLElement).contentEditable).not.toBe('true');
  });
});

describe('M15 export/import roundtrip stays lossless', () => {
  it('objects added via toolbar survive an export → import roundtrip', () => {
    const { editor } = mount();
    const bar = document.createElement('div');
    const toolbar = editor.mountToolbar(bar);
    toolbar.root.querySelector<HTMLButtonElement>('button[title="rect 삽입"]')!.click();
    editor.mountProperties(document.createElement('div'));

    const before = editor.toJSON();
    const html = exportHTML(before);
    const after = importDeckDocument(html);
    expect(after.slides[0].objects).toHaveLength(before.slides[0].objects.length);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });
});
