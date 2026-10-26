import { $, app, each, hint, save, state, toggles } from './app';
import type { MapTab, Tab, Toggle } from './app';
import { atlasTab, rememberAtlasView } from './atlas';
import { learnTab, openLesson, renderList } from './learn';
import { LESSONS } from './lessons';
import { quizTab } from './quiz';
import { renderRef } from './ref';
import { Sky } from './sky';
import { SkyMap } from './skymap';

const TOGGLE_LABELS: Record<MapTab, Partial<Record<Toggle, string>>> = {
  learn: { lines: 'Все линии', names: 'Подписи', bounds: 'Границы', grid: 'Сетка', ecliptic: 'Эклиптика', mw: 'Млечный Путь', dso: 'Объекты' },
  quiz: { lines: 'Подсказка: линии', grid: 'Сетка', ecliptic: 'Эклиптика', mw: 'Млечный Путь' },
  atlas: { lines: 'Линии', names: 'Подписи', bounds: 'Границы', grid: 'Сетка', ecliptic: 'Эклиптика', mw: 'Млечный Путь', dso: 'Объекты' },
};

function boot() {
  const sky = new Sky(window.SKY);
  const map = new SkyMap($<HTMLCanvasElement>('sky'), sky);
  app.sky = sky;
  app.map = map;
  app.panel = $('panel');
  app.tabs = { learn: learnTab, quiz: quizTab, atlas: atlasTab };

  map.starLabel = (i, focus) => {
    const name = sky.curatedName(i);
    if (focus) return name || sky.starLetter(i);
    return name || (sky.mag[i] < 1.5 ? sky.starName(i) : '');
  };
  map.onclick = (c) => {
    const t = state.tab;
    if (t === 'learn' || t === 'quiz' || t === 'atlas') app.tabs[t].click(c);
  };
  map.onviewchange = (v) => { if (state.tab === 'atlas') rememberAtlasView(v); };

  app.setTab = setTab;
  app.updateProgress = updateProgress;

  each(document.querySelectorAll('[data-tab]'), (b) => b.addEventListener('click', () => setTab((b as HTMLElement).dataset.tab as Tab)));
  $('btn-menu').addEventListener('click', () => {
    if (state.tab !== 'learn') setTab('learn');
    document.body.classList.toggle('drawer-open');
  });
  $('scrim').addEventListener('click', () => document.body.classList.remove('drawer-open'));
  $('z-in').addEventListener('click', () => map.zoomBy(1 / 1.4));
  $('z-out').addEventListener('click', () => map.zoomBy(1.4));
  $('z-home').addEventListener('click', () => {
    const t = state.tab;
    if (t === 'learn' || t === 'quiz' || t === 'atlas') map.flyTo(app.tabs[t].home());
  });

  updateProgress();
  renderList();
  setTab(state.tab === 'ref' ? 'ref' : state.tab, true);
  if (state.tab === 'learn') openLesson(state.lesson, false);
  document.body.classList.add('ready');
  if (!state.done.intro && state.lesson === 0) hint('Карту можно двигать пальцем или мышью и приближать', 5000);

  // ?debug — доступ к приложению из консоли (для автотестов).
  if (/[?&]debug/.test(location.search)) (window as unknown as { __app: typeof app }).__app = app;
  // ?fps в адресе — показать время отрисовки кадра (для проверки на слабых телефонах).
  if (/[?&#]fps/.test(location.search + location.hash)) {
    const el = document.createElement('div');
    el.className = 'fps';
    document.body.appendChild(el);
    window.setInterval(() => {
      const q = map.quality;
      el.textContent = `кадр ${map.drawMs.toFixed(1)} мс · DPR ${q.dpr} · звёзды ${q.magOffset ? q.magOffset.toFixed(1) : '±0'}`;
    }, 500);
  }
}

function renderToolbar(tab: MapTab) {
  const labels = TOGGLE_LABELS[tab], t = toggles[tab];
  const el = $('tools');
  el.innerHTML = (Object.keys(labels) as Toggle[]).map((k) =>
    `<button class="tg${t[k] ? ' on' : ''}" data-t="${k}">${labels[k]}</button>`).join('');
  each(el.querySelectorAll('.tg'), (b) => b.addEventListener('click', () => {
    const k = (b as HTMLElement).dataset.t as Toggle;
    t[k] = !t[k];
    b.classList.toggle('on', t[k]);
    app.tabs[tab].render();
  }));
}

function setTab(tab: Tab, first = false) {
  const prev = state.tab;
  state.tab = tab;
  save();
  document.body.className = document.body.className.replace(/\btab-\w+/g, '').trim() + ` tab-${tab}`;
  document.body.classList.remove('drawer-open');
  each(document.querySelectorAll('[data-tab]'), (b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === tab));
  $('banner').className = 'banner';
  hint(null);
  if (tab === 'ref') { renderRef(); return; }
  // Колонки меняют размер — подгоняем холст до первой отрисовки.
  app.map.resize();
  renderToolbar(tab);
  if (first && tab === 'learn') return;
  if (prev !== tab || first) app.tabs[tab].enter();
}

function updateProgress() {
  const n = LESSONS.filter((L) => state.done[L.id]).length;
  $('prog-fill').style.width = `${Math.round(n / LESSONS.length * 100)}%`;
  $('prog-text').textContent = `${n} / ${LESSONS.length}`;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
