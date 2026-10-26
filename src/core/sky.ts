import { CONSTELLATIONS } from '../data/constellations';
import { DSO } from '../data/dso';
import { T } from '../i18n';
import { clamp, enclosingCircle, norm360, vec } from './math';
import type { DsoItem, PointRef, RaDec, SkyRaw } from './types';

// Где в public/sky.js каталожное имя звезды на каждом языке (см. SkyRaw.names).
const NAME_FIELD: Record<string, number> = { ru: 2, en: 4 };

const SUP: Record<string, string> = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

// Все координаты переводятся в единичные векторы: тогда проекция на экран —
// только умножения и сложения, без тригонометрии на каждую звезду.
function toVectors(flat: number[]): Float32Array {
  const n = flat.length / 2, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = vec(flat[2 * i], flat[2 * i + 1]);
    out[3 * i] = v[0]; out[3 * i + 1] = v[1]; out[3 * i + 2] = v[2];
  }
  return out;
}

export interface ConGeo { fig: RaDec & { r: number }; bnd: RaDec & { r: number } }

export class Sky {
  readonly n: number;
  readonly ra: Float32Array;
  readonly dec: Float32Array;
  readonly mag: Float32Array;
  readonly bv: Float32Array;
  readonly xyz: Float32Array;
  readonly hip: number[];
  readonly raw: SkyRaw;
  readonly cons: string[];
  readonly lines: Record<string, Float32Array[]> = {};
  readonly bounds: Record<string, Float32Array[]> = {};
  private readonly ringCircles: Record<string, [number, number, number, number][]> = {}; // центр + cos(радиуса)
  readonly mw: { l: number; rings: Float32Array[] }[];
  readonly geo: Record<string, ConGeo> = {};
  readonly dsoById: Record<string, DsoItem> = {};
  private readonly ngp = vec(192.85948, 27.12825); // северный полюс Галактики
  private readonly hipIdx: Record<number, number> = {};
  private readonly bayerIdx: Record<string, number> = {};
  private readonly curated: Record<number, string> = {};

  constructor(raw: SkyRaw) {
    this.raw = raw;
    const n = this.n = raw.stars.length / 4;
    this.ra = new Float32Array(n); this.dec = new Float32Array(n);
    this.mag = new Float32Array(n); this.bv = new Float32Array(n);
    this.xyz = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ra = raw.stars[4 * i], dec = raw.stars[4 * i + 1];
      this.ra[i] = ra; this.dec[i] = dec;
      this.mag[i] = raw.stars[4 * i + 2]; this.bv[i] = raw.stars[4 * i + 3];
      const v = vec(ra, dec);
      this.xyz[3 * i] = v[0]; this.xyz[3 * i + 1] = v[1]; this.xyz[3 * i + 2] = v[2];
    }
    this.hip = raw.hip;
    raw.hip.forEach((h, i) => { this.hipIdx[h] = i; });

    // Ключи «α UMa». Звёзды отсортированы по яркости, поэтому первая найденная — ярчайшая.
    // Для α¹/α² добавляется и общий ключ «α Cap» → более яркая из пары.
    const alias: Record<string, number> = {};
    Object.keys(raw.names).forEach((k) => {
      const i = +k, [bayer, con] = raw.names[k];
      if (!bayer || !con) return;
      const key = `${bayer} ${con}`;
      if (!(key in this.bayerIdx)) this.bayerIdx[key] = i;
      const m = /^(.+?)\d+$/.exec(bayer);
      if (m && !(`${m[1]} ${con}` in alias)) alias[`${m[1]} ${con}`] = i;
    });
    Object.keys(alias).forEach((k) => { if (!(k in this.bayerIdx)) this.bayerIdx[k] = alias[k]; });
    Object.keys(T.stars).forEach((k) => {
      const i = this.starIndex(k);
      if (i >= 0) this.curated[i] = T.stars[k];
    });

