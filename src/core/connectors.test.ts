// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  createConnectorData,
  createConnector,
  renderConnector,
  routeConnector,
  parseConnector,
  anchorPoint,
  setRouting,
  setSide,
  setArrows,
  setStyle,
  type ConnectorData,
} from './connectors';
import type { Rect } from './transform';

const A: Rect = { x: 0, y: 0, w: 100, h: 100 };
const B: Rect = { x: 300, y: 0, w: 100, h: 100 };

/** Render → parse and recover the spec (lossless via data-sc-connector). */
function roundtrip(data: ConnectorData): ConnectorData {
  const { points, bbox } = routeConnector(data, A, B);
  const back = parseConnector(renderConnector(data, points, bbox));
  if (!back) throw new Error('no connector parsed');
  return back;
}

describe('anchorPoint', () => {
  it('returns the named edge midpoint', () => {
    expect(anchorPoint(A, 'right', B)).toEqual({ x: 100, y: 50 });
    expect(anchorPoint(A, 'top', B)).toEqual({ x: 50, y: 0 });
    expect(anchorPoint(A, 'bottom', B)).toEqual({ x: 50, y: 100 });
    expect(anchorPoint(A, 'left', B)).toEqual({ x: 0, y: 50 });
  });

  it('auto picks the edge facing the peer', () => {
    // B is to the right of A → A exits right, B enters left.
    expect(anchorPoint(A, 'auto', B)).toEqual({ x: 100, y: 50 });
    expect(anchorPoint(B, 'auto', A)).toEqual({ x: 300, y: 50 });
  });

  it('auto picks vertical edge when the peer is mostly above/below', () => {
    const below: Rect = { x: 0, y: 300, w: 100, h: 100 };
    expect(anchorPoint(A, 'auto', below)).toEqual({ x: 50, y: 100 });
    expect(anchorPoint(below, 'auto', A)).toEqual({ x: 50, y: 300 });
  });
});

describe('routeConnector', () => {
  it('straight route is the two anchor points', () => {
    const data = createConnectorData('a', 'b');
    const { points } = routeConnector(data, A, B);
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 },
    ]);
  });

  it('orthogonal route inserts a single mid elbow', () => {
    const below: Rect = { x: 0, y: 300, w: 100, h: 100 };
    const data = createConnectorData('a', 'b', { routing: 'orthogonal' });
    const { points } = routeConnector(data, A, below);
    expect(points.length).toBe(4);
    // first/last are the anchors; middle two share the mid X.
    expect(points[1].x).toBe(points[2].x);
  });

  it('bbox encloses all points with padding', () => {
    const data = createConnectorData('a', 'b');
    const { points, bbox } = routeConnector(data, A, B);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(bbox.x);
      expect(p.y).toBeGreaterThanOrEqual(bbox.y);
      expect(p.x).toBeLessThanOrEqual(bbox.x + bbox.w);
      expect(p.y).toBeLessThanOrEqual(bbox.y + bbox.h);
    }
    // padded, so strictly inside.
    expect(bbox.x).toBeLessThan(points[0].x);
  });
});

describe('renderConnector', () => {
  it('emits an sc-connector svg with a polyline in local coords', () => {
    const data = createConnectorData('a', 'b');
    const { points, bbox } = routeConnector(data, A, B);
    const svg = renderConnector(data, points, bbox);
    expect(svg).toContain('class="sc-connector"');
    expect(svg).toContain('<polyline');
    // local frame: first anchor (100,50) minus bbox.x (88) → 12
    expect(svg).toContain('points="12.0,12.0 212.0,12.0"');
  });

  it('draws an end arrowhead by default, none at start', () => {
    const data = createConnectorData('a', 'b');
    const { points, bbox } = routeConnector(data, A, B);
    const svg = renderConnector(data, points, bbox);
    expect((svg.match(/<polygon/g) ?? []).length).toBe(1);
  });

  it('draws both arrowheads when requested', () => {
    const data = setArrows(createConnectorData('a', 'b'), true, true);
    const { points, bbox } = routeConnector(data, A, B);
    const svg = renderConnector(data, points, bbox);
    expect((svg.match(/<polygon/g) ?? []).length).toBe(2);
  });
});

describe('roundtrip (render → parse)', () => {
  it('recovers a straight connector spec', () => {
    const data = createConnectorData('a', 'b');
    expect(roundtrip(data)).toEqual(data);
  });

  it('recovers an orthogonal, dashed, double-arrow connector', () => {
    let data = createConnectorData('a', 'b', { fromSide: 'right', toSide: 'left' });
    data = setRouting(data, 'orthogonal');
    data = setArrows(data, true, true);
    data = setStyle(data, { stroke: '#f00', strokeWidth: 4, dash: '6 4' });
    expect(roundtrip(data)).toEqual(data);
  });

  it('parseConnector returns null for non-connector html', () => {
    expect(parseConnector('<div>hi</div>')).toBeNull();
    expect(parseConnector('<svg class="sc-chart"></svg>')).toBeNull();
  });
});

describe('pure spec-edit ops', () => {
  it('setRouting / setSide / setArrows / setStyle do not mutate the input', () => {
    const base = createConnectorData('a', 'b');
    const frozen = JSON.stringify(base);
    setRouting(base, 'orthogonal');
    setSide(base, 'from', 'top');
    setArrows(base, true, false);
    setStyle(base, { stroke: '#abc' });
    expect(JSON.stringify(base)).toBe(frozen);
  });

  it('setSide updates the targeted end only', () => {
    const d = setSide(createConnectorData('a', 'b'), 'to', 'bottom');
    expect(d.to.side).toBe('bottom');
    expect(d.from.side).toBe('auto');
  });

  it('setStyle merges over the existing style', () => {
    let d = setStyle(createConnectorData('a', 'b'), { stroke: '#111' });
    d = setStyle(d, { strokeWidth: 5 });
    expect(d.style).toEqual({ stroke: '#111', strokeWidth: 5 });
  });
});

describe('createConnector', () => {
  it('positions the object at the routed bounding box', () => {
    const data = createConnectorData('a', 'b');
    const init = createConnector(data, A, B);
    const { bbox } = routeConnector(data, A, B);
    expect(init.x).toBe(bbox.x);
    expect(init.y).toBe(bbox.y);
    expect(init.w).toBe(bbox.w);
    expect(init.h).toBe(bbox.h);
    expect(init.html).toContain('sc-connector');
  });
});
