import type { RaDec } from './types';

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
const OBLIQUITY = 23.4393 * D2R;

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const norm360 = (a: number) => ((a % 360) + 360) % 360;

export type Vec3 = [number, number, number];

export function vec(ra: number, dec: number): Vec3 {
  const a = ra * D2R, d = dec * D2R, cd = Math.cos(d);
  return [cd * Math.cos(a), cd * Math.sin(a), Math.sin(d)];
}

export function toRaDec(v: Vec3): RaDec {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return { ra: norm360(Math.atan2(v[1], v[0]) * R2D), dec: Math.asin(clamp(v[2] / l, -1, 1)) * R2D };
}

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function unit(a: Vec3): Vec3 {
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function angDist(a: RaDec, b: RaDec): number {
  return Math.acos(clamp(dot(vec(a.ra, a.dec), vec(b.ra, b.dec)), -1, 1)) * R2D;
}

// Приближённый минимальный круг, охватывающий точки на сфере (алгоритм Бадою — Кларксона).
export function enclosingCircle(points: RaDec[]): RaDec & { r: number } {
  if (!points.length) return { ra: 0, dec: 0, r: 10 };
  const vs = points.map((p) => vec(p.ra, p.dec));
  let c: Vec3 = unit(vs.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]] as Vec3, [0, 0, 0] as Vec3));
  for (let k = 1; k <= 80; k++) {
    let far = vs[0], fd = 2;
    for (const v of vs) { const d = dot(c, v); if (d < fd) { fd = d; far = v; } }
    const t = 1 / (k + 1);
    c = unit([c[0] + (far[0] - c[0]) * t, c[1] + (far[1] - c[1]) * t, c[2] + (far[2] - c[2]) * t]);
  }
  let r = 0;
  for (const v of vs) r = Math.max(r, Math.acos(clamp(dot(c, v), -1, 1)) * R2D);
  const rd = toRaDec(c);
  return { ra: rd.ra, dec: rd.dec, r };
}

export function eclToEq(lambdaDeg: number): RaDec {
  const l = lambdaDeg * D2R;
  const ra = Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l));
  const dec = Math.asin(Math.sin(l) * Math.sin(OBLIQUITY));
  return { ra: norm360(ra * R2D), dec: dec * R2D };
}

// Эклиптическая долгота Солнца (точность ~0,01°).
export function sunLongitude(date: Date): number {
  const n = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * D2R;
  return norm360(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}

export const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

// Видимость звезды со склонением dec на широте lat.
export function visibility(dec: number, lat: number): { kind: 'never-sets' | 'rises' | 'never-rises'; hmax: number } {
  const hmax = 90 - Math.abs(lat - dec);
  if (lat >= 0 ? dec > 90 - lat : dec < -90 - lat) return { kind: 'never-sets', hmax };
  if (hmax < 0) return { kind: 'never-rises', hmax };
  return { kind: 'rises', hmax };
}
