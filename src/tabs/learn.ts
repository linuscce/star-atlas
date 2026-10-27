import type { Lesson, RaDec, View } from '../core/types';
import { setOf } from '../core/util';
import { T, fill, fmtDeg, fmtMag, fmtNum } from '../i18n';
import type { MapClick, Pointer } from '../map/skymap';
import { app, applyToggles, panelToTop, starShortInfo, starTitle } from '../ui/app';
import { blockTitle, course, courseBlocks, lessonText, lessonTitle } from '../ui/course';
import type { TabController } from '../ui/app';
import { $, each } from '../ui/dom';
import { banner, hint, pulse } from '../ui/overlay';
import { currentRoute, setRoute } from '../ui/router';
import { showMap } from '../ui/sheet';
import { save, state, toggles } from '../ui/state';
import { zodiacTableHtml } from './ref';

type Task = { kind: 'star'; idx: number } | { kind: 'con'; abbr: string };
let check: { tasks: Task[]; i: number; ok: number; busy: boolean } | null = null;

const keyStars = (L: Lesson) => (L.stars || []).map((k) => app.sky.starIndex(k)).filter((i) => i >= 0);

function knownCons(upTo: number): Record<string, true> {
  const s: Record<string, true> = {};
  const c = course();
  for (let i = 0; i < upTo; i++) for (const a of c[i].cons) s[a] = true;
  return s;
}

function focusCons(L: Lesson): Record<string, true> {
  const s: Record<string, true> = {};
  for (const c of L.cons.concat(L.focusLines || [])) s[c] = true;
  return s;
}

export function resolvePointers(L: Lesson): Pointer[] {
  const sky = app.sky, out: Pointer[] = [], labels = lessonText(L).labels || [];
  (L.pointers || []).forEach((p, k) => {
    const refs = p.line || p.path || p.poly || [];
    const pts = refs.map((r) => sky.point(r)).filter((x): x is RaDec => !!x);
    if (pts.length !== refs.length) return;
    out.push({ kind: p.line ? 'line' : p.path ? 'path' : 'poly', pts, label: labels[k] });
  });
  return out;
}

// На узком экране телефона даём чуть больше обзора, чтобы подписи не упирались в края.
function roomy(v: View): View {
  return window.innerWidth < 700 ? { ra: v.ra, dec: v.dec, fov: Math.min(215, v.fov * 1.15) } : v;
}

export function lessonView(L: Lesson): View {
  return roomy(baseLessonView(L));
}

function baseLessonView(L: Lesson): View {
  if (L.view) return L.view;
  const sky = app.sky, pts: RaDec[] = [];
  for (const abbr of L.cons) {
    for (const l of sky.raw.lines[abbr] || []) for (let i = 0; i < l.length; i += 2) pts.push({ ra: l[i], dec: l[i + 1] });
  }
  for (const p of resolvePointers(L)) for (const q of p.pts) pts.push(q);
  return sky.fit(pts, 30, 150);
}

function render() {
  const map = app.map, L = course()[state.lesson];
  const known = knownCons(state.lesson), focus = focusCons(L), t = toggles.learn;
  const hideFocus = !!check;
  applyToggles('learn');
  map.opt.lines = true;
  map.opt.months = !!(L.opts && L.opts.months);
  map.opt.mwBoost = (L.opts && L.opts.mwBoost) || 1;
  map.lineStyle = (a) => focus[a] ? (hideFocus ? (t.lines ? 'faint' : 'hidden') : 'focus')
    : known[a] ? 'known' : t.lines ? 'faint' : 'hidden';
  map.conLabelFilter = (a) => (!!focus[a] && !hideFocus) || !!known[a] || t.lines;
  // Подписываем и главные звёзды урока, и звёзды, от которых идут указатели (каждую — один раз).
  const labelStars = keyStars(L);
  for (const p of L.pointers || []) for (const r of p.line || p.path || p.poly || []) {
    if (typeof r === 'string') { const k = app.sky.starIndex(r); if (k >= 0 && labelStars.indexOf(k) < 0) labelStars.push(k); }
  }
  map.labelStars = hideFocus ? [] : labelStars;
  map.boundFocus = setOf(hideFocus || L.theory ? [] : L.cons);
  map.pointers = hideFocus ? [] : resolvePointers(L);
  map.dso = t.dso ? (L.dso || []).map((id) => app.sky.dsoById[id]).filter((d) => !!d) : [];
  if (hideFocus) map.opt.starLabels = false;
  map.redraw();
}

