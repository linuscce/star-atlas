import { visibility } from '../core/math';
import type { View } from '../core/types';
import { setOf } from '../core/util';
import { T, fill, fmtDec, fmtDeg, fmtMag, fmtNum, fmtRA } from '../i18n';
import type { MapClick } from '../map/skymap';
import { app, applyToggles } from '../ui/app';
import { course, lessonOfCon, lessonTitle } from '../ui/course';
import type { TabController } from '../ui/app';
import { each, escapeHtml } from '../ui/dom';
import { bindPlace, placeHtml } from '../ui/place';
import { setRoute } from '../ui/router';
import { state, toggles } from '../ui/state';
import { goLesson } from './learn';

let focusCon: string | null = null;
let selStar = -1;
let selDso: string | null = null;
let atlasView: View = { ra: 60, dec: 50, fov: 110 };
let index: { key: string; label: string; sub: string; go: () => void }[] | null = null;

// Цвет звезды по показателю B−V: границы — здесь, названия — в T.ui.colors.
const BV_EDGES = [-0.05, 0.25, 0.55, 0.85, 1.35];
function colorName(bv: number): string {
  let k = 0;
  while (k < BV_EDGES.length && bv >= BV_EDGES[k]) k++;
  return T.ui.colors[k];
}

export function visText(dec: number): string {
  const v = visibility(dec, state.lat);
  if (v.kind === 'never-sets') return fill(T.ui.visNeverSets, { h: fmtDeg(v.hmax) });
  if (v.kind === 'never-rises') return T.ui.visNeverRises;
  return fill(T.ui.visRises, { h: fmtDeg(v.hmax) });
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
  return i >= 0 ? `<button class="btn" data-lesson="${i}">${fill(T.ui.lessonBtn, { n: i + 1, title: lessonTitle(course()[i]) })}</button>` : '';
}

const atLat = () => fill(T.ui.atLat, { lat: fmtNum(state.lat, 1) });

function infoStar(i: number) {
  const sky = app.sky, ui = T.ui, name = sky.starName(i), con = sky.starCon(i) || sky.conAt(sky.ra[i], sky.dec[i]);
  return `<h2>${name || sky.starDesig(i)}</h2><div class="muted">${sky.starDesig(i)} · ${sky.starDesig(i, true)} · HIP ${sky.hip[i]}</div>` +
    '<table class="kv">' +
    row(ui.rowCon, conLink(con)) +
    row(ui.rowMag, fmtMag(sky.mag[i], 2)) +
    row(ui.rowColor, `${colorName(sky.bv[i])} <span class="muted">(B−V ${fmtNum(sky.bv[i], 2)})</span>`) +
    row(ui.rowRA, fmtRA(sky.ra[i])) +
    row(ui.rowDec, fmtDec(sky.dec[i])) +
    row(atLat(), visText(sky.dec[i])) +
    '</table>' + lessonBtn(con);
}

function infoPoint(ra: number, dec: number) {
  const sky = app.sky, ui = T.ui, con = sky.conAt(ra, dec);
  return `<h2>${con ? sky.conName(con) : ui.skyPoint}</h2>` +
    (con ? `<div class="muted"><i>${sky.conAlt(con)}</i>, ${ui.gen} <i>${sky.conLatinGen(con)}</i> · ${con}</div>` : '') +
    '<table class="kv">' + row(ui.pointRA, fmtRA(ra)) + row(ui.pointDec, fmtDec(dec)) + row(atLat(), visText(dec)) + '</table>' +
    lessonBtn(con);
}

function infoDso(id: string) {
  const d = app.sky.dsoById[id], con = app.sky.conAt(d.ra, d.dec);
  return `<h2>${d.label || d.id}</h2><div class="muted">${d.name}</div><table class="kv">` +
    row(T.ui.rowCon, conLink(con)) + row('α', fmtRA(d.ra)) + row('δ', fmtDec(d.dec)) +
    row(atLat(), visText(d.dec)) + '</table>' + lessonBtn(con);
}

function showInfo(html: string) {
  const el = app.panel.querySelector('#atlas-info') as HTMLElement | null;
  if (!el) return;
  el.innerHTML = `<button class="info-x" id="a-clear" aria-label="${T.ui.deselect}" title="${T.ui.deselect}">&times;</button>` + html;
  bindLinks(el);
  (el.querySelector('#a-clear') as HTMLElement).addEventListener('click', clearSelection);
}

