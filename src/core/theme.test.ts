import { describe, it, expect } from 'vitest';
import { Store } from '../editor/store';
import {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  getTheme,
  themeVars,
} from './theme';

describe('Theme model (M10)', () => {
  it('has unique built-in ids and a default that is the first', () => {
    const ids = BUILTIN_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_THEME).toBe(BUILTIN_THEMES[0]);
  });

  it('getTheme resolves known ids and rejects unknown', () => {
    expect(getTheme('dark')?.id).toBe('dark');
    expect(getTheme('nope')).toBeUndefined();
  });

  it('themeVars flattens palette + fonts into --sc-* css vars', () => {
    const vars = themeVars(getTheme('dark')!);
    expect(vars['--sc-bg']).toBe('#0f1419');
    expect(vars['--sc-text']).toBe('#e6e9ee');
    expect(vars['--sc-font-body']).toContain('sans-serif');
    expect(Object.keys(vars).every((k) => k.startsWith('--sc-'))).toBe(true);
  });
});

describe('Store theme (M10)', () => {
  it('defaults to DEFAULT_THEME when none is set', () => {
    const s = new Store();
    expect(s.doc.themeId).toBeUndefined();
    expect(s.theme).toBe(DEFAULT_THEME);
  });

  it('setTheme switches theme and is undoable', () => {
    const s = new Store();
    s.setTheme('dark');
    expect(s.doc.themeId).toBe('dark');
    expect(s.theme.id).toBe('dark');
    s.history.undo();
    expect(s.doc.themeId).toBeUndefined();
    expect(s.theme).toBe(DEFAULT_THEME);
    s.history.redo();
    expect(s.doc.themeId).toBe('dark');
  });

  it('setTheme ignores unknown ids and no-op repeats', () => {
    const s = new Store();
    s.setTheme('nope');
    expect(s.doc.themeId).toBeUndefined();
    expect(s.history.canUndo()).toBe(false);
    s.setTheme('editorial');
    s.setTheme('editorial'); // no second history entry
    s.history.undo();
    expect(s.doc.themeId).toBeUndefined();
  });

  it('survives serialization round-trip', () => {
    const s = new Store();
    s.setTheme('mono');
    const json = s.toJSON();
    const s2 = new Store();
    s2.fromJSON(json);
    expect(s2.theme.id).toBe('mono');
  });
});