export function openLesson(i: number, fly = true) {
  check = null;
  banner(null);
  const c = course();
  state.lesson = Math.max(0, Math.min(c.length - 1, i));
  const L = c[state.lesson];
  state.lessonId = L.id;
  save();
  setRoute({ tab: 'learn', id: L.id });
  toggles.learn.grid = !!(L.opts && L.opts.grid);
  toggles.learn.ecliptic = !!(L.opts && L.opts.ecliptic);
  render();
  if (fly) app.map.flyTo(lessonView(L)); else app.map.setView(lessonView(L));
  renderPanel();
  renderList();
  document.body.classList.remove('drawer-open');
}

// Открыть урок с любой вкладки. Адрес — сначала, чтобы в истории не появился лишний шаг.
export function goLesson(i: number) {
  const c = course(), L = c[Math.max(0, Math.min(c.length - 1, i))];
  setRoute({ tab: 'learn', id: L.id });
  if (state.tab !== 'learn') app.setTab('learn');
  openLesson(i);
}

// Видно ли созвездия урока с широты пользователя (по центру фигуры): не видно или только низко — предупреждаем.
function visibilityNote(L: Lesson): string {
  if (!L.cons.length) return '';
  let best = -90;
  for (const c of L.cons) best = Math.max(best, 90 - Math.abs(state.lat - app.sky.geo[c].fig.dec));
  const lat = fmtNum(state.lat, 1);
  if (best < 0) return `<div class="vis-note">${fill(T.ui.notVisible, { lat })}</div>`;
  if (best < 15) return `<div class="vis-note">${fill(T.ui.lowVisible, { lat, h: fmtDeg(best) })}</div>`;
  return '';
}

function sectionHtml(title: string, body?: string) {
  return body ? `<section><h3>${title}</h3><p>${body}</p></section>` : '';
}

