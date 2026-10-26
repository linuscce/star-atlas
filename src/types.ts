export interface RaDec { ra: number; dec: number }
export interface View { ra: number; dec: number; fov: number }

export type DsoType = 'gal' | 'gc' | 'oc' | 'neb' | 'pn' | 'pt';
export interface DsoItem {
  id: string;
  name: string;
  label?: string;
  ra: number;
  dec: number;
  type: DsoType;
  size?: number;
}

// Точка указателя: обозначение звезды ('α UMa', 'HIP12345'), id объекта из DSO или координаты.
export type PointRef = string | RaDec;
export interface PointerSpec {
  line?: [PointRef, PointRef, PointRef];
  path?: PointRef[];
  poly?: PointRef[];
  label?: string;
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
}

export interface Block { id: string; title: string }

export interface Lesson {
  id: string;
  block: string;
  cons: string[];
  title?: string;
  stars?: string[];
  dso?: string[];
  pointers?: PointerSpec[];
  view?: View;
  opts?: Partial<MapOptions>;
  focusLines?: string[];
  find?: string;
  look?: string;
  facts?: string[];
  theory?: boolean;
  html?: string;
}

// Формат public/sky.js (см. tools/build_sky.py).
export interface SkyRaw {
  stars: number[];  // ra, dec, mag, bv — подряд, звёзды отсортированы по яркости
  hip: number[];
  names: Record<string, [string, string, string, string]>; // индекс → [Байер, созвездие, рус. имя, Флемстид]
  cons: Record<string, { la: string; gen: string; lx: number; ly: number; extra?: [number, number] }>;
  lines: Record<string, number[][]>;
  bounds: Record<string, number[][]>;
  mw: { l: number; rings: number[][] }[];
}

declare global {
  interface Window { SKY: SkyRaw }
}
