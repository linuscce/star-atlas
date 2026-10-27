import type { TaskLevel, TaskTopic } from '../core/types';
import { setOf } from '../core/util';
import { T, fill, fmtNum } from '../i18n';
import type { MapClick } from '../map/skymap';
import { generate } from '../tasks/generate';
import type { Problem } from '../tasks/generate';
import { app, applyToggles, panelToTop, starShortInfo } from '../ui/app';
import type { TabController } from '../ui/app';
import { each } from '../ui/dom';
import { banner, hint } from '../ui/overlay';
import { bindPlace, placeHtml } from '../ui/place';
import { save, state, toggles } from '../ui/state';

const TOPICS: TaskTopic[] = ['map', 'vis', 'sun', 'stars', 'solved'];
const LEVELS: TaskLevel[] = ['easy', 'mid', 'hard'];

let p: Problem | null = null;
let result: { ok: boolean; text: string } | null = null; // после ответа
let given: number[] = [];                                  // что выбрал ученик (номера вариантов)
let givenNum = '';
let streak = 0;                                            // верных ответов подряд на этом уровне
const recent: string[] = [];

function next() {
  const topics = state.taskTopics.filter((t) => TOPICS.indexOf(t) >= 0);
  banner(null);
  hint(null);
  result = null; given = []; givenNum = '';
  if (!topics.length) { p = null; render(); renderPanel(); return; }
  p = generate(topics[Math.floor(Math.random() * topics.length)], app.sky, { lat: state.lat, all: state.taskAll }, state.taskLevel, recent);
  recent.push(p.key);
  if (recent.length > 10) recent.shift();
  render();
  if (p.view) app.map.flyTo(p.view, 500);
  renderPanel();
}

function finish(ok: boolean, text: string) {
  if (!p) return;
  result = { ok, text };
  streak = ok ? streak + 1 : 0;
  const s = state.taskStats[p.topic] || (state.taskStats[p.topic] = { ok: 0, bad: 0 });
  if (ok) s.ok++; else s.bad++;
  save();
  render();
  renderPanel();
  banner(ok ? T.ui.right : T.ui.wrong, ok ? 'good' : 'bad');
  window.setTimeout(() => banner(null), 2500);
}

const answerText = (q: Problem) => (q.correct || []).map((k) => q.options![k]).join(', ');

function checkChoice(k: number) {
  if (!p || result) return;
  given = [k];
  const ok = (p.correct || []).indexOf(k) >= 0;
  finish(ok, ok ? T.ui.right : fill(T.tasks.wrongAnswer, { answer: answerText(p) }));
}

function checkMulti() {
  if (!p || result) return;
  given = [];
  each(app.panel.querySelectorAll('.task-multi input:checked'), (el) => given.push(+(el as HTMLInputElement).value));
  const right = (p.correct || []).slice().sort().join(), ok = given.slice().sort().join() === right;
  finish(ok, ok ? T.ui.right : fill(T.tasks.wrongAnswer, { answer: answerText(p) }));
}

function checkNumber() {
  if (!p || result) return;
  const el = app.panel.querySelector('#t-num') as HTMLInputElement;
  givenNum = el.value;
  const v = parseFloat(el.value.replace(',', '.').replace('−', '-').replace('°', ''));
  if (isNaN(v)) { hint(T.tasks.enterNumber, 3000); return; }
  const ok = Math.abs(v - p.value!) <= (p.tol || 0.5);
  finish(ok, ok ? T.ui.right : fill(T.tasks.wrongAnswer, { answer: `${fmtNum(p.value!, 1)}°` }));
}

function checkNames() {
  if (!p || result) return;
  given = [];
  each(app.panel.querySelectorAll('.task-slot select'), (el) => given.push(+(el as HTMLSelectElement).value));
  const right = p.correct || [];
  let n = 0;
  right.forEach((k, i) => { if (given[i] === k) n++; });
  const answer = right.map((k, i) => `${i + 1} — ${p!.options![k]}`).join(', ');
  finish(n === right.length, n === right.length ? T.ui.right : fill(T.tasks.partly, { ok: n, n: right.length, answer }));
}

