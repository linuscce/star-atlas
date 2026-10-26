import { app, applyToggles, each, save, setOf, state, toggles } from './app';
import type { TabController } from './app';
import { lessonOfCon, openLesson } from './learn';
import { LESSONS } from './lessons';
import { escapeHtml, fmtDec, fmtDeg, fmtMag, fmtNum, fmtRA, visibility } from './math';
import type { MapClick } from './skymap';
import type { View } from './types';

let focusCon: string | null = null;
let selStar = -1;
let selDso: string | null = null;
let atlasView: View = { ra: 60, dec: 50, fov: 110 };
let index: { key: string; label: string; sub: string; go: () => void }[] | null = null;

function colorName(bv: number): string {
  return bv < -0.05 ? 'голубая' : bv < 0.25 ? 'бело-голубая' : bv < 0.55 ? 'белая' : bv < 0.85 ? 'жёлтая'
    : bv < 1.35 ? 'оранжевая' : 'красно-оранжевая';
}

export function visText(dec: number): string {
  const v = visibility(dec, state.lat);
  if (v.kind === 'never-sets') return `не заходит, наибольшая высота ${fmtDeg(v.hmax)}`;
  if (v.kind === 'never-rises') return 'не восходит';
  return `восходит и заходит, наибольшая высота ${fmtDeg(v.hmax)}`;
}

function render() {
  const map = app.map;
  applyToggles('atlas');
  map.opt.lines = true;
  map.opt.months = toggles.atlas.ecliptic;
  map.opt.mwBoost = 1;
  map.lineStyle = (a) => (a === focusCon ? 'focus' : toggles.atlas.lines ? 'known' : 'hidden');
  map.conLabelFilter = null;
  map.labelStars = selStar >= 0 ? [selStar] : [];
  map.boundFocus = setOf(focusCon ? [focusCon] : []);
  map.pointers = [];
  map.dso = toggles.atlas.dso ? allDso() : [];
  map.marks = selStar >= 0 ? [{ ra: app.sky.ra[selStar], dec: app.sky.dec[selStar], kind: 'info' }]
    : selDso ? [{ ra: app.sky.dsoById[selDso].ra, dec: app.sky.dsoById[selDso].dec, kind: 'info' }] : [];
  map.redraw();
}

function allDso() {
  const sky = app.sky;
  return Object.keys(sky.dsoById).map((k) => sky.dsoById[k]).filter((d) => d.type !== 'pt');
}

function row(k: string, v: string) { return `<tr><th>${k}</th><td>${v}</td></tr>`; }

function conLink(abbr: string | null) {
  if (!abbr) return '—';
  return `<a href="#" data-con="${abbr}">${app.sky.conName(abbr)}</a> <span class="muted">(${abbr})</span>`;
}

function lessonBtn(abbr: string | null) {
  if (!abbr) return '';
  const i = lessonOfCon(abbr);
  return i >= 0 ? `<button class="btn" data-lesson="${i}">Урок ${i + 1}: ${LESSONS[i].title || app.sky.conName(abbr)}</button>` : '';
}

function infoStar(i: number) {
  const sky = app.sky, name = sky.starName(i), con = sky.starCon(i) || sky.conAt(sky.ra[i], sky.dec[i]);
  return `<h2>${name || sky.starDesig(i)}</h2><div class="muted">${sky.starDesig(i)} · ${sky.starDesig(i, true)} · HIP ${sky.hip[i]}</div>` +
    '<table class="kv">' +
    row('Созвездие', conLink(con)) +
    row('Блеск', fmtMag(sky.mag[i], 2)) +
    row('Цвет', `${colorName(sky.bv[i])} <span class="muted">(B−V ${fmtNum(sky.bv[i], 2)})</span>`) +
    row('Прямое восхождение α', fmtRA(sky.ra[i])) +
    row('Склонение δ', fmtDec(sky.dec[i])) +
    row(`На широте ${fmtNum(state.lat, 1)}°`, visText(sky.dec[i])) +
    '</table>' + lessonBtn(con);
}

