/**
 * Property panel (M15). A live inspector for the current selection: edit
 * position/size/rotation/opacity of the sole selected object, plus the document
 * theme. It reflects model state (re-rendering on 'change'/'selection') and
 * writes back only through Store commands (patch/setTheme), so every edit is
 * undoable and the model stays the single source of truth.
 */
import type { SlideObject } from '../core/model';
import { BUILTIN_THEMES } from '../core/theme';
import type { Store } from './store';

type NumField = 'x' | 'y' | 'w' | 'h' | 'angle' | 'opacity';

const FIELDS: { key: NumField; label: string; step: number; min?: number; max?: number }[] = [
  { key: 'x', label: 'X', step: 1 },
  { key: 'y', label: 'Y', step: 1 },
  { key: 'w', label: 'W', step: 1, min: 1 },
  { key: 'h', label: 'H', step: 1, min: 1 },
  { key: 'angle', label: '°', step: 1 },
  { key: 'opacity', label: '투명도', step: 0.05, min: 0, max: 1 },
];

export class PropertyPanel {
  readonly root: HTMLDivElement;
  private readonly inputs = new Map<NumField, HTMLInputElement>();
  private theme!: HTMLSelectElement;
  private readonly dispose: () => void;

  constructor(
    private readonly host: HTMLElement,
    private readonly store: Store,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'sc-props';
    this.build();
    this.host.appendChild(this.root);
    const offChange = this.store.on('change', () => this.render());
    const offSel = this.store.on('selection', () => this.render());
    this.dispose = () => {
      offChange();
      offSel();
    };
    this.render();
  }

  destroy(): void {
    this.dispose();
    this.root.remove();
  }

  /** The sole selected object, or undefined when 0 or >1 are selected. */
  private sole(): SlideObject | undefined {
    if (this.store.selection.size !== 1) return undefined;
    const [id] = this.store.selection;
    return this.store.find(id);
  }

  private build(): void {
    const grid = document.createElement('div');
    grid.className = 'sc-props-grid';
    for (const f of FIELDS) {
      const wrap = document.createElement('label');
      wrap.className = 'sc-props-field';
      const span = document.createElement('span');
      span.textContent = f.label;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = String(f.step);
      if (f.min != null) input.min = String(f.min);
      if (f.max != null) input.max = String(f.max);
      input.addEventListener('input', () => this.commit(f.key, input));
      this.inputs.set(f.key, input);
      wrap.append(span, input);
      grid.appendChild(wrap);
    }
    this.root.appendChild(grid);

    const themeWrap = document.createElement('label');
    themeWrap.className = 'sc-props-field sc-props-theme';
    const themeLabel = document.createElement('span');
    themeLabel.textContent = '테마';
    this.theme = document.createElement('select');
    for (const t of BUILTIN_THEMES) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      this.theme.appendChild(opt);
    }
    this.theme.addEventListener('change', () => this.store.setTheme(this.theme.value));
    themeWrap.append(themeLabel, this.theme);
    this.root.appendChild(themeWrap);
  }

  private commit(key: NumField, input: HTMLInputElement): void {
    const o = this.sole();
    if (!o) return;
    const v = Number(input.value);
    if (!Number.isFinite(v)) return;
    let next = v;
    if ((key === 'w' || key === 'h') && next < 1) next = 1;
    if (key === 'opacity') next = Math.min(1, Math.max(0, next));
    if (next === o[key]) return;
    // Coalesce repeated edits of the same field on the same object into one undo.
    this.store.patch(o.id, { [key]: next }, `prop-${key}-${o.id}`);
  }

  private render(): void {
    const o = this.sole();
    const enabled = !!o;
    for (const [key, input] of this.inputs) {
      input.disabled = !enabled;
      // Don't clobber the field the user is actively typing in.
      if (o && document.activeElement !== input) {
        input.value = key === 'opacity' ? String(round(o[key], 2)) : String(round(o[key], 1));
      } else if (!o) {
        input.value = '';
      }
    }
    this.theme.value = this.store.doc.themeId ?? this.store.theme.id;
  }
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
