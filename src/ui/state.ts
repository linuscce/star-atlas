import type { MapTab, QPool, QType, Tab, Toggle } from '../core/types';

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
  lesson: store.get<number>('sa.lesson', 0),
  tab: store.get<Tab>('sa.tab', 'learn'),
  quizTypes: store.get<QType[]>('sa.qtypes', ['conId', 'findStar', 'nameStar', 'findCon']),
  quizPool: store.get<QPool>('sa.qpool', 'learned'),
};

export function save() {
  store.set('sa.done', state.done);
  store.set('sa.stats', state.stats);
  store.set('sa.lat', state.lat);
  store.set('sa.lesson', state.lesson);
  store.set('sa.tab', state.tab);
  store.set('sa.qtypes', state.quizTypes);
  store.set('sa.qpool', state.quizPool);
}

// ---------- переключатели карты (свои для каждой вкладки) ----------

export const toggles: Record<MapTab, Record<Toggle, boolean>> = {
  learn: { lines: false, names: true, bounds: false, grid: false, ecliptic: false, mw: true, dso: true },
  quiz: { lines: false, names: false, bounds: false, grid: false, ecliptic: false, mw: true, dso: false },
  atlas: { lines: true, names: true, bounds: false, grid: false, ecliptic: false, mw: true, dso: true },
};