function render() {
  const map = app.map, t = toggles.tasks, q = p, show = !!result;
  applyToggles('tasks');
  map.opt.lines = true;
  map.opt.mwBoost = 1;
  map.pointers = [];
  map.dso = [];
  map.boundFocus = {};
  const focus = setOf(q && show ? q.focus || [] : []);
  map.lineStyle = (a) => (focus[a] ? 'focus' : t.lines ? 'faint' : 'hidden');
  map.conLabelFilter = (a) => !!focus[a];
  map.opt.conLabels = show;
  map.opt.starLabels = show;
  map.labelStars = q && show ? q.stars || [] : [];
  map.opt.ecliptic = t.ecliptic || (show && !!q && !!q.ecliptic);
  map.opt.months = show && !!q && !!q.ecliptic;
  map.marks = q && q.marks ? q.marks.map((m, k) => ({ ra: m.ra, dec: m.dec, kind: 'ring' as const, label: String(k + 1) })) : [];
  map.redraw();
}

function optionsHtml(q: Problem): string {
  const opts = q.options || [], right = q.correct || [];
  const mark = (k: number) => (result ? (right.indexOf(k) >= 0 ? ' right' : given.indexOf(k) >= 0 ? ' wrong' : '') : '');
  if (q.kind === 'choice') {
    return '<div class="q-opts">' + opts.map((o, k) =>
      `<button class="btn opt${mark(k)}" data-o="${k}"${result ? ' disabled' : ''}><span class="k">${k + 1}</span>${o}</button>`).join('') + '</div>';
  }
  if (q.kind === 'multi') {
    return '<div class="task-multi">' + opts.map((o, k) =>
      `<label class="chk${mark(k)}"><input type="checkbox" value="${k}"${given.indexOf(k) >= 0 ? ' checked' : ''}${result ? ' disabled' : ''}> ${o}</label>`).join('') +
      '</div>' + (result ? '' : `<button class="btn primary" id="t-check">${T.tasks.check}</button>`);
  }
  if (q.kind === 'number') {
    return `<div class="task-num"><input id="t-num" type="text" autocomplete="off" placeholder="${T.tasks.numberPlaceholder}" value="${givenNum.replace(/"/g, '')}"${result ? ' disabled' : ''}> °` +
      (result ? '' : ` <button class="btn primary" id="t-check">${T.tasks.check}</button>`) + '</div>';
  }
  // names: выпадающий список для каждой метки на карте
  return '<div class="task-slots">' + right.map((r, i) => {
    const sel = given[i] === undefined ? -1 : given[i];
    const cls = result ? (sel === r ? ' right' : ' wrong') : '';
    return `<label class="task-slot${cls}"><span class="k">${i + 1}</span><select${result ? ' disabled' : ''}><option value="-1">${T.tasks.choose}</option>` +
      opts.map((o, k) => `<option value="${k}"${sel === k ? ' selected' : ''}>${o}</option>`).join('') + '</select></label>';
  }).join('') + '</div>' + (result ? '' : `<button class="btn primary" id="t-check">${T.tasks.check}</button>`);
}

