import { app, applyToggles, banner, each, save, setOf, shuffle, starTitle, state, toggles } from './app';
import type { TabController } from './app';
import { LESSONS } from './lessons';
import { angDist, clamp } from './math';
import type { MapClick } from './skymap';
import type { Lesson, View } from './types';

type QType = 'conId' | 'findStar' | 'nameStar' | 'findCon';
const TYPES: [QType, string][] = [
  ['conId', 'Узнай созвездие по звёздам'],
  ['findCon', 'Покажи созвездие на карте'],
  ['findStar', 'Найди звезду'],
  ['nameStar', 'Назови отмеченную звезду'],
];
const POOLS: [string, string][] = [
  ['learned', 'Изученные уроки'],
  ['north', 'Небо, видимое из России'],
  ['all', 'Все 88 созвездий'],
];

interface Question {
  type: QType;
  key: string;
  con?: string;
  star?: number;
  options?: string[];   // сокращения созвездий или индексы звёзд
  view: View;
  answered: boolean;
  correct: boolean;
}

let q: Question | null = null;
let lastKey = '';
const score = { ok: 0, n: 0, streak: 0 };

function poolLessons(): Lesson[] {
  const p = state.quizPool;
  return LESSONS.filter((L, i) => !L.theory && (
    p === 'all' ? true : p === 'north' ? L.block !== 'south' : (!!state.done[L.id] || i < state.lesson)));
}

function pools() {
  const sky = app.sky, cons: string[] = [], stars: number[] = [];
  for (const L of poolLessons()) {
    for (const c of L.cons) if (cons.indexOf(c) < 0) cons.push(c);
    for (const k of L.stars || []) {
      const i = sky.starIndex(k);
      if (i >= 0 && sky.mag[i] <= 3.5 && stars.indexOf(i) < 0 && sky.curatedName(i)) stars.push(i);
    }
  }
  return { cons, stars };
}

// Взвешенный выбор: где были ошибки — спрашиваем чаще.
function pick<T>(items: T[], key: (t: T) => string): T {
  const w = items.map((it) => {
    const k = key(it);
    if (k === lastKey && items.length > 1) return 0;
    const s = state.stats[k];
    return s ? (1 + 2 * s.bad) / (1 + 0.6 * s.ok) : 1.5;
  });
  let total = 0;
  for (const x of w) total += x;
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function nearestCons(con: string, n: number): string[] {
  const sky = app.sky, g = sky.geo[con].fig;
  return sky.cons.filter((c) => c !== con)
    .map((c) => ({ c, d: angDist(g, sky.geo[c].fig) }))
    .sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.c);
}

function jitter(v: { ra: number; dec: number }, maxDeg: number) {
  const a = Math.random() * Math.PI * 2, r = Math.random() * maxDeg;
  const dec = clamp(v.dec + r * Math.sin(a), -89, 89);
  return { ra: v.ra + r * Math.cos(a) / Math.max(0.2, Math.cos(dec * Math.PI / 180)), dec };
}

function newQuestion() {
  const sky = app.sky;
  const { cons, stars } = pools();
  const types = (state.quizTypes as QType[]).filter((t) => (t === 'findStar' || t === 'nameStar') ? stars.length >= 4 : cons.length >= (t === 'conId' ? 1 : 1));
  banner(null);
  if (!cons.length || !types.length) { q = null; renderPanel(); render(); return; }
  const type = types[Math.floor(Math.random() * types.length)];
  let nq: Question;
  if (type === 'conId' || type === 'findCon') {
    const con = pick(cons, (c) => `${type}:${c}`);
    const g = sky.geo[con];
    if (type === 'conId') {
      const c = jitter(g.bnd, g.bnd.r * 0.15);
      const near = shuffle(nearestCons(con, 6)).slice(0, 3);
      nq = { type, key: `${type}:${con}`, con, options: shuffle([con].concat(near)), view: { ra: c.ra, dec: c.dec, fov: clamp(g.bnd.r * 2.7, 28, 130) }, answered: false, correct: false };
    } else {
      const fov = g.fig.r > 25 ? 130 : 100;
      const c = jitter(g.fig, Math.max(0, fov * 0.28 - g.fig.r * 0.5));
      nq = { type, key: `${type}:${con}`, con, view: { ra: c.ra, dec: c.dec, fov }, answered: false, correct: false };
    }
  } else {
    const star = pick(stars, (s) => `${type}:${sky.hip[s]}`);
    const c = jitter({ ra: sky.ra[star], dec: sky.dec[star] }, type === 'findStar' ? 16 : 8);
    nq = { type, key: `${type}:${sky.hip[star]}`, star, view: { ra: c.ra, dec: c.dec, fov: 70 }, answered: false, correct: false };
    if (type === 'nameStar') {
      const others = stars.filter((s) => s !== star)
        .map((s) => ({ s, d: angDist({ ra: sky.ra[s], dec: sky.dec[s] }, { ra: sky.ra[star], dec: sky.dec[star] }) }))
        .sort((a, b) => a.d - b.d).slice(0, 7).map((x) => x.s);
      nq.options = shuffle([star].concat(shuffle(others).slice(0, 3))).map(String);
    }
  }
  q = nq;
  lastKey = nq.key;
  render();
  app.map.flyTo(nq.view, 500);
  renderPanel();
  if (type === 'findStar') banner(`Найди звезду: <b>${starTitle(nq.star!)}</b>`);
  if (type === 'findCon') banner(`Покажи созвездие: <b>${sky.conName(nq.con!)}</b>`);
}

