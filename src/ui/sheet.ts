import { app } from './app';
import { $ } from './dom';

// Панель с текстом (уроки, тренировка, задачи, атлас) — в трёх положениях:
//   min — свёрнута: на телефоне остаётся полоска с названием, сбоку — панель спрятана (кнопка на карте);
//   mid — обычное положение;
//   max — во весь экран, карта скрыта.
// Положение — класс на <body> (sheet-min / sheet-max); как это выглядит при разной ширине экрана — в style.css.
export type Sheet = 'min' | 'mid' | 'max';
let sheet: Sheet = 'mid';

export function setSheet(s: Sheet) {
  sheet = s;
  document.body.className = document.body.className.replace(/\bsheet-\w+/g, '').trim() + (s === 'mid' ? '' : ` sheet-${s}`);
  // Без ResizeObserver (старый Chrome) карта сама не узнает, что её колонка изменилась.
  app.map.resize();
  app.map.redraw();
}

export const getSheet = () => sheet;

// Когда нужна карта (например, «Проверь себя»), панель не должна её закрывать.
export function showMap() { if (sheet === 'max') setSheet('mid'); }

const up = () => setSheet(sheet === 'min' ? 'mid' : 'max');
const down = () => setSheet(sheet === 'max' ? 'mid' : 'min');

export function initSheet() {
  const btn = (id: string, fn: () => void) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  btn('sheet-up', up);
  btn('sheet-down', down);
  btn('sheet-open', () => setSheet('mid'));

  // Полоска панели на телефоне (там видна «ручка»): смахнуть вверх — развернуть, вниз — свернуть,
  // нажать — свернуть или вернуть.
  const bar = $('sheet-bar'), grip = $('sheet-grip');
  let y0 = -1;
  bar.addEventListener('touchstart', (e) => { y0 = (e as TouchEvent).touches[0].clientY; });
  bar.addEventListener('touchend', (e) => {
    if (y0 < 0 || !grip.offsetWidth) return;
    const dy = (e as TouchEvent).changedTouches[0].clientY - y0;
    y0 = -1;
    if (dy < -30) { e.preventDefault(); up(); } else if (dy > 30) { e.preventDefault(); down(); }
  });
  bar.addEventListener('click', () => { if (grip.offsetWidth) setSheet(sheet === 'min' ? 'mid' : 'min'); });

  // В свёрнутой панели виден заголовок текущей страницы (название урока и т. п.).
  const title = $('sheet-title'), panel = app.panel;
  const sync = () => { const h = panel.querySelector('h1'); title.textContent = h ? h.textContent : ''; };
  const MO = (window as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver;
  if (MO) new MO(sync).observe(panel, { childList: true });
  sync();
}
