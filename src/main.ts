/** Dev demo harness (not part of the published library). */
import { Editor } from './index';

const editor = new Editor(document.getElementById('editor')!, { width: 1280, height: 720 });
editor.mountSlidePanel(document.getElementById('panel')!);
editor.mountToolbar(document.getElementById('shellbar')!);
editor.mountProperties(document.getElementById('props')!);

// ── Auto-fit: scale the stage so the whole slide is visible in the canvas ──
const stage = editor.renderer.stage;
const canvas = document.getElementById('editor')!;
function fit() {
  const pad = 48;
  const aw = canvas.clientWidth - pad;
  const ah = canvas.clientHeight - pad;
  const scale = Math.min(aw / editor.store.doc.width, ah / editor.store.doc.height, 1);
  stage.style.transform = `scale(${scale})`;
  stage.style.transformOrigin = 'center center';
}
new ResizeObserver(fit).observe(canvas);
fit();

// ── A small sample so the editor isn't empty on first load ──
editor.importSlideHTML(`
  <div class="slide" style="font-family:system-ui;padding:64px">
    <h1 style="margin:0 0 16px;font:800 52px system-ui;color:#1c7ed6">SlideCraft</h1>
    <p style="margin:0;font:400 22px system-ui;color:#495057">
      AI가 만든 HTML 슬라이드를 <b>진짜 파워포인트처럼</b> 편집하세요.
    </p>
    <div style="margin-top:32px;width:240px;height:8px;background:#ffd43b;border-radius:4px"></div>
  </div>
`);
fit();

// ── Import modal wiring ──
const back = document.getElementById('import-back')!;
const ta = document.getElementById('import-html') as HTMLTextAreaElement;
const openModal = () => { back.classList.add('open'); ta.focus(); };
const closeModal = () => back.classList.remove('open');

document.getElementById('import')!.addEventListener('click', openModal);
document.getElementById('import-cancel')!.addEventListener('click', closeModal);
back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });

document.getElementById('import-go')!.addEventListener('click', () => {
  const html = ta.value.trim();
  if (!html) return closeModal();
  const deckMode = (document.getElementById('mode-deck') as HTMLInputElement).checked;
  const unwrap = (document.getElementById('import-unwrap') as HTMLInputElement).checked;
  try {
    if (deckMode) editor.importDeck(html);
    else editor.importDocument(html, { unwrap });
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert('가져오기 실패: ' + (err as Error).message);
    return;
  }
  fit();
  closeModal();
});

// ── Open an HTML file → import it directly ──
const fileInput = document.getElementById('file-input') as HTMLInputElement;
document.getElementById('open-file')!.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const html = await file.text();
  try {
    // A SlideCraft-exported deck (or a page of slide <section>s) loads as a full
    // deck; anything else becomes editable objects on a fresh slide.
    if (/data-sc-(slide|deck|object)/.test(html) || /<section[^>]*class="[^"]*sc-slide/.test(html)) {
      editor.importDeck(html);
    } else {
      editor.addSlide();
      editor.importSlideHTML(html);
    }
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert('파일 가져오기 실패: ' + (err as Error).message);
  }
  fileInput.value = ''; // allow re-selecting the same file
  fit();
});

// ── App-bar actions ──
document.getElementById('present')!.addEventListener('click', () => editor.startSlideshow());
document.getElementById('save')!.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(editor.toJSON(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'slidecraft.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
