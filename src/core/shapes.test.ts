import { describe, it, expect } from 'vitest';
import { shapeSvg, createShape, createImage } from './shapes';

describe('shapeSvg', () => {
  it('fills the box via non-uniform scaling', () => {
    const svg = shapeSvg('rect');
    expect(svg).toContain('preserveAspectRatio="none"');
    expect(svg).toContain('width="100%"');
    expect(svg).toContain('height="100%"');
  });

  it('renders the requested primitive with style', () => {
    expect(shapeSvg('ellipse', { fill: '#f00' })).toContain('<ellipse');
    expect(shapeSvg('ellipse', { fill: '#f00' })).toContain('fill="#f00"');
    expect(shapeSvg('triangle')).toContain('<polygon');
    expect(shapeSvg('line')).toContain('<line');
  });

  it('keeps a line unfilled', () => {
    expect(shapeSvg('line')).toContain('fill="none"');
  });

  it('insets the rect by half the stroke so the outline is not clipped', () => {
    const svg = shapeSvg('rect', { strokeWidth: 4 });
    expect(svg).toContain('x="2"');
    expect(svg).toContain('width="96"');
  });
});

describe('createShape', () => {
  it('produces an init payload with html and a default box', () => {
    const init = createShape('rect');
    expect(init.html).toContain('<svg');
    expect(init.w).toBe(200);
    expect(init.h).toBe(120);
  });

  it('uses a thin wide default box for lines and honors overrides', () => {
    expect(createShape('line').h).toBe(8);
    expect(createShape('rect', {}, { x: 10, w: 50 })).toMatchObject({ x: 10, w: 50 });
  });
});

describe('createImage', () => {
  it('builds an <img> that fills the box', () => {
    const init = createImage('http://x/y.png');
    expect(init.html).toContain('<img');
    expect(init.html).toContain('src="http://x/y.png"');
    expect(init.html).toContain('object-fit:fill');
    expect(init.w).toBe(320);
  });

  it('escapes attribute-breaking characters in src and alt', () => {
    const init = createImage('a"><script>', {}, { alt: 'b"&<>' });
    expect(init.html).not.toContain('"><script>');
    expect(init.html).toContain('&quot;');
    expect(init.html).toContain('&amp;');
  });
});
