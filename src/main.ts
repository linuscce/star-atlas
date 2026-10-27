import { Sky } from './core/sky';
import type { Lesson, Tab } from './core/types';
import { LESSONS } from './data/lessons';
import { T, fill, setTexts } from './i18n';
import { SkyMap } from './map/skymap';
import { atlasTab, goCon, rememberAtlasView } from './tabs/atlas';
import { learnTab, openLesson, renderList } from './tabs/learn';
import { quizTab } from './tabs/quiz';
import { tasksTab } from './tabs/tasks';
import { renderRef } from './tabs/ref';
import { app, trackPanelScroll } from './ui/app';
import { course, ensureCourse, lessonIndex, syncLessonIndex } from './ui/course';
import { $, each } from './ui/dom';
import { hint } from './ui/overlay';
import { currentRoute, setRoute, startRouter } from './ui/router';
import type { Route } from './ui/router';
import { save, state, store } from './ui/state';
import { initSheet, showMap } from './ui/sheet';
import { renderToolbar } from './ui/toolbar';

let shownCourse: Lesson[] = []; // маршрут уроков, который сейчас показан (северный или южный)

function boot() {
  setTexts(window.TEXT);
  store.set('sa.lang', T.lang); // корневая страница откроет этот язык в следующий раз
  if (typeof state.lat !== 'number' || isNaN(state.lat)) state.lat = T.defaultLat;
  const sky = new Sky(window.SKY);
  const map = new SkyMap($<HTMLCanvasElement>('sky'), sky);
  map.opt.southUp = state.southUp;
  app.sky = sky;
  app.map = map;
  app.panel = $('panel');
  trackPanelScroll();
  app.tabs = { learn: learnTab, quiz: quizTab, tasks: tasksTab, atlas: atlasTab };

  map.starLabel = (i, focus) => {
    const name = sky.curatedName(i);
    if (focus) return name || sky.starLetter(i);
    return name || (sky.mag[i] < 1.5 ? sky.starName(i) : '');
  };
  map.onclick = (c) => {
    const t = state.tab;
    if (t !== 'ref') app.tabs[t].click(c);
  };
  map.onviewchange = (v) => { if (state.tab === 'atlas') rememberAtlasView(v); };

  app.setTab = setTab;
  app.updateProgress = updateProgress;
  // Широта перешла через экватор — маршрут уроков другой (южный подгружается при первой надобности).
  app.placeChanged = () => {
    if (state.tab !== 'ref') renderToolbar(state.tab);
    ensureCourse(() => {
      if (course() !== shownCourse) {
        shownCourse = course();
        syncLessonIndex();
        if (state.tab === 'learn') openLesson(state.lesson, false);
      }
      renderList();
    });
  };
  initSheet();

  each(document.querySelectorAll('[data-tab]'), (b) => b.addEventListener('click', () => setTab(b.dataset.tab as Tab)));
  $('btn-menu').addEventListener('click', () => {
    if (state.tab !== 'learn') setTab('learn');
    document.body.classList.toggle('drawer-open');
  });
  $('scrim').addEventListener('click', () => document.body.classList.remove('drawer-open'));
  $('z-in').addEventListener('click', () => map.zoomBy(1 / 1.4));
  $('z-out').addEventListener('click', () => map.zoomBy(1.4));
  $('z-home').addEventListener('click', () => {
    const t = state.tab;
    if (t !== 'ref') map.flyTo(app.tabs[t].home());
  });

  // Южанам нужен южный маршрут уроков: обычно south.js уже загружен страницей, иначе подождём его.
  ensureCourse(start);

  // ?debug — доступ к приложению из консоли (для автотестов).
  if (/[?&]debug/.test(location.search)) (window as unknown as { __app: typeof app }).__app = app;
  // ?fps в адресе — показать время отрисовки кадра (для проверки на слабых телефонах).
  if (/[?&]fps/.test(location.search)) {
    const el = document.createElement('div');
    el.className = 'fps';
    document.body.appendChild(el);
    window.setInterval(() => {
      const q = map.quality;
      el.textContent = fill(T.ui.fps, { ms: map.drawMs.toFixed(1), dpr: q.dpr, mag: q.magOffset ? q.magOffset.toFixed(1) : '±0' });
    }, 500);
  }
}

function start() {
  shownCourse = course();
  syncLessonIndex();
  updateProgress();
  renderList();
  // Раздел из адреса (#lesson/UMa, #atlas…), а если его нет — тот, где остановились в прошлый раз.
  const saved: Route = state.tab === 'learn' ? { tab: 'learn', id: course()[state.lesson].id } : { tab: state.tab };
  applyRoute(startRouter(applyRoute) || saved, true);
  document.body.classList.add('ready');
  if (!state.done.intro && state.lesson === 0) hint(T.ui.firstHint, 5000);
}

// Открыть раздел по адресу: при запуске и при переходах «назад/вперёд».
function applyRoute(r: Route, first = false) {
  if (r.tab === 'learn') {
    const i = r.id ? lessonIndex(r.id) : -1;
    setTab('learn', first);
    openLesson(i >= 0 ? i : state.lesson, !first);
    return;
  }
  setTab(r.tab, first);
  if (r.tab === 'atlas' && r.id && app.sky.geo[r.id]) goCon(r.id);
}

function setTab(tab: Tab, first = false) {
  const prev = state.tab;
  state.tab = tab;
  save();
  document.body.className = document.body.className.replace(/\btab-\w+/g, '').trim() + ` tab-${tab}`;
  document.body.classList.remove('drawer-open');
  each(document.querySelectorAll('[data-tab]'), (b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('banner').className = 'banner';
  hint(null);
  // Адрес урока записывает сам урок (openLesson), атласа с созвездием — goCon.
  const cur = currentRoute();
  if (tab !== 'learn' && (!cur || cur.tab !== tab)) setRoute({ tab });
  if (tab === 'ref') { renderRef(); return; }
  showMap();
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
