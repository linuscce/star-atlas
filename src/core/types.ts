import type { SouthTexts, Texts } from '../i18n/types';

export interface RaDec { ra: number; dec: number }
export interface View { ra: number; dec: number; fov: number }

export type Tab = 'learn' | 'quiz' | 'tasks' | 'atlas' | 'ref';
export type MapTab = 'learn' | 'quiz' | 'tasks' | 'atlas';
export type Toggle = 'lines' | 'names' | 'bounds' | 'grid' | 'ecliptic' | 'mw' | 'dso';
export type QType = 'conId' | 'findStar' | 'nameStar' | 'findCon';
export type QPool = 'learned' | 'visible' | 'all';
// Темы задач: созвездия на карте, видимость, Солнце и Луна, звёзды, задачи с решением.
export type TaskTopic = 'map' | 'vis' | 'sun' | 'stars' | 'solved';
export type TaskLevel = 'easy' | 'mid' | 'hard';

export type DsoType = 'gal' | 'gc' | 'oc' | 'neb' | 'pn' | 'pt';
export interface DsoData {
  id: string;
  ra: number;
  dec: number;
  type: DsoType;
  size?: number;
}
// Объект вместе с названием на текущем языке.
export interface DsoItem extends DsoData {
  name: string;
  label?: string;
}

// Точка указателя: обозначение звезды ('α UMa', 'HIP12345'), id объекта из DSO или координаты.
export type PointRef = string | RaDec;
export interface PointerSpec {
  line?: [PointRef, PointRef, PointRef];
  path?: PointRef[];
  poly?: PointRef[];
}

export interface MapOptions {
  mw: boolean;
  grid: boolean;
  ecliptic: boolean;
  months: boolean;
  bounds: boolean;
  lines: boolean;
  conLabels: boolean;
  starLabels: boolean;
  dso: boolean;
  magLimit: number | null;
  mwBoost: number;
  southUp: boolean;   // юг сверху (запад слева) — так южное небо выглядит для наблюдателя в южном полушарии
}

// Шаг южного маршрута: урок, блок и свои указатели (если северные опираются на ещё не пройденное).
export interface SouthStep { id: string; block: string; pointers?: PointerSpec[] }

// Устройство урока; тексты — в texts/lessons.csv под тем же id.
export interface Lesson {
  id: string;
  block: string;
  cons: string[];
  stars?: string[];
  dso?: string[];
  pointers?: PointerSpec[];
  view?: View;
  opts?: Partial<MapOptions>;
  focusLines?: string[];
  theory?: boolean;
}

// Формат public/sky.js (см. tools/build_sky.py).
export interface SkyRaw {
  stars: number[];  // ra, dec, mag, bv — подряд, звёзды отсортированы по яркости
  hip: number[];
  names: Record<string, [string, string, string, string, string]>; // индекс → [Байер, созвездие, рус. имя, Флемстид, англ. имя]
  cons: Record<string, { la: string; gen: string; lx: number; ly: number; extra?: [number, number] }>;
  lines: Record<string, number[][]>;
  bounds: Record<string, number[][]>;
  mw: { l: number; rings: number[][] }[];
}

declare global {
  // SOUTH_JS — адрес south.js (задаёт страница); TEXT_SOUTH — его содержимое, когда загружен.
  interface Window { SKY: SkyRaw; TEXT: Texts; TEXT_SOUTH?: SouthTexts; SOUTH_JS?: string }
}
