/** Injected base stylesheet for the editor stage. */
export const BASE_CSS = `
.sc-host { position: relative; overflow: auto; background: #e9ecef; }
.sc-stage {
  position: relative; margin: 24px auto; background: #fff;
  box-shadow: 0 2px 16px rgba(0,0,0,.15); transform-origin: 0 0;
}
.sc-object {
  position: absolute; top: 0; left: 0; transform-origin: 50% 50%;
  box-sizing: border-box; cursor: move; user-select: none;
}
.sc-object .sc-content { width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
.sc-object.sc-selected { outline: 1px dashed rgba(38,132,255,.7); outline-offset: 0; }
.sc-overlay {
  position: absolute; inset: 0; pointer-events: none; z-index: 10000;
  transform-origin: 0 0;
}
.sc-overlay > * { position: absolute; top: 0; left: 0; box-sizing: border-box; }
.sc-selbox { border: 1.5px solid #2684ff; }
.sc-marquee { border: 1px solid #2684ff; background: rgba(38,132,255,.12); }
`;

let injected = false;
export function ensureBaseCss(): void {
  if (injected) return;
  const style = document.createElement('style');
  style.dataset.slidecraft = 'base';
  style.textContent = BASE_CSS;
  document.head.appendChild(style);
  injected = true;
}