// Снять выделение: повторный щелчок по тому же месту, кнопка × или Esc.
function clearSelection() {
  focusCon = null; selStar = -1; selDso = null;
  render();
  const el = app.panel.querySelector('#atlas-info') as HTMLElement | null;
  if (el) el.innerHTML = `<p class="muted">${T.ui.nothingSelected}</p>`;
  setRoute({ tab: 'atlas' }, true);
}

document.addEventListener('keydown', (e) => {
  if (e.keyCode === 27 && state.tab === 'atlas' && (focusCon || selStar >= 0 || selDso)) clearSelection();
});

function bindLinks(root: HTMLElement) {
  each(root.querySelectorAll('[data-con]'), (a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    goCon(a.dataset.con!);
  }));
  each(root.querySelectorAll('[data-lesson]'), (b) => b.addEventListener('click', () => goLesson(+b.dataset.lesson!)));
}

export function goCon(abbr: string) {
  // Сначала адрес: тогда setTab не добавит в историю лишний #atlas.
  setRoute({ tab: 'atlas', id: abbr });
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
    out.push({ key: norm(`${sky.conName(a)} ${sky.conLatin(a)} ${sky.conAlt(a)} ${a}`), label: sky.conName(a), sub: fill(T.ui.subCon, { alt: sky.conAlt(a) }), go: () => goCon(a) });
  }
  for (let i = 0; i < sky.n; i++) {
    const name = sky.starName(i);
    if (!name && sky.mag[i] > 3.5) continue;
    if (!name && !sky.starLetter(i)) continue;
    out.push({ key: norm(`${name} ${sky.starDesig(i)} ${sky.starDesig(i, true)}`), label: name || sky.starDesig(i), sub: fill(T.ui.subStar, { desig: sky.starDesig(i) }), go: () => goStar(i) });
  }
  for (const k of Object.keys(sky.dsoById)) {
    const d = sky.dsoById[k];
    out.push({ key: norm(`${d.id} ${d.label || ''} ${d.name}`), label: d.label || d.id, sub: d.name, go: () => goDso(k) });
  }
  return out;
}

function renderPanel() {
  const ui = T.ui, lg = ui.legend;
  let h = `<h1>${ui.atlasTitle}</h1><p class="muted">${ui.atlasIntro}</p>`;
  h += `<div class="search"><input id="a-q" type="search" placeholder="${ui.searchPlaceholder}" autocomplete="off"><div id="a-sugg" class="sugg"></div></div>`;
  h += placeHtml('a-lat');
  h += `<div id="atlas-info" class="info-card"><p class="muted">${ui.nothingSelected}</p></div>`;
  h += `<div class="legend"><div class="opt-title">${ui.legendTitle}</div>` +
    `<div><span class="lg lg-gal"></span>${lg.gal}</div><div><span class="lg lg-gc"></span>${lg.gc}</div>` +
    `<div><span class="lg lg-oc"></span>${lg.oc}</div><div><span class="lg lg-neb"></span>${lg.neb}</div>` +
    `<div><span class="lg lg-ecl"></span>${lg.ecl}</div></div>`;
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
      starts[+b.dataset.k!].go();
      sugg.innerHTML = '';
      input.value = '';
      input.blur();
    }));
  });
  input.addEventListener('keydown', (e) => {
    if (e.keyCode === 13) { const b = sugg.querySelector('button') as HTMLElement | null; if (b) b.click(); }
  });
  bindPlace(panel, 'a-lat', refreshInfo);
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
      if (c.star === selStar) { clearSelection(); return; }
      selStar = c.star; selDso = null; focusCon = app.sky.starCon(c.star) || app.sky.conAt(c.ra, c.dec);
      render();
      showInfo(infoStar(c.star));
    } else if (c.dso) {
      if (c.dso.id === selDso) { clearSelection(); return; }
      selDso = c.dso.id; selStar = -1; focusCon = app.sky.conAt(c.dso.ra, c.dso.dec);
      render();
      showInfo(infoDso(c.dso.id));
    } else {
      const con = app.sky.conAt(c.ra, c.dec);
      if (con && con === focusCon && selStar < 0 && !selDso) { clearSelection(); return; }
      selStar = -1; selDso = null; focusCon = con;
      render();
      showInfo(infoPoint(c.ra, c.dec));
    }
  },
  render,
  home: () => ({ ra: app.map.view.ra, dec: app.map.view.dec, fov: 110 }),
};

export function rememberAtlasView(v: View) { atlasView = { ra: v.ra, dec: v.dec, fov: v.fov }; }
