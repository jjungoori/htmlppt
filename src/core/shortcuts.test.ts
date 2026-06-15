import { describe, it, expect } from 'vitest';
import { Store } from '../editor/store';

describe('Shortcuts: selectAll / duplicate / nudge (M9)', () => {
  it('selectAll selects every object on the current slide', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A' });
    const b = s.addObject({ html: 'B' });
    s.selectAll();
    expect([...s.selection].sort()).toEqual([a.id, b.id].sort());
  });

  it('duplicate clones the selection in place with fresh ids and an offset', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A', x: 10, y: 20 });
    s.setSelection([a.id]);
    const [copy] = s.duplicate();
    expect(s.slide.objects.length).toBe(2);
    expect(copy.id).not.toBe(a.id);
    expect(copy.x).toBe(a.x + 16);
    expect(copy.y).toBe(a.y + 16);
    expect([...s.selection]).toEqual([copy.id]);
  });

  it('duplicate does not touch the clipboard', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A' });
    s.setSelection([a.id]);
    s.duplicate();
    expect(s.paste()).toEqual([]); // clipboard still empty
  });

  it('duplicate remaps group membership and is undoable', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A' });
    const b = s.addObject({ html: 'B' });
    s.setSelection([a.id, b.id]);
    s.group();
    s.setSelection([a.id, b.id]);
    const copies = s.duplicate();
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[0].groupId).not.toBe(a.groupId);
    s.history.undo();
    expect(s.slide.objects.length).toBe(2);
  });

  it('nudge moves the selection by (dx,dy) as one undo entry', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A', x: 5, y: 5 });
    const b = s.addObject({ html: 'B', x: 0, y: 0 });
    s.setSelection([a.id, b.id]);
    s.nudge(3, -2);
    expect(s.find(a.id)!.x).toBe(8);
    expect(s.find(a.id)!.y).toBe(3);
    expect(s.find(b.id)!.x).toBe(3);
    s.history.undo();
    expect(s.find(a.id)!.x).toBe(5);
    expect(s.find(b.id)!.x).toBe(0);
  });

  it('nudge with no selection or zero delta is a no-op', () => {
    const s = new Store();
    const a = s.addObject({ html: 'A', x: 5 });
    s.nudge(1, 1); // nothing selected
    expect(s.find(a.id)!.x).toBe(5);
    s.setSelection([a.id]);
    s.nudge(0, 0);
    expect(s.find(a.id)!.x).toBe(5); // zero delta changes nothing
  });
});
