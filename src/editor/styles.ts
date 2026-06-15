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
.sc-object.sc-editing { cursor: text; user-select: text; }
.sc-object.sc-editing .sc-content {
  pointer-events: auto; user-select: text; overflow: auto;
  outline: 2px solid #2684ff; outline-offset: 0; cursor: text;
}
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

.sc-panel {
  display: flex; flex-direction: column; background: #f1f3f5;
  border-right: 1px solid #dee2e6; box-sizing: border-box; height: 100%;
}
.sc-panel-list { flex: 1; overflow-y: auto; padding: 8px; }
.sc-thumb {
  display: flex; gap: 6px; align-items: flex-start; padding: 4px;
  border-radius: 4px; cursor: pointer;
}
.sc-thumb + .sc-thumb { margin-top: 6px; }
.sc-thumb:hover { background: #e9ecef; }
.sc-thumb-active, .sc-thumb-active:hover { background: #d0ebff; }
.sc-thumb-over { outline: 2px solid #2684ff; outline-offset: -2px; }
.sc-thumb-num { font: 11px system-ui; color: #868e96; width: 16px; text-align: right; }
.sc-thumb-frame {
  position: relative; overflow: hidden; background: #fff;
  border: 1px solid #ced4da; box-sizing: border-box; pointer-events: none;
}
.sc-thumb-stage { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.sc-thumb-obj {
  position: absolute; top: 0; left: 0; transform-origin: 50% 50%;
  box-sizing: border-box; overflow: hidden;
}
.sc-panel-toolbar {
  display: flex; gap: 4px; padding: 6px 8px; border-top: 1px solid #dee2e6;
}
.sc-panel-toolbar button { flex: 1; padding: 4px 0; cursor: pointer; }
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
