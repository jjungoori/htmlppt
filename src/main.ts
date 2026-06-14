/** Dev demo harness (not part of the published library). */
import { Editor } from './index';

const editor = new Editor(document.getElementById('editor')!, { width: 1280, height: 720 });

const samples = [
  `<h1 style="margin:0;color:#1c7ed6;font:700 32px system-ui">제목 슬라이드</h1>`,
  `<p style="margin:0;font:16px system-ui">임의의 <b>순수 HTML</b>이 그대로 들어옵니다.</p>`,
  `<div style="width:100%;height:100%;background:#ffd43b;border-radius:12px"></div>`,
];
let i = 0;

editor.importHTML(samples[0], { x: 80, y: 60, w: 520, h: 70 });

document.getElementById('add')!.addEventListener('click', () => {
  i += 1;
  editor.importHTML(samples[i % samples.length], {
    x: 100 + (i % 5) * 40,
    y: 160 + (i % 5) * 40,
    w: 360,
    h: 120,
  });
});
document.getElementById('undo')!.addEventListener('click', () => editor.undo());
document.getElementById('redo')!.addEventListener('click', () => editor.redo());
document.getElementById('save')!.addEventListener('click', () => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(editor.toJSON(), null, 2));
});
