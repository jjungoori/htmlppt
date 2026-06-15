import { describe, it, expect } from 'vitest';
import { Store } from '../editor/store';

describe('Slide management (M8)', () => {
  it('addSlide inserts after current and selects it, undoable', () => {
    const s = new Store();
    expect(s.doc.slides.length).toBe(1);
    s.addSlide();
    expect(s.doc.slides.length).toBe(2);
    expect(s.currentSlideIndex).toBe(1);
    s.history.undo();
    expect(s.doc.slides.length).toBe(1);
    expect(s.currentSlideIndex).toBe(0);
    s.history.redo();
    expect(s.doc.slides.length).toBe(2);
  });

  it('removeSlide keeps at least one slide', () => {
    const s = new Store();
    s.removeSlide();
    expect(s.doc.slides.length).toBe(1);
    s.addSlide();
    s.removeSlide();
    expect(s.doc.slides.length).toBe(1);
    s.history.undo(); // undo the remove
    expect(s.doc.slides.length).toBe(2);
  });

  it('duplicateSlide deep-copies objects with fresh ids', () => {
    const s = new Store();
    const o = s.addObject({ html: '<b>hi</b>', x: 5, y: 5 });
    s.duplicateSlide();
    expect(s.doc.slides.length).toBe(2);
    const copy = s.doc.slides[1];
    expect(copy.objects.length).toBe(1);
    expect(copy.objects[0].id).not.toBe(o.id);
    expect(copy.objects[0].html).toBe('<b>hi</b>');
    expect(copy.objects[0].x).toBe(5);
  });

  it('moveSlide reorders and is undoable', () => {
    const s = new Store();
    const a = s.doc.slides[0].id;
    const b = s.addSlide().id;
    s.moveSlide(1, 0);
    expect(s.doc.slides.map((sl) => sl.id)).toEqual([b, a]);
    s.history.undo();
    expect(s.doc.slides.map((sl) => sl.id)).toEqual([a, b]);
  });

  it('setCurrentSlide clamps to valid range', () => {
    const s = new Store();
    s.addSlide();
    s.setCurrentSlide(99);
    expect(s.currentSlideIndex).toBe(1);
    s.setCurrentSlide(-5);
    expect(s.currentSlideIndex).toBe(0);
  });
});
