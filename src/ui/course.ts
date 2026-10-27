import type { Lesson } from '../core/types';
import { BLOCKS, LESSONS, SOUTH_BLOCKS, SOUTH_ROUTE } from '../data/lessons';
import { T } from '../i18n';
import type { LessonText } from '../i18n/types';
import { app } from './app';
import { loadScript } from './dom';
import { state } from './state';

// Курс уроков: северный маршрут (от Большого Ковша) или южный (от Южного Креста) — по знаку широты.
// Тексты южного маршрута (south.js) загружаются только тем, кому он нужен; пока их нет — северный.

const BY_ID: Record<string, Lesson> = {};
for (const L of LESSONS) BY_ID[L.id] = L;

// Уроки южного маршрута: устройство то же, блок и (где задано) указатели — свои.
const SOUTH_LESSONS: Lesson[] = SOUTH_ROUTE.map((s) => {
  const L = BY_ID[s.id];
  return {
    id: L.id, block: s.block, cons: L.cons, stars: L.stars, dso: L.dso, view: L.view, opts: L.opts,
    focusLines: L.focusLines, theory: L.theory, pointers: s.pointers || L.pointers,
  };
});

export const isSouth = () => state.lat < 0 && !!window.TEXT_SOUTH;
export const course = (): Lesson[] => (isSouth() ? SOUTH_LESSONS : LESSONS);
export const courseBlocks = (): string[] => (isSouth() ? SOUTH_BLOCKS : BLOCKS);
export const blockTitle = (b: string): string => (isSouth() && window.TEXT_SOUTH!.blocks[b]) || T.blocks[b] || '';

// Тексты урока: «Как выглядит» и факты общие, «Как найти», подписи указателей и вступление — свои у маршрута.
export function lessonText(L: Lesson): LessonText {
  const t = T.lessons[L.id] || {};
  const s = isSouth() ? window.TEXT_SOUTH!.lessons[L.id] : undefined;
  if (!s) return t;
  return { title: t.title, look: t.look, facts: t.facts, find: s.find || t.find, html: s.html || t.html, labels: s.labels || [] };
}

export function lessonTitle(L: Lesson): string {
  return lessonText(L).title || app.sky.conName(L.cons[0]);
}

export function lessonIndex(id: string): number {
  const c = course();
  for (let i = 0; i < c.length; i++) if (c[i].id === id) return i;
  return -1;
}

export function lessonOfCon(abbr: string): number {
  const c = course();
  for (let i = 0; i < c.length; i++) if (c[i].cons.indexOf(abbr) >= 0) return i;
  return -1;
}

// Номер текущего урока — по его id: в другом маршруте тот же урок стоит на другом месте.
export function syncLessonIndex() {
  // Раньше хранился только номер — номер в северном маршруте.
  if (!state.lessonId) state.lessonId = (LESSONS[state.lesson] || LESSONS[0]).id;
  state.lesson = Math.max(0, lessonIndex(state.lessonId));
}

// Загрузить тексты южного маршрута, если он нужен (южная широта), и продолжить.
// Ошибка загрузки — не беда: останется северный маршрут.
export function ensureCourse(done: () => void) {
  if (state.lat >= 0 || window.TEXT_SOUTH || !window.SOUTH_JS) { done(); return; }
  loadScript(window.SOUTH_JS, done);
}
