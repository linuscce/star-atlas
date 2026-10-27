import type { MapTab, QPool, QType, TaskLevel, TaskTopic, Tab, Toggle } from '../core/types';

export interface Stat { ok: number; bad: number }

// ---------- сохранение (localStorage может быть недоступен — тогда просто не сохраняем) ----------
// Ключи общие для всех языков: прогресс хранится по id уроков, а не по текстам.

export const store = {
  get<T>(key: string, def: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) as T : def;
    } catch (_) { return def; }
  },
  set(key: string, v: unknown) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) { /* приватный режим и т. п. */ }
  },
};

export const state = {
  done: store.get<Record<string, string>>('sa.done', {}),
  stats: store.get<Record<string, Stat>>('sa.stats', {}),
  lat: store.get<number>('sa.lat', NaN), // NaN — ещё не вводили: main.ts возьмёт широту по умолчанию для языка
  lesson: store.get<number>('sa.lesson', 0),     // номер урока в текущем маршруте
  lessonId: store.get<string>('sa.lessonId', ''), // id того же урока — номер в другом маршруте другой
  tab: store.get<Tab>('sa.tab', 'learn'),
  quizTypes: store.get<QType[]>('sa.qtypes', ['conId', 'findStar', 'nameStar', 'findCon']),
  // 'north' — прежнее название набора «видимое с моей широты».
  quizPool: ((p: string) => (p === 'north' ? 'visible' : p) as QPool)(store.get<string>('sa.qpool', 'learned')),
  taskTopics: store.get<TaskTopic[]>('sa.ttopics', ['map', 'vis', 'sun', 'stars', 'solved']),
  taskAll: store.get<boolean>('sa.tall', store.get<boolean>('sa.tsouth', false)), // всё небо, а не только видимое с моей широты
  taskLevel: store.get<TaskLevel>('sa.tlevel', 'mid'),
  // Юг сверху: по умолчанию — если широта южная (её задают на главной или в атласе/шпаргалке).
  southUp: store.get<boolean>('sa.southup', store.get<number>('sa.lat', 1) < 0),
  taskStats: store.get<Record<string, Stat>>('sa.tstats', {}),
};

export function save() {
  store.set('sa.done', state.done);
  store.set('sa.stats', state.stats);
  store.set('sa.lat', state.lat);
  store.set('sa.lesson', state.lesson);
  store.set('sa.lessonId', state.lessonId);
  store.set('sa.tab', state.tab);
  store.set('sa.qtypes', state.quizTypes);
  store.set('sa.qpool', state.quizPool);
  store.set('sa.ttopics', state.taskTopics);
  store.set('sa.tall', state.taskAll);
  store.set('sa.tlevel', state.taskLevel);
  store.set('sa.southup', state.southUp);
  store.set('sa.tstats', state.taskStats);
}

// ---------- переключатели карты (свои для каждой вкладки) ----------

export const toggles: Record<MapTab, Record<Toggle, boolean>> = {
  learn: { lines: false, names: true, bounds: false, grid: false, ecliptic: false, mw: true, dso: true },
  quiz: { lines: false, names: false, bounds: false, grid: false, ecliptic: false, mw: true, dso: false },
  tasks: { lines: false, names: false, bounds: false, grid: false, ecliptic: false, mw: true, dso: false },
  atlas: { lines: true, names: true, bounds: false, grid: false, ecliptic: false, mw: true, dso: true },
};
