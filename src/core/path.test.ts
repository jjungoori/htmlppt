// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  type PathData,
  type Pt,
  pathBBox,
  polygonArea,
  pathD,
  renderPath,
  createPath,
  parsePath,
  translatePath,
  moveNode,
  setNodeHandle,
  addNode,
  deleteNode,
  booleanPath,
} from './path';

/** Square [x0,y0] .. [x0+s, y0+s] as a closed corner polygon. */
function square(x0: number, y0: number, s: number): PathData {
  return {
    nodes: [
      { x: x0, y: y0 },
      { x: x0 + s, y: y0 },
      { x: x0 + s, y: y0 + s },
      { x: x0, y: y0 + s },
    ],
    closed: true,
  };
}

const absArea = (nodes: Pt[]) => Math.abs(polygonArea(nodes));

describe('path geometry', () => {
  it('computes bbox over anchors and handles', () => {
    const data: PathData = {
      nodes: [{ x: 0, y: 0, out: { x: 50, y: -20 } }, { x: 100, y: 100 }],
      closed: false,
    };
    expect(pathBBox(data)).toEqual({ x: 0, y: -20, w: 100, h: 120 });
  });

  it('builds straight and cubic segments', () => {
    expect(pathD(square(0, 0, 10))).toBe('M 0 0 L 10 0 L 10 10 L 0 10 Z');
    const curved: PathData = {
      nodes: [{ x: 0, y: 0, out: { x: 10, y: 0 } }, { x: 20, y: 20, in: { x: 20, y: 10 } }],
      closed: false,
    };
    expect(pathD(curved)).toBe('M 0 0 C 10 0 20 10 20 20');
  });
});

describe('render/parse roundtrip', () => {
  it('stamps spec and reads it back losslessly', () => {
    const data: PathData = {
      nodes: [{ x: 5, y: 5, out: { x: 15, y: 0 } }, { x: 30, y: 30, in: { x: 25, y: 20 } }],
      closed: false,
      style: { fill: '#abc', stroke: '#123', strokeWidth: 3 },
    };
    const back = parsePath(renderPath(data));
    expect(back).toEqual(data);
  });

  it('createPath fits the object box to the path bbox', () => {
    const init = createPath(square(10, 20, 40));
    expect({ x: init.x, y: init.y, w: init.w, h: init.h }).toEqual({ x: 10, y: 20, w: 40, h: 40 });
    expect(parsePath(init.html)).toEqual(square(10, 20, 40));
  });

  it('returns null for non-path html', () => {
    expect(parsePath('<svg class="sc-shape"></svg>')).toBeNull();
  });
});

describe('point editing (pure)', () => {
  it('translate moves anchors and handles', () => {
    const d = translatePath(
      { nodes: [{ x: 0, y: 0, out: { x: 5, y: 5 } }], closed: false },
      10, 20,
    );
    expect(d.nodes[0]).toEqual({ x: 10, y: 20, out: { x: 15, y: 25 } });
  });

  it('moveNode carries handles by the delta', () => {
    const d = moveNode({ nodes: [{ x: 0, y: 0, in: { x: -5, y: 0 } }], closed: false }, 0, 10, 0);
    expect(d.nodes[0]).toEqual({ x: 10, y: 0, in: { x: 5, y: 0 } });
  });

  it('set and clear handles', () => {
    let d = setNodeHandle(square(0, 0, 10), 0, 'out', { x: 3, y: 3 });
    expect(d.nodes[0].out).toEqual({ x: 3, y: 3 });
    d = setNodeHandle(d, 0, 'out', null);
    expect(d.nodes[0].out).toBeUndefined();
  });

  it('add and delete nodes, with a 2-node floor', () => {
    const added = addNode(square(0, 0, 10), 0, { x: 5, y: 0 });
    expect(added.nodes.length).toBe(5);
    expect(added.nodes[1]).toEqual({ x: 5, y: 0 });
    let d: PathData = { nodes: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], closed: true };
    d = deleteNode(d, 1);
    expect(d.nodes.length).toBe(2);
    d = deleteNode(d, 0);
    expect(d.nodes.length).toBe(2); // floor
  });

  it('does not mutate the input', () => {
    const src = square(0, 0, 10);
    moveNode(src, 0, 99, 99);
    expect(src.nodes[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('boolean merge (Greiner–Hormann)', () => {
  // A = [0,0..10,10], B = [5,5..15,15] overlap in a 5×5 square.
  const A = square(0, 0, 10);
  const B = square(5, 5, 10);

  it('intersection yields the 25-area overlap', () => {
    const out = booleanPath(A, B, 'intersection');
    expect(out.length).toBe(1);
    expect(absArea(out[0].nodes)).toBeCloseTo(25, 6);
    expect(pathBBox(out[0])).toEqual({ x: 5, y: 5, w: 5, h: 5 });
  });

  it('union yields area 175', () => {
    const out = booleanPath(A, B, 'union');
    const total = out.reduce((s, r) => s + absArea(r.nodes), 0);
    expect(total).toBeCloseTo(175, 6);
  });

  it('difference A−B yields area 75', () => {
    const out = booleanPath(A, B, 'difference');
    const total = out.reduce((s, r) => s + absArea(r.nodes), 0);
    expect(total).toBeCloseTo(75, 6);
  });

  it('disjoint shapes: union keeps both, intersection empty', () => {
    const far = square(100, 100, 10);
    expect(booleanPath(A, far, 'union').length).toBe(2);
    expect(booleanPath(A, far, 'intersection').length).toBe(0);
    expect(booleanPath(A, far, 'difference').length).toBe(1);
  });

  it('containment: B inside A', () => {
    const inner = square(2, 2, 4); // fully inside A
    expect(absArea(booleanPath(A, inner, 'intersection')[0].nodes)).toBeCloseTo(16, 6);
    expect(absArea(booleanPath(A, inner, 'union')[0].nodes)).toBeCloseTo(100, 6);
  });
});
