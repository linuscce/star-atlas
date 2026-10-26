import { fmtMag } from './math';
import type { Sky } from './sky';
import type { MapClick, Mark, SkyMap } from './skymap';
import type { View } from './types';

export type Tab = 'learn' | 'quiz' | 'atlas' | 'ref';
export type MapTab = 'learn' | 'quiz' | 'atlas';
export type Toggle = 'lines' | 'names' | 'bounds' | 'grid' | 'ecliptic' | 'mw' | 'dso';
export interface Stat { ok: number; bad: number }

// ---------- сохранение (localStorage может быть недоступен — тогда просто не сохраняем) ----------

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
  lat: store.get<number>('sa.lat', 55.75),
  lesson: store.get<number>('sa.lesson', 0),
  tab: store.get<Tab>('sa.tab', 'learn'),
  quizTypes: store.get<string[]>('sa.qtypes', ['conId', 'findStar', 'nameStar', 'findCon']),
  quizPool: store.get<string>('sa.qpool', 'learned'),
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

export interface TabController {
  enter(): void;
  click(c: MapClick): void;
  render(): void;   // перенастроить карту после смены переключателей
  home(): View;     // вид для кнопки «вернуть»
}

export const app = {
  sky: null as unknown as Sky,
  map: null as unknown as SkyMap,
  panel: null as unknown as HTMLElement,
  tabs: {} as Record<MapTab, TabController>,
  setTab: (_t: Tab) => { /* назначается в main */ },
  updateProgress: () => { /* назначается в main */ },
};

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function applyToggles(tab: MapTab) {
  const t = toggles[tab], o = app.map.opt;
  o.grid = t.grid; o.ecliptic = t.ecliptic; o.mw = t.mw; o.bounds = t.bounds; o.dso = t.dso;
  o.conLabels = t.names; o.starLabels = t.names;
}

// ---------- надписи поверх карты ----------

let hintTimer = 0;
export function hint(html: string | null, ms = 4500) {
  const el = $('hint');
  clearTimeout(hintTimer);
  if (!html) { el.className = 'hint'; return; }
  el.innerHTML = html;
  el.className = 'hint show';
  if (ms) hintTimer = window.setTimeout(() => { el.className = 'hint'; }, ms);
}

export function banner(html: string | null, kind = '') {
  const el = $('banner');
  if (!html) { el.className = 'banner'; return; }
  el.innerHTML = html;
  el.className = `banner show ${kind}`;
}

let pulseTimer = 0;
export function pulse(ra: number, dec: number, kind: Mark['kind'] = 'info') {
  const map = app.map;
  clearTimeout(pulseTimer);
  map.marks = [{ ra, dec, kind, pulse: true, t0: performance.now() }];
  map.redraw();
  pulseTimer = window.setTimeout(() => { map.marks = []; map.redraw(); }, 2800);
}

// Имя звезды для людей: «Арктур», а если имени нет — «ε Волопаса».
export function starTitle(i: number): string {
  return app.sky.curatedName(i) || app.sky.starDesig(i);
}

export function starShortInfo(i: number): string {
  const sky = app.sky, name = sky.curatedName(i);
  return `<b>${name || sky.starDesig(i)}</b>${name ? ` · ${sky.starDesig(i)}` : ''} · ${fmtMag(sky.mag[i], 2)}`;
}

// querySelectorAll(...).forEach есть только с Chrome 51 — обходим список вручную.
export function each(list: NodeListOf<Element>, fn: (el: HTMLElement, i: number) => void) {
  for (let i = 0; i < list.length; i++) fn(list[i] as HTMLElement, i);
}

export function setOf(keys: string[]): Record<string, true> {
  const s: Record<string, true> = {};
  for (const k of keys) s[k] = true;
  return s;
}

export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
