import { describe, it, expect } from 'vitest';
import { parseDocument, createDocument } from './model';

describe('parseDocument', () => {
  it('round-trips a well-formed document', () => {
    const doc = createDocument(1024, 768);
    doc.slides[0].objects.push({
      id: 'o1',
      x: 10,
      y: 20,
      w: 100,
      h: 50,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      zIndex: 3,
      locked: false,
      groupId: null,
      html: '<h1>hi</h1>',
      animations: [{ preset: 'fade', durationMs: 400, delayMs: 0, kind: 'enter' }],
    });
    const out = parseDocument(JSON.parse(JSON.stringify(doc)));
    expect(out).toEqual(doc);
  });

  it('fills missing object fields (e.g. animations) with defaults', () => {
    const out = parseDocument({
      version: 1,
      width: 1280,
      height: 720,
      slides: [{ id: 's1', objects: [{ html: '<p>x</p>' }] }],
    });
    const obj = out.slides[0].objects[0];
    expect(obj.animations).toEqual([]);
    expect(obj.w).toBe(200);
    expect(obj.locked).toBe(false);
    expect(obj.html).toBe('<p>x</p>');
  });

  it('drops objects without html and invalid animations', () => {
    const out = parseDocument({
      version: 1,
      width: 1280,
      height: 720,
      slides: [
        {
          id: 's1',
          objects: [
            { html: '<p>keep</p>', animations: [{ preset: 'fade' }, { foo: 1 }, 'bad'] },
            { x: 5 },
          ],
        },
      ],
    });
    expect(out.slides[0].objects).toHaveLength(1);
    const anims = out.slides[0].objects[0].animations;
    expect(anims).toHaveLength(1);
    expect(anims[0]).toEqual({ preset: 'fade', durationMs: 400, delayMs: 0, kind: 'enter' });
  });

  it('throws on non-object, wrong version, or no slides', () => {
    expect(() => parseDocument(null)).toThrow();
    expect(() => parseDocument({ version: 2, slides: [{}] })).toThrow(/version/);
    expect(() => parseDocument({ version: 1, slides: [] })).toThrow(/no slides/);
  });

  it('coerces non-finite dimensions to defaults and keeps themeId', () => {
    const out = parseDocument({
      version: 1,
      width: NaN,
      height: 'tall',
      slides: [{ objects: [] }],
      themeId: 'dark',
    });
    expect(out.width).toBe(1280);
    expect(out.height).toBe(720);
    expect(out.themeId).toBe('dark');
  });
});
