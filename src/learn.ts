import { $, app, applyToggles, banner, each, hint, pulse, save, setOf, starShortInfo, starTitle, state, toggles } from './app';
import type { TabController } from './app';
import { BLOCKS, LESSONS } from './lessons';
import { fmtMag } from './math';
import { zodiacTableHtml } from './ref';
import type { MapClick, Pointer } from './skymap';
import type { Lesson, RaDec, View } from './types';

type Task = { kind: 'star'; idx: number } | { kind: 'con'; abbr: string };
let check: { tasks: Task[]; i: number; ok: number; busy: boolean } | null = null;

const keyStars = (L: Lesson) => (L.stars || []).map((k) => app.sky.starIndex(k)).filter((i) => i >= 0);

function knownCons(upTo: number): Record<string, true> {
  const s: Record<string, true> = {};
  for (let i = 0; i < upTo; i++) for (const c of LESSONS[i].cons) s[c] = true;
  return s;
}

function focusCons(L: Lesson): Record<string, true> {
  const s: Record<string, true> = {};
  for (const c of L.cons.concat(L.focusLines || [])) s[c] = true;
  return s;
}

export function resolvePointers(L: Lesson): Pointer[] {
  const sky = app.sky, out: Pointer[] = [];
  for (const p of L.pointers || []) {
    const refs = p.line || p.path || p.poly || [];
    const pts = refs.map((r) => sky.point(r)).filter((x): x is RaDec => !!x);
    if (pts.length !== refs.length) continue;
    out.push({ kind: p.line ? 'line' : p.path ? 'path' : 'poly', pts, label: p.label });
  }
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

export function lessonOfCon(abbr: string): number {
  for (let i = 0; i < LESSONS.length; i++) if (LESSONS[i].cons.indexOf(abbr) >= 0) return i;
  return -1;
}

function render() {
  const map = app.map, L = LESSONS[state.lesson];
  const known = knownCons(state.lesson), focus = focusCons(L), t = toggles.learn;
  const hideFocus = !!check;
  applyToggles('learn');
  map.opt.lines = true;
  map.opt.months = !!(L.opts && L.opts.months);
  map.opt.mwBoost = (L.opts && L.opts.mwBoost) || 1;
  map.lineStyle = (a) => focus[a] ? (hideFocus ? (t.lines ? 'faint' : 'hidden') : 'focus')
    : known[a] ? 'known' : t.lines ? 'faint' : 'hidden';
  map.conLabelFilter = (a) => (!!focus[a] && !hideFocus) || !!known[a] || t.lines;
  // Подписываем и главные звёзды урока, и звёзды, от которых идут указатели.
  const ptrStars: number[] = [];
  for (const p of L.pointers || []) for (const r of p.line || p.path || p.poly || []) {
    if (typeof r === 'string') { const k = app.sky.starIndex(r); if (k >= 0) ptrStars.push(k); }
  }
  map.labelStars = hideFocus ? [] : keyStars(L).concat(ptrStars);
  map.boundFocus = setOf(hideFocus || L.theory ? [] : L.cons);
  map.pointers = hideFocus ? [] : resolvePointers(L);
  map.dso = t.dso ? (L.dso || []).map((id) => app.sky.dsoById[id]).filter((d) => !!d) : [];
  if (hideFocus) map.opt.starLabels = false;
  map.redraw();
}

export function openLesson(i: number, fly = true) {
  check = null;
  banner(null);
  state.lesson = Math.max(0, Math.min(LESSONS.length - 1, i));
  save();
  const L = LESSONS[state.lesson];
  toggles.learn.grid = !!(L.opts && L.opts.grid);
  toggles.learn.ecliptic = !!(L.opts && L.opts.ecliptic);
  render();
  if (fly) app.map.flyTo(lessonView(L)); else app.map.setView(lessonView(L));
  renderPanel();
  renderList();
  document.body.classList.remove('drawer-open');
}

function sectionHtml(title: string, body?: string) {
  return body ? `<section><h3>${title}</h3><p>${body}</p></section>` : '';
}

function renderPanel() {
  const sky = app.sky, i = state.lesson, L = LESSONS[i];
  const block = BLOCKS.filter((b) => b.id === L.block)[0];
  const title = L.title || sky.conName(L.cons[0]);
  let h = `<div class="crumb">Урок ${i + 1} из ${LESSONS.length} · ${block ? block.title : ''}</div><h1>${title}</h1>`;
  if (L.cons.length) {
    h += '<div class="con-names">' + L.cons.map((a) =>
      `<div><b>${sky.conName(a)}</b> · <i>${sky.conLatin(a)}</i>, род. п. <i>${sky.conLatinGen(a)}</i> · <span class="abbr">${a}</span></div>`).join('') + '</div>';
  }
  if (state.done[L.id]) h += `<div class="done-badge">✓ Пройдено${state.done[L.id] !== 'ok' ? ` · ${state.done[L.id]}` : ''}</div>`;
  if (L.theory) {
    h += `<div class="prose">${L.html || ''}</div>`;
  } else {
    h += sectionHtml('Как найти', L.find) + sectionHtml('Как выглядит', L.look);
    const stars = keyStars(L);
    if (stars.length) {
      h += '<section><h3>Главные звёзды</h3><ul class="rows">' + stars.map((s) =>
        `<li data-star="${s}"><span class="r-name">${sky.curatedName(s) || sky.starLetter(s)}</span><span class="r-sub">${sky.starDesig(s)}</span><span class="r-mag">${fmtMag(sky.mag[s], 1)}</span></li>`).join('') + '</ul></section>';
    }
    const dso = (L.dso || []).map((id) => sky.dsoById[id]).filter((d) => !!d);
    if (dso.length) {
      h += '<section><h3>Интересные объекты</h3><ul class="rows">' + dso.map((d) =>
        `<li data-dso="${d.id}"><span class="r-name">${d.label || d.id}</span><span class="r-sub">${d.name}</span></li>`).join('') + '</ul></section>';
    }
    if (L.facts && L.facts.length) h += '<section><h3>Полезно знать</h3><ul class="facts">' + L.facts.map((f) => `<li>${f}</li>`).join('') + '</ul></section>';
  }
  h += '<div class="actions">';
  h += L.theory ? '<button class="btn primary" id="l-done">Понятно ✓</button>' : '<button class="btn primary" id="l-check">Проверь себя</button>';
  h += '<div class="nav-row">';
  h += `<button class="btn" id="l-prev" ${i === 0 ? 'disabled' : ''}>← Назад</button>`;
  h += `<button class="btn" id="l-next" ${i === LESSONS.length - 1 ? 'disabled' : ''}>Дальше →</button>`;
  h += '</div></div>';

  const panel = app.panel;
  panel.innerHTML = h;
  panel.scrollTop = 0;
  const zt = panel.querySelector('#zodiac-table');
  if (zt) zt.innerHTML = zodiacTableHtml();
  const btn = (id: string, fn: () => void) => { const b = panel.querySelector('#' + id); if (b) b.addEventListener('click', fn); };
  btn('l-prev', () => openLesson(state.lesson - 1));
  btn('l-next', () => openLesson(state.lesson + 1));
  btn('l-check', startCheck);
  btn('l-done', () => { state.done[L.id] = 'ok'; save(); app.updateProgress(); renderList(); renderPanel(); });
  each(panel.querySelectorAll('[data-star]'), (el) => el.addEventListener('click', () => {
    const s = +(el as HTMLElement).dataset.star!;
    pulse(sky.ra[s], sky.dec[s]);
    hint(starShortInfo(s));
  }));
  each(panel.querySelectorAll('[data-dso]'), (el) => el.addEventListener('click', () => {
    const d = sky.dsoById[(el as HTMLElement).dataset.dso!];
    pulse(d.ra, d.dec);
    hint(`<b>${d.label || d.id}</b> · ${d.name}`);
  }));
}

export function renderList() {
  const el = $('lessons');
  let h = '';
  for (const b of BLOCKS) {
    h += `<div class="blk">${b.title}</div>`;
    LESSONS.forEach((L, i) => {
      if (L.block !== b.id) return;
      const d = state.done[L.id];
      let mark = '';
      if (d) {
        const m = /^(\d+)\/(\d+)$/.exec(d);
        mark = m && +m[1] / +m[2] < 0.7 ? '<span class="st half">✓</span>' : '<span class="st">✓</span>';
      }
      h += `<button class="li${i === state.lesson ? ' cur' : ''}${d ? ' done' : ''}" data-i="${i}"><span class="n">${i + 1}</span><span class="t">${L.title || app.sky.conName(L.cons[0])}</span>${mark}</button>`;
    });
  }
  el.innerHTML = h;
  each(el.querySelectorAll('.li'), (b) => b.addEventListener('click', () => {
    if (state.tab !== 'learn') app.setTab('learn');
    openLesson(+(b as HTMLElement).dataset.i!);
  }));
  const cur = el.querySelector('.cur') as HTMLElement | null;
  if (cur && (cur.offsetTop < el.scrollTop || cur.offsetTop > el.scrollTop + el.clientHeight - 40)) {
    el.scrollTop = cur.offsetTop - el.clientHeight / 3;
  }
}

// ---------- «Проверь себя» ----------

function startCheck() {
  const sky = app.sky, L = LESSONS[state.lesson];
  const stars = keyStars(L).filter((i) => sky.mag[i] <= 4.6).slice(0, 4);
  const tasks: Task[] = stars.map((idx) => ({ kind: 'star' as const, idx }));
  if (L.cons.length > 1 || stars.length < 3) for (const abbr of L.cons) tasks.push({ kind: 'con', abbr });
  check = { tasks, i: 0, ok: 0, busy: false };
  hint(null);
  render();
  const v = lessonView(L);
  app.map.flyTo({ ra: v.ra, dec: v.dec, fov: Math.min(170, v.fov * 1.15) });
  app.panel.innerHTML = '<div class="crumb">Проверь себя</div><h1>Найди на карте</h1>' +
    '<p class="muted">Линии и подписи нового созвездия спрятаны. Нажимай на карте туда, где, по-твоему, находится нужная звезда или созвездие. Карту можно двигать и приближать.</p>' +
    '<div id="check-list" class="check-list"></div><div class="actions"><button class="btn" id="c-stop">Прервать</button></div>';
  (app.panel.querySelector('#c-stop') as HTMLElement).addEventListener('click', () => { check = null; banner(null); render(); renderPanel(); });
  showTask();
}

function taskTitle(t: Task) {
  return t.kind === 'star' ? starTitle(t.idx) : `созвездие ${app.sky.conName(t.abbr)}`;
}

function showTask() {
  if (!check) return;
  const t = check.tasks[check.i];
  banner(`Найди: <b>${taskTitle(t)}</b> <span class="cnt">${check.i + 1} / ${check.tasks.length}</span>`);
  const list = app.panel.querySelector('#check-list');
  if (list) {
    list.innerHTML = check.tasks.map((x, k) =>
      `<div class="ci${k === check!.i ? ' cur' : ''}">${k + 1}. ${k <= check!.i ? taskTitle(x) : '…'}</div>`).join('');
  }
}

function checkClick(c: MapClick) {
  if (!check || check.busy) return;
  const sky = app.sky, map = app.map, t = check.tasks[check.i];
  let ok: boolean;
  if (t.kind === 'star') {
    const s = map.screenOfStar(t.idx);
    ok = c.star === t.idx || (!!s && Math.abs(s[0] - c.x) + Math.abs(s[1] - c.y) < (c.touch ? 30 : 20));
    map.marks = [{ ra: sky.ra[t.idx], dec: sky.dec[t.idx], kind: 'good', label: ok ? 'Верно!' : starTitle(t.idx) }];
    if (!ok) map.marks.push({ ra: c.ra, dec: c.dec, kind: 'bad' });
  } else {
    ok = sky.conAt(c.ra, c.dec) === t.abbr;
    map.boundFocus = setOf([t.abbr]);
    map.marks = [{ ra: c.ra, dec: c.dec, kind: ok ? 'good' : 'bad', label: ok ? 'Верно!' : `Это ${sky.conName(sky.conAt(c.ra, c.dec) || '')}`.trim() }];
  }
  if (ok) check.ok++;
  check.busy = true;
  banner(ok ? 'Верно!' : `Не то — правильный ответ отмечен зелёным`, ok ? 'good' : 'bad');
  map.redraw();
  window.setTimeout(() => {
    if (!check) return;
    map.marks = [];
    map.boundFocus = {};
    check.busy = false;
    check.i++;
    if (check.i < check.tasks.length) { showTask(); map.redraw(); return; }
    const L = LESSONS[state.lesson], score = `${check.ok}/${check.tasks.length}`;
    state.done[L.id] = score;
    save();
    const good = check.ok / check.tasks.length >= 0.7;
    check = null;
    banner(good ? `Отлично: ${score}! Урок пройден ✓` : `${score} — повтори урок и попробуй ещё раз`, good ? 'good' : 'bad');
    window.setTimeout(() => banner(null), 3000);
    app.updateProgress();
    render();
    renderPanel();
    renderList();
  }, ok ? 800 : 1800);
}

export const learnTab: TabController = {
  enter() { render(); app.map.setView(lessonView(LESSONS[state.lesson])); renderPanel(); renderList(); },
  click(c) {
    if (check) { checkClick(c); return; }
    const sky = app.sky;
    if (c.star >= 0) { hint(starShortInfo(c.star)); return; }
    if (c.dso) { hint(`<b>${c.dso.label || c.dso.id}</b> · ${c.dso.name}`); return; }
    const con = sky.conAt(c.ra, c.dec);
    if (con) hint(`Здесь созвездие <b>${sky.conName(con)}</b>`, 2500);
  },
  render,
  home: () => lessonView(LESSONS[state.lesson]),
};
