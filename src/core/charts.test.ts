// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  createChart,
  createChartData,
  renderChart,
  parseChart,
  setValue,
  addCategory,
  removeCategory,
  addSeries,
  removeSeries,
  renameSeries,
  renameCategory,
  setChartKind,
  type ChartData,
} from './charts';

/** Render → parse and recover the spec (lossless via data-sc-chart). */
function roundtrip(data: ChartData): ChartData {
  const back = parseChart(renderChart(data));
  if (!back) throw new Error('no chart parsed');
  return back;
}

const sample = (): ChartData =>
  createChartData(
    'bar',
    ['Q1', 'Q2', 'Q3'],
    [
      { name: 'Rev', values: [10, 20, 30] },
      { name: 'Cost', values: [5, 8, 12] },
    ],
  );

describe('createChartData / createChart', () => {
  it('normalizes series to category width, padding with 0', () => {
    const d = createChartData('bar', ['A', 'B', 'C'], [{ name: 'S', values: [1] }]);
    expect(d.series[0].values).toEqual([1, 0, 0]);
  });

  it('falls back to defaults for empty categories/series', () => {
    const d = createChartData('line', [], []);
    expect(d.categories.length).toBe(3);
    expect(d.series.length).toBe(1);
  });

  it('createChart yields an object init with <svg class="sc-chart"> html', () => {
    const init = createChart('pie', ['A', 'B'], [{ name: 'S', values: [3, 7] }]);
    expect(init.html).toContain('<svg class="sc-chart"');
    expect(init.w).toBeGreaterThan(0);
    expect(init.h).toBeGreaterThan(0);
  });
});

describe('renderChart', () => {
  it('renders bars for a bar chart', () => {
    const html = renderChart(sample());
    expect(html).toContain('<rect');
    expect(html).toContain('data-sc-chart=');
  });

  it('renders polylines for a line chart', () => {
    const html = renderChart(setChartKind(sample(), 'line'));
    expect(html).toContain('<polyline');
  });

  it('renders slices for a pie chart', () => {
    const d = createChartData('pie', ['A', 'B', 'C'], [{ name: 'S', values: [1, 2, 3] }]);
    const html = renderChart(d);
    expect(html).toMatch(/<path|<circle/);
  });

  it('escapes labels in the embedded spec and text', () => {
    const d = createChartData('bar', ['<x>'], [{ name: 'a&b', values: [1] }]);
    const html = renderChart(d);
    expect(html).toContain('&lt;x&gt;');
    expect(html).not.toContain('<x>');
  });
});

describe('roundtrip (render → parse)', () => {
  it('recovers the full spec losslessly', () => {
    const d = sample();
    expect(roundtrip(d)).toEqual(d);
  });

  it('survives edits', () => {
    const d = setValue(addSeries(sample()), 0, 1, 99);
    expect(roundtrip(d)).toEqual(d);
  });

  it('parseChart returns null when there is no chart', () => {
    expect(parseChart('<div>no chart</div>')).toBeNull();
  });
});

describe('pure data-edit ops', () => {
  it('setValue updates one cell without mutating the input', () => {
    const d = sample();
    const d2 = setValue(d, 0, 2, 99);
    expect(d2.series[0].values[2]).toBe(99);
    expect(d.series[0].values[2]).toBe(30);
  });

  it('addCategory extends every series with 0', () => {
    const d = addCategory(sample());
    expect(d.categories.length).toBe(4);
    expect(d.series.every((s) => s.values.length === 4)).toBe(true);
    expect(d.series.every((s) => s.values[3] === 0)).toBe(true);
  });

  it('removeCategory shrinks all series; no-op at one column', () => {
    const d = removeCategory(sample(), 1);
    expect(d.categories).toEqual(['Q1', 'Q3']);
    expect(d.series[0].values).toEqual([10, 30]);
    const one = createChartData('bar', ['only'], [{ name: 'S', values: [1] }]);
    expect(removeCategory(one, 0).categories.length).toBe(1);
  });

  it('addSeries / removeSeries; removeSeries no-op at one series', () => {
    const d = addSeries(sample());
    expect(d.series.length).toBe(3);
    expect(d.series[2].values).toEqual([0, 0, 0]);
    const back = removeSeries(removeSeries(d, 2), 1);
    expect(back.series.length).toBe(1);
    expect(removeSeries(back, 0).series.length).toBe(1);
  });

  it('rename ops', () => {
    expect(renameSeries(sample(), 0, 'X').series[0].name).toBe('X');
    expect(renameCategory(sample(), 0, 'Y').categories[0]).toBe('Y');
  });

  it('setChartKind switches the kind', () => {
    expect(setChartKind(sample(), 'pie').kind).toBe('pie');
  });
});