function answer(correct: boolean) {
  if (!q || q.answered) return;
  q.answered = true;
  q.correct = correct;
  const s = state.stats[q.key] || (state.stats[q.key] = { ok: 0, bad: 0 });
  if (correct) s.ok++; else s.bad++;
  score.n++;
  if (correct) { score.ok++; score.streak++; } else score.streak = 0;
  save();
  render();
  renderPanel();
  banner(correct ? 'Верно!' : 'Не совсем — смотри правильный ответ', correct ? 'good' : 'bad');
}

function render() {
  const map = app.map;
  applyToggles('quiz');
  map.opt.lines = true;
  map.opt.months = false;
  map.opt.mwBoost = 1;
  map.pointers = [];
  map.dso = [];
  map.conLabelFilter = null;
  if (!q) {
    map.lineStyle = () => 'hidden';
    map.labelStars = [];
    map.boundFocus = {};
    map.marks = [];
    map.opt.conLabels = map.opt.starLabels = false;
    map.redraw();
    return;
  }
  const sky = app.sky, cq = q;
  const revealCon = cq.answered ? (cq.con || (cq.star !== undefined ? sky.starCon(cq.star) : null)) : null;
  map.lineStyle = (a) => a === revealCon ? 'focus' : toggles.quiz.lines ? 'faint' : 'hidden';
  map.conLabelFilter = (a) => a === revealCon;
  map.opt.conLabels = cq.answered;
  map.opt.starLabels = cq.answered;
  map.labelStars = cq.answered && cq.star !== undefined ? [cq.star] : [];
  map.boundFocus = setOf(cq.type === 'conId' || (cq.answered && cq.type === 'findCon') ? [cq.con!] : []);
  if (cq.type === 'nameStar' && !cq.answered) {
    map.marks = [{ ra: sky.ra[cq.star!], dec: sky.dec[cq.star!], kind: 'ring' }];
  } else if (!cq.answered) {
    map.marks = [];
  }
  map.redraw();
}