function renderPanel() {
  const sky = app.sky, ui = T.ui, c = course(), i = state.lesson, L = c[i], text = lessonText(L);
  let h = `<div class="crumb">${fill(ui.lessonCrumb, { n: i + 1, total: c.length, block: blockTitle(L.block) })}</div><h1>${lessonTitle(L)}</h1>`;
  if (L.cons.length) {
    h += '<div class="con-names">' + L.cons.map((a) =>
      `<div><b>${sky.conName(a)}</b> · <i>${sky.conAlt(a)}</i>, ${ui.gen} <i>${sky.conLatinGen(a)}</i> · <span class="abbr">${a}</span></div>`).join('') + '</div>';
  }
  h += visibilityNote(L);
  if (state.done[L.id]) h += `<div class="done-badge">✓ ${ui.done}${state.done[L.id] !== 'ok' ? ` · ${state.done[L.id]}` : ''}</div>`;
  if (L.theory) {
    h += `<div class="prose">${text.html || ''}</div>`;
  } else {
    h += sectionHtml(ui.find, text.find) + sectionHtml(ui.look, text.look);
    const stars = keyStars(L);
    if (stars.length) {
      h += `<section><h3>${ui.keyStars}</h3><ul class="rows">` + stars.map((s) =>
        `<li data-star="${s}"><span class="r-name">${sky.curatedName(s) || sky.starLetter(s)}</span><span class="r-sub">${sky.starDesig(s)}</span><span class="r-mag">${fmtMag(sky.mag[s], 1)}</span></li>`).join('') + '</ul></section>';
    }
    const dso = (L.dso || []).map((id) => sky.dsoById[id]).filter((d) => !!d);
    if (dso.length) {
      h += `<section><h3>${ui.objects}</h3><ul class="rows">` + dso.map((d) =>
        `<li data-dso="${d.id}"><span class="r-name">${d.label || d.id}</span><span class="r-sub">${d.name}</span></li>`).join('') + '</ul></section>';
    }
    if (text.facts && text.facts.length) h += `<section><h3>${ui.facts}</h3><ul class="facts">` + text.facts.map((f) => `<li>${f}</li>`).join('') + '</ul></section>';
  }
  h += '<div class="actions">';
  h += L.theory ? `<button class="btn primary" id="l-done">${ui.gotIt}</button>` : `<button class="btn primary" id="l-check">${ui.check}</button>`;
  h += '<div class="nav-row">';
  h += `<button class="btn" id="l-prev" ${i === 0 ? 'disabled' : ''}>${ui.prev}</button>`;
  h += `<button class="btn" id="l-next" ${i === c.length - 1 ? 'disabled' : ''}>${ui.next}</button>`;
  h += '</div></div>';

  const panel = app.panel;
  panel.innerHTML = h;
  panelToTop();
  const zt = panel.querySelector('#zodiac-table');
  if (zt) zt.innerHTML = zodiacTableHtml();
  const btn = (id: string, fn: () => void) => { const b = panel.querySelector('#' + id); if (b) b.addEventListener('click', fn); };
  btn('l-prev', () => openLesson(state.lesson - 1));
  btn('l-next', () => openLesson(state.lesson + 1));
  btn('l-check', startCheck);
  btn('l-done', () => { state.done[L.id] = 'ok'; save(); app.updateProgress(); renderList(); renderPanel(); });
  each(panel.querySelectorAll('[data-star]'), (el) => el.addEventListener('click', () => {
    const s = +el.dataset.star!;
    pulse(sky.ra[s], sky.dec[s]);
    hint(starShortInfo(s));
  }));
  each(panel.querySelectorAll('[data-dso]'), (el) => el.addEventListener('click', () => {
    const d = sky.dsoById[el.dataset.dso!];
    pulse(d.ra, d.dec);
    hint(`<b>${d.label || d.id}</b> · ${d.name}`);
  }));
}

export function renderList() {
  const el = $('lessons');
  let h = '';
  for (const b of courseBlocks()) {
    h += `<div class="blk">${blockTitle(b)}</div>`;
    course().forEach((L, i) => {
      if (L.block !== b) return;
      const d = state.done[L.id];
      let mark = '';
      if (d) {
        const m = /^(\d+)\/(\d+)$/.exec(d);
        mark = m && +m[1] / +m[2] < 0.7 ? '<span class="st half">✓</span>' : '<span class="st">✓</span>';
      }
      h += `<button class="li${i === state.lesson ? ' cur' : ''}${d ? ' done' : ''}" data-i="${i}"><span class="n">${i + 1}</span><span class="t">${lessonTitle(L)}</span>${mark}</button>`;
    });
  }
  el.innerHTML = h;
  each(el.querySelectorAll('.li'), (b) => b.addEventListener('click', () => goLesson(+b.dataset.i!)));
  // Прокрутить к текущему уроку — в начале кадра, когда браузер всё равно считает раскладку (см. panelToTop).
  if (!listScrollQueued) {
    listScrollQueued = true;
    requestAnimationFrame(() => {
      listScrollQueued = false;
      const cur = el.querySelector('.cur') as HTMLElement | null;
      if (cur && (cur.offsetTop < el.scrollTop || cur.offsetTop > el.scrollTop + el.clientHeight - 40)) {
        el.scrollTop = cur.offsetTop - el.clientHeight / 3;
      }
    });
  }
}
let listScrollQueued = false;

// ---------- «Проверь себя» ----------

function startCheck() {
  const sky = app.sky, ui = T.ui, L = course()[state.lesson];
  const stars = keyStars(L).filter((i) => sky.mag[i] <= 4.6).slice(0, 4);
  const tasks: Task[] = stars.map((idx) => ({ kind: 'star' as const, idx }));
  if (L.cons.length > 1 || stars.length < 3) for (const abbr of L.cons) tasks.push({ kind: 'con', abbr });
  check = { tasks, i: 0, ok: 0, busy: false };
  hint(null);
  showMap();
  render();
  const v = lessonView(L);
  app.map.flyTo({ ra: v.ra, dec: v.dec, fov: Math.min(170, v.fov * 1.15) });
  app.panel.innerHTML = `<div class="crumb">${ui.check}</div><h1>${ui.checkTitle}</h1>` +
    `<p class="muted">${ui.checkIntro}</p>` +
    `<div id="check-list" class="check-list"></div><div class="actions"><button class="btn" id="c-stop">${ui.checkStop}</button></div>`;
  (app.panel.querySelector('#c-stop') as HTMLElement).addEventListener('click', () => { check = null; banner(null); render(); renderPanel(); });
  showTask();
}

