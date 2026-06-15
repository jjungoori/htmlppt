import { describe, it, expect } from 'vitest';
import { Store } from '../editor/store';

describe('Clipboard (M9)', () => {
  it('copy + paste duplicates the selection with fresh ids and an offset', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A', x: 10, y: 20 });
    s.setSelection([a.id]);
    s.copy();
    const [pasted] = s.paste();
    expect(s.slide.objects.length).toBe(2);
    expect(pasted.id).not.toBe(a.id);
    expect(pasted.x).toBe(a.x + 16);
    expect(pasted.y).toBe(a.y + 16);
    expect(pasted.html).toBe('A');
    expect([...s.selection]).toEqual([pasted.id]);
  });

  it('paste is undoable and redoable', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A' });
    s.setSelection([a.id]);
    s.copy();
    s.paste();
    expect(s.slide.objects.length).toBe(2);
    s.history.undo();
    expect(s.slide.objects.length).toBe(1);
    s.history.redo();
    expect(s.slide.objects.length).toBe(2);
  });

  it('cut copies then removes, and the cut content can be pasted back', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A', x: 5, y: 5 });
    s.setSelection([a.id]);
    s.cut();
    expect(s.slide.objects.length).toBe(0);
    const [pasted] = s.paste();
    expect(s.slide.objects.length).toBe(1);
    expect(pasted.html).toBe('A');
  });

  it('paste remaps group membership to a fresh shared groupId', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A' });
    const b = s.addObject({ html: 'B' });
    s.setSelection([a.id, b.id]);
    s.group();
    s.setSelection([a.id, b.id]);
    s.copy();
    const pasted = s.paste();
    expect(pasted).toHaveLength(2);
    expect(pasted[0].groupId).toBe(pasted[1].groupId);
    expect(pasted[0].groupId).not.toBe(a.groupId);
    expect(pasted[0].groupId).not.toBeNull();
  });

  it('paste with nothing copied is a no-op', () => {
    const s = new Store();
    s.addObject({ html: 'A' });
    expect(s.paste()).toEqual([]);
    expect(s.slide.objects.length).toBe(1);
  });

  it('the clipboard is independent of later edits to the source', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A', x: 0 });
    s.setSelection([a.id]);
    s.copy();
    s.patch(a.id, { x: 999 });
    const [pasted] = s.paste();
    expect(pasted.x).toBe(16); // from the snapshot x:0, not 999
  });
});