function renderPanel() {
  const tt = T.tasks, q = p;
  let h = `<h1>${tt.title}</h1><p class="muted">${tt.intro}</p>`;
  h += `<div class="seg" role="group" aria-label="${tt.levelTitle}">` + LEVELS.map((l) =>
    `<button class="seg-btn${state.taskLevel === l ? ' on' : ''}" data-level="${l}">${tt.levels[l]}</button>`).join('') +
    `</div><p class="muted small level-hint">${tt.levelHint[state.taskLevel]}</p>`;
  if (!q) {
    h += `<p>${tt.noTopics}</p>`;
  } else {
    h += `<div class="task"><div class="crumb">${tt.topics[q.topic]} · ${tt.levels[q.level]}</div><div class="task-text">${q.text}</div>${optionsHtml(q)}`;
    if (result) {
      h += `<div class="q-feedback ${result.ok ? 'good' : 'bad'}">${result.text}</div>`;
      const up = LEVELS[LEVELS.indexOf(state.taskLevel) + 1];
      if (result.ok && streak >= 5 && up) {
        h += `<div class="level-up">${fill(tt.levelUp, { level: tt.levels[up] })} <button class="btn" id="t-level-up" data-level="${up}">${tt.levelUpBtn}</button></div>`;
      }
      h += `<div class="solution"><div class="opt-title">${tt.solutionTitle}</div><p>${q.solution}</p></div>`;
      h += `<button class="btn primary" id="t-next">${tt.next}</button>`;
    }
    h += '</div>';
  }
  let ok = 0, n = 0;
  for (const k of Object.keys(state.taskStats)) { ok += state.taskStats[k].ok; n += state.taskStats[k].ok + state.taskStats[k].bad; }
  if (n) h += `<div class="q-score">${fill(tt.score, { ok, n })}</div>`;
  h += `<details class="q-settings"${q ? '' : ' open'}><summary>${tt.topicsTitle}</summary>` +
    TOPICS.map((id) => `<label class="chk"><input type="checkbox" class="t-topic" value="${id}"${state.taskTopics.indexOf(id) >= 0 ? ' checked' : ''}> ${tt.topics[id]}</label>`).join('') +
    `<label class="chk"><input type="checkbox" id="t-all"${state.taskAll ? ' checked' : ''}> ${tt.allSky}</label>${placeHtml('t-lat')}</details>`;
  h += `<details class="q-settings"><summary>${tt.guideTitle}</summary><ul class="facts">` + tt.guide.map((g) => `<li>${g}</li>`).join('') +
    `</ul><p class="muted small">${tt.materials}</p><button class="btn" id="t-ref">${tt.openRef}</button></details>`;

  const panel = app.panel;
  // После ответа содержимое меняется на месте — прокрутку не трогаем; новая задача — наверх.
  const scroll = result ? panel.scrollTop : 0;
  panel.innerHTML = h;
  if (result) panel.scrollTop = scroll; else panelToTop();
  each(panel.querySelectorAll('.opt'), (b) => b.addEventListener('click', () => checkChoice(+b.dataset.o!)));
  const btn = (id: string, fn: () => void) => { const b = panel.querySelector('#' + id); if (b) b.addEventListener('click', fn); };
  btn('t-check', () => { if (!q) return; if (q.kind === 'multi') checkMulti(); else if (q.kind === 'number') checkNumber(); else checkNames(); });
  btn('t-next', next);
  each(panel.querySelectorAll('[data-level]'), (b) => b.addEventListener('click', () => {
    state.taskLevel = b.dataset.level as TaskLevel;
    streak = 0;
    save();
    next();
  }));
  btn('t-ref', () => app.setTab('ref'));
  const num = panel.querySelector('#t-num') as HTMLInputElement | null;
  if (num && !result) num.addEventListener('keydown', (e) => { if (e.keyCode === 13) checkNumber(); });
  bindPlace(panel, 't-lat', next);
  each(panel.querySelectorAll('.t-topic, #t-all'), (el) => el.addEventListener('change', () => {
    state.taskTopics = [];
    each(panel.querySelectorAll('.t-topic:checked'), (x) => state.taskTopics.push((x as HTMLInputElement).value as TaskTopic));
    state.taskAll = (panel.querySelector('#t-all') as HTMLInputElement).checked;
    save();
    next();
  }));
}

// Клавиши 1–5 — варианты ответа, Enter — следующая задача.
document.addEventListener('keydown', (e) => {
  if (state.tab !== 'tasks' || !p) return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (result && e.keyCode === 13) { e.preventDefault(); next(); return; }
  const n = e.keyCode >= 49 && e.keyCode <= 53 ? e.keyCode - 48 : e.keyCode >= 97 && e.keyCode <= 101 ? e.keyCode - 96 : 0;
  if (!result && p.kind === 'choice' && n >= 1 && n <= (p.options || []).length) checkChoice(n - 1);
});

export const tasksTab: TabController = {
  enter() { if (!p) next(); else { render(); if (p.view) app.map.setView(p.view); renderPanel(); } },
  click(c: MapClick) {
    if (result && c.star >= 0) hint(starShortInfo(c.star));
  },
  render,
  home: () => (p && p.view ? p.view : { ra: 0, dec: 60, fov: 100 }),
};