function taskTitle(t: Task) {
  return t.kind === 'star' ? starTitle(t.idx) : fill(T.ui.taskCon, { con: app.sky.conName(t.abbr) });
}

function showTask() {
  if (!check) return;
  const t = check.tasks[check.i];
  banner(`${fill(T.ui.taskFind, { what: taskTitle(t) })} <span class="cnt">${check.i + 1} / ${check.tasks.length}</span>`);
  const list = app.panel.querySelector('#check-list');
  if (list) {
    list.innerHTML = check.tasks.map((x, k) =>
      `<div class="ci${k === check!.i ? ' cur' : ''}">${k + 1}. ${k <= check!.i ? taskTitle(x) : '…'}</div>`).join('');
  }
}

function checkClick(c: MapClick) {
  if (!check || check.busy) return;
  const sky = app.sky, ui = T.ui, map = app.map, t = check.tasks[check.i];
  let ok: boolean;
  if (t.kind === 'star') {
    const s = map.screenOfStar(t.idx);
    ok = c.star === t.idx || (!!s && Math.abs(s[0] - c.x) + Math.abs(s[1] - c.y) < (c.touch ? 30 : 20));
    map.marks = [{ ra: sky.ra[t.idx], dec: sky.dec[t.idx], kind: 'good', label: ok ? ui.right : starTitle(t.idx) }];
    if (!ok) map.marks.push({ ra: c.ra, dec: c.dec, kind: 'bad' });
  } else {
    const got = sky.conAt(c.ra, c.dec);
    ok = got === t.abbr;
    map.boundFocus = setOf([t.abbr]);
    map.marks = [{ ra: c.ra, dec: c.dec, kind: ok ? 'good' : 'bad', label: ok ? ui.right : got ? fill(ui.itIs, { con: sky.conName(got) }) : undefined }];
  }
  if (ok) check.ok++;
  check.busy = true;
  banner(ok ? ui.right : ui.checkWrong, ok ? 'good' : 'bad');
  map.redraw();
  window.setTimeout(() => {
    if (!check) return;
    map.marks = [];
    map.boundFocus = {};
    check.busy = false;
    check.i++;
    if (check.i < check.tasks.length) { showTask(); map.redraw(); return; }
    const L = course()[state.lesson], score = `${check.ok}/${check.tasks.length}`;
    state.done[L.id] = score;
    save();
    const good = check.ok / check.tasks.length >= 0.7;
    check = null;
    banner(fill(good ? ui.checkPassed : ui.checkFailed, { score }), good ? 'good' : 'bad');
    window.setTimeout(() => banner(null), 3000);
    app.updateProgress();
    render();
    renderPanel();
    renderList();
  }, ok ? 800 : 1800);
}

export const learnTab: TabController = {
  enter() {
    const cur = currentRoute();
    if (!cur || cur.tab !== 'learn') setRoute({ tab: 'learn', id: course()[state.lesson].id });
    render();
    app.map.setView(lessonView(course()[state.lesson]));
    renderPanel();
    renderList();
  },
  click(c) {
    if (check) { checkClick(c); return; }
    const sky = app.sky;
    if (c.star >= 0) { hint(starShortInfo(c.star)); return; }
    if (c.dso) { hint(`<b>${c.dso.label || c.dso.id}</b> · ${c.dso.name}`); return; }
    const con = sky.conAt(c.ra, c.dec);
    if (con) hint(fill(T.ui.hereCon, { con: sky.conName(con) }), 2500);
  },
  render,
  home: () => lessonView(course()[state.lesson]),
};