function infoPoint(ra: number, dec: number) {
  const con = app.sky.conAt(ra, dec);
  return `<h2>${con ? app.sky.conName(con) : 'Точка неба'}</h2>` +
    (con ? `<div class="muted"><i>${app.sky.conLatin(con)}</i>, род. п. <i>${app.sky.conLatinGen(con)}</i> · ${con}</div>` : '') +
    '<table class="kv">' + row('α точки', fmtRA(ra)) + row('δ точки', fmtDec(dec)) + row(`На широте ${fmtNum(state.lat, 1)}°`, visText(dec)) + '</table>' +
    lessonBtn(con);
}

function infoDso(id: string) {
  const d = app.sky.dsoById[id], con = app.sky.conAt(d.ra, d.dec);
  return `<h2>${d.label || d.id}</h2><div class="muted">${d.name}</div><table class="kv">` +
    row('Созвездие', conLink(con)) + row('α', fmtRA(d.ra)) + row('δ', fmtDec(d.dec)) +
    row(`На широте ${fmtNum(state.lat, 1)}°`, visText(d.dec)) + '</table>' + lessonBtn(con);
}

function showInfo(html: string) {
  const el = app.panel.querySelector('#atlas-info') as HTMLElement | null;
  if (!el) return;
  el.innerHTML = html;
  bindLinks(el);
}

function bindLinks(root: HTMLElement) {
  each(root.querySelectorAll('[data-con]'), (a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    goCon((a as HTMLElement).dataset.con!);
  }));
  each(root.querySelectorAll('[data-lesson]'), (b) => b.addEventListener('click', () => {
    app.setTab('learn');
    openLesson(+(b as HTMLElement).dataset.lesson!);
  }));
}

export function goCon(abbr: string) {
  if (state.tab !== 'atlas') app.setTab('atlas');
  const g = app.sky.geo[abbr].fig;
  focusCon = abbr; selStar = -1; selDso = null;
  render();
  app.map.flyTo({ ra: g.ra, dec: g.dec, fov: Math.max(35, Math.min(150, g.r * 2.6)) });
  showInfo(infoPoint(g.ra, g.dec).replace(/<table[\s\S]*?<\/table>/, ''));
}

function goStar(i: number) {
  focusCon = app.sky.starCon(i); selStar = i; selDso = null;
  render();
  app.map.flyTo({ ra: app.sky.ra[i], dec: app.sky.dec[i], fov: Math.min(app.map.view.fov, 60) });
  showInfo(infoStar(i));
}

function goDso(id: string) {
  const d = app.sky.dsoById[id];
  focusCon = app.sky.conAt(d.ra, d.dec); selStar = -1; selDso = id;
  render();
  app.map.flyTo({ ra: d.ra, dec: d.dec, fov: Math.min(app.map.view.fov, 50) });
  showInfo(infoDso(id));
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[\s\-]+/g, ' ').trim();

function buildIndex() {
  const sky = app.sky, out: { key: string; label: string; sub: string; go: () => void }[] = [];
  for (const a of sky.cons) {
    out.push({ key: norm(`${sky.conName(a)} ${sky.conLatin(a)} ${a}`), label: sky.conName(a), sub: `созвездие · ${sky.conLatin(a)}`, go: () => goCon(a) });
  }
  for (let i = 0; i < sky.n; i++) {
    const name = sky.starName(i);
    if (!name && sky.mag[i] > 3.5) continue;
    if (!name && !sky.starLetter(i)) continue;
    out.push({ key: norm(`${name} ${sky.starDesig(i)} ${sky.starDesig(i, true)}`), label: name || sky.starDesig(i), sub: `звезда · ${sky.starDesig(i)}`, go: () => goStar(i) });
  }
  for (const k of Object.keys(sky.dsoById)) {
    const d = sky.dsoById[k];
    out.push({ key: norm(`${d.id} ${d.label || ''} ${d.name}`), label: d.label || d.id, sub: d.name, go: () => goDso(k) });
  }
  return out;
}

