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
.sc-selbox { border: 1.5px solid #2684ff; transform-origin: 0 0; }
.sc-marquee { border: 1px solid #2684ff; background: rgba(38,132,255,.12); }
.sc-handle, .sc-rotate { position: absolute; pointer-events: auto; }
.sc-handle {
  width: 9px; height: 9px; margin: -5px 0 0 -5px;
  background: #fff; border: 1.5px solid #2684ff; border-radius: 2px;
}
.sc-selbox:not(.sc-has-handles) .sc-handle,
.sc-selbox:not(.sc-has-handles) .sc-rotate { display: none; }
.sc-h-nw { top: 0; left: 0; cursor: nwse-resize; }
.sc-h-n  { top: 0; left: 50%; cursor: ns-resize; }
.sc-h-ne { top: 0; left: 100%; cursor: nesw-resize; }
.sc-h-e  { top: 50%; left: 100%; cursor: ew-resize; }
.sc-h-se { top: 100%; left: 100%; cursor: nwse-resize; }
.sc-h-s  { top: 100%; left: 50%; cursor: ns-resize; }
.sc-h-sw { top: 100%; left: 0; cursor: nesw-resize; }
.sc-h-w  { top: 50%; left: 0; cursor: ew-resize; }
.sc-rotate {
  top: -22px; left: 50%; width: 11px; height: 11px; margin-left: -6px;
  background: #fff; border: 1.5px solid #2684ff; border-radius: 50%; cursor: grab;
}
.sc-guide { background: #ff3b6b; }
.sc-guide-x { width: 1px; top: 0; height: 100%; }
.sc-guide-y { height: 1px; left: 0; width: 100%; }
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