    this.cons = Object.keys(CONSTELLATIONS);
    for (const abbr of this.cons) {
      this.lines[abbr] = (raw.lines[abbr] || []).map(toVectors);
      this.bounds[abbr] = (raw.bounds[abbr] || []).map(toVectors);
      this.ringCircles[abbr] = (raw.bounds[abbr] || []).map((ring) => {
        const pts: RaDec[] = [];
        for (let i = 0; i < ring.length; i += 2) pts.push({ ra: ring[i], dec: ring[i + 1] });
        const ec = enclosingCircle(pts), v = vec(ec.ra, ec.dec);
        return [v[0], v[1], v[2], Math.cos((ec.r + 1) * Math.PI / 180)] as [number, number, number, number];
      });
      const fig: RaDec[] = [], bnd: RaDec[] = [];
      for (const l of raw.lines[abbr] || []) for (let i = 0; i < l.length; i += 2) fig.push({ ra: l[i], dec: l[i + 1] });
      for (const r of raw.bounds[abbr] || []) for (let i = 0; i < r.length; i += 6) bnd.push({ ra: r[i], dec: r[i + 1] });
      this.geo[abbr] = { fig: enclosingCircle(fig.length ? fig : bnd), bnd: enclosingCircle(bnd) };
    }
    this.mw = raw.mw.map((m) => ({ l: m.l, rings: m.rings.map(toVectors) }));
    for (const d of DSO) {
      const t = T.dso[d.id];
      this.dsoById[d.id] = { id: d.id, ra: d.ra, dec: d.dec, type: d.type, size: d.size, name: t ? t.name : d.id, label: t && t.label };
    }
  }

  // Лежит ли точка (единичный вектор) внутри уровня Млечного Пути. Считаем, сколько раз дуга
  // от ближайшего полюса Галактики (он заведомо вне Млечного Пути) до точки пересекает края колец.
  mwContains(level: number, px: number, py: number, pz: number): boolean {
    let rx = this.ngp[0], ry = this.ngp[1], rz = this.ngp[2];
    if (rx * px + ry * py + rz * pz < 0) { rx = -rx; ry = -ry; rz = -rz; }
    const n1x = ry * pz - rz * py, n1y = rz * px - rx * pz, n1z = rx * py - ry * px;
    const mx = rx + px, my = ry + py, mz = rz + pz;
    let inside = false;
    const rings = this.mw[level].rings;
    for (let k = 0; k < rings.length; k++) {
      const ring = rings[k], m = ring.length / 3;
      let ax = ring[3 * m - 3], ay = ring[3 * m - 2], az = ring[3 * m - 1];
      let sa = n1x * ax + n1y * ay + n1z * az;
      for (let i = 0; i < m; i++) {
        const bx = ring[3 * i], by = ring[3 * i + 1], bz = ring[3 * i + 2];
        const sb = n1x * bx + n1y * by + n1z * bz;
        if ((sa > 0) !== (sb > 0)) {
          const n2x = ay * bz - az * by, n2y = az * bx - ax * bz, n2z = ax * by - ay * bx;
          if ((n2x * rx + n2y * ry + n2z * rz > 0) !== (n2x * px + n2y * py + n2z * pz > 0)) {
            // Большие круги пересекаются в ±q; дуги пересекаются, если q лежит на обеих.
            const qx = n1y * n2z - n1z * n2y, qy = n1z * n2x - n1x * n2z, qz = n1x * n2y - n1y * n2x;
            if ((qx * mx + qy * my + qz * mz > 0) === (qx * (ax + bx) + qy * (ay + by) + qz * (az + bz) > 0)) inside = !inside;
          }
        }
        ax = bx; ay = by; az = bz; sa = sb;
      }
    }
    return inside;
  }

  starIndex(key: string): number {
    if (key.indexOf('HIP') === 0) { const i = this.hipIdx[+key.slice(3)]; return i === undefined ? -1 : i; }
    const i = this.bayerIdx[key];
    return i === undefined ? -1 : i;
  }

  // Точка по ссылке: звезда, объект каталога или координаты.
  point(ref: PointRef): RaDec | null {
    if (typeof ref !== 'string') return ref;
    const i = this.starIndex(ref);
    if (i >= 0) return { ra: this.ra[i], dec: this.dec[i] };
    const d = this.dsoById[ref];
    return d ? { ra: d.ra, dec: d.dec } : null;
  }

  conName(abbr: string): string { return T.cons[abbr] ? T.cons[abbr].name : abbr; }
  conGen(abbr: string): string { return T.cons[abbr] ? T.cons[abbr].gen : abbr; }
  conLatin(abbr: string): string { return CONSTELLATIONS[abbr][0]; }
  conLatinGen(abbr: string): string { return CONSTELLATIONS[abbr][1]; }
  // Второе название рядом с основным: перевод (если созвездия зовут по-латыни) или латинское.
  conAlt(abbr: string): string { return (T.cons[abbr] && T.cons[abbr].meaning) || this.conLatin(abbr); }

  starName(i: number): string {
    if (this.curated[i]) return this.curated[i];
    const n = this.raw.names[i];
    return (n && n[NAME_FIELD[T.lang]]) || '';
  }
  hasCuratedName(i: number): boolean { return i in this.curated; }
  // Только имена, отобранные для учёбы (без малоизвестных каталожных).
  curatedName(i: number): string { return this.curated[i] || ''; }

  starCon(i: number): string | null {
    const n = this.raw.names[i];
    return n && n[1] ? n[1] : null;
  }

  starLetter(i: number): string {
    const n = this.raw.names[i];
    if (!n) return '';
    if (n[0]) return n[0].replace(/(\D)(\d)$/, (_m, a: string, d: string) => a + (SUP[d] || d));
    return n[3] || '';
  }

  // «α Лиры» (α Lyrae) или «α Lyr»; для звёзд без обозначения — номер HIP.
  starDesig(i: number, latin = false): string {
    const letter = this.starLetter(i), con = this.starCon(i);
    if (!letter || !con) return `HIP ${this.hip[i]}`;
    return `${letter} ${latin ? con : this.conGen(con)}`;
  }

  // Созвездие, в котором лежит точка неба.
  // Многоугольники проецируются с центром в самой точке. Сначала отбрасываем те, чей
  // описанный круг точку не содержит: иначе многоугольник с обратной стороны сферы
  // «выворачивается» при проекции и ложно охватывает точку.
  conAt(ra: number, dec: number, among: string[] = this.cons): string | null {
    const c = vec(ra, dec);
    const e = [-Math.sin(ra * Math.PI / 180), Math.cos(ra * Math.PI / 180), 0];
    const sd = Math.sin(dec * Math.PI / 180), cd = Math.cos(dec * Math.PI / 180);
    const nn = [-sd * Math.cos(ra * Math.PI / 180), -sd * Math.sin(ra * Math.PI / 180), cd];
    for (const abbr of among) {
      const rings = this.bounds[abbr], circles = this.ringCircles[abbr];
      for (let r = 0; r < rings.length; r++) {
        const rc = circles[r];
        if (c[0] * rc[0] + c[1] * rc[1] + c[2] * rc[2] < rc[3]) continue;
        const ring = rings[r];
        const m = ring.length / 3;
        let inside = false, px = 0, py = 0;
        for (let i = 0; i <= m; i++) {
          const j = (i % m) * 3, x = ring[j], y = ring[j + 1], z = ring[j + 2];
          const cosc = x * c[0] + y * c[1] + z * c[2];
          const k = 2 / Math.max(1 + cosc, 0.02);
          const sx = k * (x * e[0] + y * e[1] + z * e[2]), sy = k * (x * nn[0] + y * nn[1] + z * nn[2]);
          if (i > 0 && (py > 0) !== (sy > 0)) {
            const xi = px - py * (sx - px) / (sy - py);
            if (xi > 0) inside = !inside;
          }
          px = sx; py = sy;
        }
        if (inside) return abbr;
      }
    }
    return null;
  }

  // Вид, в который помещаются все точки.
  fit(points: RaDec[], minFov = 30, maxFov = 160) {
    const c = enclosingCircle(points);
    return { ra: norm360(c.ra), dec: c.dec, fov: clamp(c.r * 2 * 1.18 + 8, minFov, maxFov) };
  }
}