function renderPanel() {
  let h = '<h1>Атлас</h1><p class="muted">Всё небо. Нажми на звезду, объект или пустое место — увидишь название, созвездие и координаты.</p>';
  h += '<div class="search"><input id="a-q" type="search" placeholder="Найти: Вега, Орион, α Lyr, M31…" autocomplete="off"><div id="a-sugg" class="sugg"></div></div>';
  h += `<label class="lat">Моя широта <input id="a-lat" type="number" step="0.1" min="-90" max="90" value="${state.lat}"> ° <span class="muted">Москва 55,8 · Петербург 59,9 · Сочи 43,6</span></label>`;
  h += '<div id="atlas-info" class="info-card"><p class="muted">Ничего не выбрано.</p></div>';
  h += '<div class="legend"><div class="opt-title">Обозначения</div>' +
    '<div><span class="lg lg-gal"></span>галактика</div><div><span class="lg lg-gc"></span>шаровое скопление</div>' +
    '<div><span class="lg lg-oc"></span>рассеянное скопление</div><div><span class="lg lg-neb"></span>туманность</div>' +
    '<div><span class="lg lg-ecl"></span>эклиптика (точки — Солнце 1-го числа месяца)</div></div>';
  const panel = app.panel;
  panel.innerHTML = h;
  const input = panel.querySelector('#a-q') as HTMLInputElement, sugg = panel.querySelector('#a-sugg') as HTMLElement;
  input.addEventListener('input', () => {
    const qv = norm(input.value);
    if (qv.length < 1) { sugg.innerHTML = ''; return; }
    if (!index) index = buildIndex();
    const starts = index.filter((x) => x.key.indexOf(qv) === 0 || x.key.indexOf(' ' + qv) >= 0).slice(0, 8);
    sugg.innerHTML = starts.map((x, k) => `<button data-k="${k}"><b>${escapeHtml(x.label)}</b><span>${escapeHtml(x.sub)}</span></button>`).join('');
    each(sugg.querySelectorAll('button'), (b) => b.addEventListener('click', () => {
      starts[+(b as HTMLElement).dataset.k!].go();
      sugg.innerHTML = '';
      input.value = '';
      input.blur();
    }));
  });
  input.addEventListener('keydown', (e) => {
    if (e.keyCode === 13) { const b = sugg.querySelector('button') as HTMLElement | null; if (b) b.click(); }
  });
  const lat = panel.querySelector('#a-lat') as HTMLInputElement;
  lat.addEventListener('change', () => {
    const v = parseFloat(lat.value.replace(',', '.'));
    if (!isNaN(v) && v >= -90 && v <= 90) { state.lat = v; save(); refreshInfo(); }
  });
  refreshInfo();
}

function refreshInfo() {
  if (selStar >= 0) showInfo(infoStar(selStar));
  else if (selDso) showInfo(infoDso(selDso));
}

export const atlasTab: TabController = {
  enter() {
    render();
    app.map.setView(atlasView);
    renderPanel();
  },
  click(c: MapClick) {
    if (c.star >= 0) {
      selStar = c.star; selDso = null; focusCon = app.sky.starCon(c.star) || app.sky.conAt(c.ra, c.dec);
      render();
      showInfo(infoStar(c.star));
    } else if (c.dso) {
      selDso = c.dso.id; selStar = -1; focusCon = app.sky.conAt(c.dso.ra, c.dso.dec);
      render();
      showInfo(infoDso(c.dso.id));
    } else {
      selStar = -1; selDso = null; focusCon = app.sky.conAt(c.ra, c.dec);
      render();
      showInfo(infoPoint(c.ra, c.dec));
    }
  },
  render,
  home: () => ({ ra: app.map.view.ra, dec: app.map.view.dec, fov: 110 }),
};

export function rememberAtlasView(v: View) { atlasView = { ra: v.ra, dec: v.dec, fov: v.fov }; }