function renderPanel() {
  const sky = app.sky, { cons, stars } = pools();
  let h = '<h1>Тренировка</h1><p class="muted">Вопросы по созвездиям из выбранного набора. То, в чём ошибаешься, спрашивается чаще.</p>';
  h += '<div class="q-area" id="q-area">';
  if (!q) {
    h += cons.length ? '<p>Выбери хотя бы один тип вопросов.</p>'
      : '<p>Пока нечего спрашивать: ты ещё не прошёл ни одного урока.</p><button class="btn primary" id="q-north">Спрашивать по всему небу, видимому из России</button>';
  } else {
    const prompts: Record<QType, string> = {
      conId: 'Какое созвездие внутри жёлтой границы?',
      findCon: `Нажми на карте внутри созвездия <b>${q.con ? sky.conName(q.con) : ''}</b>`,
      findStar: `Нажми на звезду <b>${q.star !== undefined ? starTitle(q.star) : ''}</b>`,
      nameStar: 'Как называется звезда в жёлтом кружке?',
    };
    h += `<div class="q-prompt">${prompts[q.type]}</div>`;
    if (q.options) {
      h += '<div class="q-opts">' + q.options.map((o, k) => {
        const label = q!.type === 'conId' ? sky.conName(o) : starTitle(+o);
        const isRight = q!.type === 'conId' ? o === q!.con : +o === q!.star;
        const cls = q!.answered ? (isRight ? ' right' : '') : '';
        return `<button class="btn opt${cls}" data-o="${o}"><span class="k">${k + 1}</span>${label}</button>`;
      }).join('') + '</div>';
    }
    if (q.answered) {
      let extra = '';
      if (q.con) extra = `${sky.conName(q.con)} · <i>${sky.conLatin(q.con)}</i> (${q.con})`;
      else if (q.star !== undefined) extra = `${starTitle(q.star)} · ${sky.starDesig(q.star)}`;
      h += `<div class="q-feedback ${q.correct ? 'good' : 'bad'}">${q.correct ? 'Верно!' : 'Неверно.'} ${extra}</div>`;
      h += '<button class="btn primary" id="q-next">Следующий вопрос →</button>';
    } else if (!q.options) {
      h += '<button class="btn" id="q-skip">Не знаю — показать</button>';
    }
  }
  h += '</div>';
  h += `<div class="q-score">Верно ${score.ok} из ${score.n}${score.streak > 1 ? ` · серия ${score.streak}` : ''}</div>`;
  h += '<details class="q-settings"' + (q ? '' : ' open') + '><summary>Настройки</summary>';
  h += '<div class="opt-title">Что спрашивать</div>' + TYPES.map(([id, label]) =>
    `<label class="chk"><input type="checkbox" value="${id}"${state.quizTypes.indexOf(id) >= 0 ? ' checked' : ''}> ${label}</label>`).join('');
  h += '<div class="opt-title">Из чего</div>' + POOLS.map(([id, label]) =>
    `<label class="chk"><input type="radio" name="pool" value="${id}"${state.quizPool === id ? ' checked' : ''}> ${label}</label>`).join('');
  h += `<div class="muted small">Сейчас в наборе: ${cons.length} созвездий, ${stars.length} звёзд.</div>`;
  h += '</details>';
  const weak = Object.keys(state.stats).filter((k) => state.stats[k].bad > state.stats[k].ok)
    .sort((a, b) => state.stats[b].bad - state.stats[a].bad).slice(0, 8);
  if (weak.length) {
    h += '<div class="opt-title">Чаще всего ошибаешься</div><div class="weak">' + weak.map((k) => {
      const [, id] = k.split(':');
      if (k.indexOf('Star') > 0) {
        const i = sky.starIndex('HIP' + id);
        return i >= 0 ? `<span>${starTitle(i)}</span>` : '';
      }
      return `<span>${sky.conName(id)}</span>`;
    }).join('') + '</div>';
  }

  const panel = app.panel;
  panel.innerHTML = h;
  each(panel.querySelectorAll('.opt'), (b) => b.addEventListener('click', () => {
    if (!q || q.answered) return;
    const o = (b as HTMLElement).dataset.o!;
    answer(q.type === 'conId' ? o === q.con : +o === q.star);
    if (!q.correct) (panel.querySelector(`.opt[data-o="${o}"]`) as HTMLElement | null)?.classList.add('wrong');
  }));
  const north = panel.querySelector('#q-north');
  if (north) north.addEventListener('click', () => { state.quizPool = 'north'; save(); newQuestion(); });
  const next = panel.querySelector('#q-next');
  if (next) next.addEventListener('click', newQuestion);
  const skip = panel.querySelector('#q-skip');
  if (skip) skip.addEventListener('click', () => {
    if (q && q.star !== undefined) app.map.marks = [{ ra: sky.ra[q.star], dec: sky.dec[q.star], kind: 'good', label: starTitle(q.star) }];
    answer(false);
  });
  each(panel.querySelectorAll('.q-settings input'), (inp) => inp.addEventListener('change', () => {
    const el = inp as HTMLInputElement;
    if (el.type === 'radio') state.quizPool = el.value;
    else state.quizTypes = Array.prototype.slice.call(panel.querySelectorAll('.q-settings input[type=checkbox]:checked')).map((x: HTMLInputElement) => x.value);
    save();
    newQuestion();
  }));
}

function click(c: MapClick) {
  if (!q || q.answered) return;
  const sky = app.sky, map = app.map;
  if (q.type === 'findStar') {
    const s = map.screenOfStar(q.star!);
    const ok = c.star === q.star || (!!s && Math.abs(s[0] - c.x) + Math.abs(s[1] - c.y) < (c.touch ? 30 : 20));
    map.marks = [{ ra: sky.ra[q.star!], dec: sky.dec[q.star!], kind: 'good', label: starTitle(q.star!) }];
    if (!ok) map.marks.push({ ra: c.ra, dec: c.dec, kind: 'bad', label: c.star >= 0 ? starTitle(c.star) : undefined });
    answer(ok);
  } else if (q.type === 'findCon') {
    const got = sky.conAt(c.ra, c.dec);
    map.marks = [{ ra: c.ra, dec: c.dec, kind: got === q.con ? 'good' : 'bad', label: got && got !== q.con ? `Это ${sky.conName(got)}` : undefined }];
    answer(got === q.con);
  }
}

// Клавиши 1–4 — варианты ответа, Enter/пробел — следующий вопрос.
document.addEventListener('keydown', (e) => {
  if (state.tab !== 'quiz' || !q) return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const code = e.keyCode;
  if (q.answered && (code === 13 || code === 32)) { e.preventDefault(); newQuestion(); return; }
  const n = code >= 49 && code <= 52 ? code - 48 : code >= 97 && code <= 100 ? code - 96 : 0;
  if (!q.answered && q.options && n >= 1 && n <= q.options.length) {
    const b = app.panel.querySelectorAll('.opt')[n - 1] as HTMLElement | undefined;
    if (b) b.click();
  }
});

export const quizTab: TabController = {
  enter() { if (!q) newQuestion(); else { render(); app.map.setView(q.view); renderPanel(); } },
  click,
  render,
  home: () => (q ? q.view : { ra: 0, dec: 60, fov: 100 }),
};
