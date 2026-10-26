import { D2R, R2D, clamp, eclToEq, norm360, sunLongitude, toRaDec, unit, vec, dot, cross, MONTH_SHORT } from './math';
import type { Sky } from './sky';
import type { DsoItem, MapOptions, RaDec, View } from './types';

// Карта неба на canvas. Стереографическая проекция, север сверху, восток слева.
// Сделано так, чтобы не тормозить на слабых телефонах:
//  • звёзды и линии хранятся единичными векторами — проекция без тригонометрии;
//  • звёзды рисуются пачками по цвету (один fill на цвет);
//  • Млечный Путь рисуется в отдельный холст в 1/3 разрешения и растягивается;
//  • если кадры медленные, автоматически снижается плотность пикселей.

export type LineStyle = 'focus' | 'known' | 'faint' | 'hidden';
export interface Pointer { kind: 'line' | 'path' | 'poly'; pts: RaDec[]; label?: string }
export interface Mark { ra: number; dec: number; kind: 'good' | 'bad' | 'ring' | 'info'; label?: string; pulse?: boolean; t0?: number }
export interface MapClick { x: number; y: number; ra: number; dec: number; star: number; dso: DsoItem | null; touch: boolean }

const STAR_COLORS = ['#a4b8ff', '#cbd7ff', '#f1f3ff', '#fff0da', '#ffdcb2', '#ffc590', '#ffad74'];
function colorBucket(bv: number): number {
  return bv < -0.1 ? 0 : bv < 0.2 ? 1 : bv < 0.5 ? 2 : bv < 0.85 ? 3 : bv < 1.2 ? 4 : bv < 1.55 ? 5 : 6;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const LABEL_STYLES: Record<string, [string, string]> = {
  con: [`600 11px ${FONT}`, 'rgba(175,185,225,0.72)'],
  conFocus: [`700 14px ${FONT}`, '#86d2ff'],
  star: [`11px ${FONT}`, 'rgba(215,220,240,0.82)'],
  starFocus: [`600 13px ${FONT}`, '#eef4ff'],
  pointer: [`600 12px ${FONT}`, '#ffd76e'],
  good: [`600 13px ${FONT}`, '#6ee196'],
  bad: [`600 13px ${FONT}`, '#ff8282'],
  dso: [`11px ${FONT}`, 'rgba(170,230,190,0.88)'],
  grid: [`11px ${FONT}`, 'rgba(150,180,240,0.8)'],
  month: [`11px ${FONT}`, 'rgba(255,210,130,0.95)'],
};
const MARK_COLORS: Record<string, string> = { good: '95,211,141', bad: '255,107,107', ring: '255,207,90', info: '110,200,255' };
const MW_SCALE = 3;

// star: [x, y, r] звезды — тогда подпись пробует встать справа, слева, ниже, если место занято.
interface Label { text: string; x: number; y: number; prio: number; style: string; center?: boolean; star?: [number, number, number] }

export class SkyMap {
  view: View = { ra: 0, dec: 90, fov: 100 };
  opt: MapOptions = {
    mw: true, grid: false, ecliptic: false, months: false, bounds: false,
    lines: true, conLabels: true, starLabels: true, dso: true, magLimit: null, mwBoost: 1,
  };
  lineStyle: (abbr: string) => LineStyle = () => 'known';
  conLabelFilter: ((abbr: string) => boolean) | null = null;
  starLabel: (i: number, focus: boolean) => string = () => '';
  boundFocus: Record<string, true> = {};
  labelStars: number[] = [];
  pointers: Pointer[] = [];
  marks: Mark[] = [];
  dso: DsoItem[] = [];
  onclick: ((c: MapClick) => void) | null = null;
  onviewchange: ((v: View) => void) | null = null;

  private readonly sky: Sky;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly mwCanvas: HTMLCanvasElement;
  private readonly mwCtx: CanvasRenderingContext2D;
  private readonly glow: HTMLCanvasElement;
  private readonly buckets: Int32Array[];
  private readonly sx: Float32Array;
  private readonly sy: Float32Array;
  private readonly sr: Float32Array;
  private readonly vis: Uint8Array;
  private w = 0; private h = 0; private dpr = 1;
  private dprCap = 2;
  private magOffset = 0;
  private frameEma = 0;
  private frames = -20; // первые кадры (холодные кэши) не учитываем
  // базис проекции: центр c, восток e, север n
  private c0 = 0; private c1 = 0; private c2 = 1;
  private e0 = 0; private e1 = 1; private e2 = 0;
  private n0 = 1; private n1 = 0; private n2 = 0;
  private cx = 0; private cy = 0; private scale = 1;
  private px = 0; private py = 0; private pc = 0;
  private minCos = 0;
  drawMs = 0;
  private anim: ((now: number) => void) | null = null;
  private queued = false;
  private labels: Label[] = [];
  private textW: Record<string, number> = {};
  private dsoScreen: { d: DsoItem; x: number; y: number; r: number }[] = [];
  private touches: Record<number, { x: number; y: number }> = {};
  private nTouches = 0;

  constructor(canvas: HTMLCanvasElement, sky: Sky) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.sky = sky;
    const n = sky.n;
    this.sx = new Float32Array(n); this.sy = new Float32Array(n);
    this.sr = new Float32Array(n); this.vis = new Uint8Array(n);

    // Пачки звёзд: цвет × (яркая/слабая). Внутри пачки — по убыванию яркости.
    const lists: number[][] = [];
    for (let b = 0; b < STAR_COLORS.length * 2; b++) lists.push([]);
    for (let i = 0; i < n; i++) lists[colorBucket(sky.bv[i]) * 2 + (sky.mag[i] > 5 ? 1 : 0)].push(i);
    this.buckets = lists.map((l) => new Int32Array(l));

    this.mwCanvas = document.createElement('canvas');
    this.mwCtx = this.mwCanvas.getContext('2d')!;
    this.glow = document.createElement('canvas');
    this.glow.width = this.glow.height = 64;
    const g = this.glow.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);

    this.initEvents();
    const RO = (window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (RO) new RO(() => this.resize()).observe(canvas.parentElement!);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------- вид ----------

  setView(v: Partial<View>) {
    this.anim = null;
    this.view = this.normView(v);
    this.redraw();
    if (this.onviewchange) this.onviewchange(this.view);
  }

  flyTo(v: Partial<View>, ms = 650) {
    const from = { ra: this.view.ra, dec: this.view.dec, fov: this.view.fov };
    const to = this.normView(v);
    let dra = to.ra - from.ra;
    if (dra > 180) dra -= 360;
    if (dra < -180) dra += 360;
    const t0 = performance.now();
    this.anim = (now) => {
      const t = clamp((now - t0) / ms, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) * (2 - 2 * t) / 2;
      this.view = {
        ra: norm360(from.ra + dra * e),
        dec: from.dec + (to.dec - from.dec) * e,
        fov: Math.exp(Math.log(from.fov) + (Math.log(to.fov) - Math.log(from.fov)) * e),
      };
      if (t >= 1) { this.anim = null; if (this.onviewchange) this.onviewchange(this.view); }
    };
    this.redraw();
  }

  private normView(v: Partial<View>): View {
    return {
      ra: norm360(v.ra !== undefined ? v.ra : this.view.ra),
      dec: clamp(v.dec !== undefined ? v.dec : this.view.dec, -89.9, 89.9),
      fov: clamp(v.fov !== undefined ? v.fov : this.view.fov, 6, 220),
    };
  }

  zoomBy(f: number) { this.zoomAt(this.w / 2, this.h / 2, f); }

  // ---------- проекция ----------

  private prep() {
    const v = this.view, ra = v.ra * D2R, dec = v.dec * D2R;
    const sr = Math.sin(ra), cr = Math.cos(ra), sd = Math.sin(dec), cd = Math.cos(dec);
    this.c0 = cd * cr; this.c1 = cd * sr; this.c2 = sd;
    this.e0 = -sr; this.e1 = cr; this.e2 = 0;
    this.n0 = -sd * cr; this.n1 = -sd * sr; this.n2 = cd;
    this.cx = this.w / 2; this.cy = this.h / 2;
    this.scale = (Math.min(this.w, this.h) / 2) / (2 * Math.tan(v.fov / 4 * D2R));
    this.minCos = v.fov <= 170 ? 0 : Math.max(-0.5, Math.cos((v.fov / 2 + 8) * D2R));
  }

  private projV(x: number, y: number, z: number) {
    const cosc = x * this.c0 + y * this.c1 + z * this.c2;
    const k = 2 / Math.max(1 + cosc, 1e-4) * this.scale;
    this.px = this.cx - k * (x * this.e0 + y * this.e1 + z * this.e2);
    this.py = this.cy - k * (x * this.n0 + y * this.n1 + z * this.n2);
    this.pc = cosc;
  }

  project(ra: number, dec: number): [number, number, number] {
    const v = vec(ra, dec);
    this.projV(v[0], v[1], v[2]);
    return [this.px, this.py, this.pc];
  }

  unproject(X: number, Y: number): RaDec {
    const x = (this.cx - X) / this.scale, y = (this.cy - Y) / this.scale;
    const rho = Math.sqrt(x * x + y * y);
    if (rho < 1e-9) return { ra: this.view.ra, dec: this.view.dec };
    const c = 2 * Math.atan(rho / 2), sc = Math.sin(c) / rho, cc = Math.cos(c);
    return toRaDec([
      this.c0 * cc + (this.e0 * x + this.n0 * y) * sc,
      this.c1 * cc + (this.e1 * x + this.n1 * y) * sc,
      this.c2 * cc + (this.e2 * x + this.n2 * y) * sc,
    ]);
  }

  private inView(x: number, y: number, m: number) { return x > -m && y > -m && x < this.w + m && y < this.h + m; }

  // Ломаная из векторов; точки дальше ~100° от центра пропускаются (перо поднимается).
  private polyline(ctx: CanvasRenderingContext2D, pts: Float32Array, minCos: number, close = false) {
    let pen = false;
    const m = pts.length / 3, last = close ? m + 1 : m;
    for (let i = 0; i < last; i++) {
      const j = (i % m) * 3;
      this.projV(pts[j], pts[j + 1], pts[j + 2]);
      if (this.pc < minCos) { pen = false; continue; }
      if (pen) ctx.lineTo(this.px, this.py); else { ctx.moveTo(this.px, this.py); pen = true; }
    }
  }

  // Замкнутый многоугольник для заливки: далёкие точки прижимаются к окружности за краем экрана.
  private polygon(ctx: CanvasRenderingContext2D, pts: Float32Array, cosMax: number, rhoMax: number) {
    const m = pts.length / 3, R = rhoMax * this.scale;
    let prevClamped = false, prevAng = 0, ax = 0, ay = 0, az = 0;
    for (let i = 0; i < m; i++) {
      const x = pts[3 * i], y = pts[3 * i + 1], z = pts[3 * i + 2];
      const cosc = x * this.c0 + y * this.c1 + z * this.c2;
      const ux = x * this.e0 + y * this.e1 + z * this.e2, uy = x * this.n0 + y * this.n1 + z * this.n2;
      let X: number, Y: number, clamped = false, ang = 0;
      if (cosc >= cosMax) {
        const k = 2 / (1 + cosc) * this.scale;
        X = this.cx - k * ux; Y = this.cy - k * uy;
      } else {
        ang = Math.atan2(uy, ux); clamped = true;
        X = this.cx - Math.cos(ang) * R; Y = this.cy - Math.sin(ang) * R;
      }
      if (i === 0) ctx.moveTo(X, Y);
      else {
        // Оба конца за краем: идём по окружности, дробя отрезок по сфере, чтобы обойти
        // противоположную точку неба с правильной стороны.
        if (clamped && prevClamped) this.clampedArc(ctx, ax, ay, az, prevAng, x, y, z, ang, R, 0);
        ctx.lineTo(X, Y);
      }
      prevClamped = clamped; prevAng = ang; ax = x; ay = y; az = z;
    }
    ctx.closePath();
  }

  private clampedArc(ctx: CanvasRenderingContext2D, ax: number, ay: number, az: number, angA: number,
    bx: number, by: number, bz: number, angB: number, R: number, depth: number) {
    let da = angB - angA;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) < 0.35 || depth > 12) {
      const steps = Math.floor(Math.abs(da) / 0.12);
      for (let s = 1; s <= steps; s++) {
        const a = angA + da * s / (steps + 1);
        ctx.lineTo(this.cx - Math.cos(a) * R, this.cy - Math.sin(a) * R);
      }
      return;
    }
    let mx = ax + bx, my = ay + by, mz = az + bz;
    const l = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
    mx /= l; my /= l; mz /= l;
    const angM = Math.atan2(mx * this.n0 + my * this.n1 + mz * this.n2, mx * this.e0 + my * this.e1 + mz * this.e2);
    this.clampedArc(ctx, ax, ay, az, angA, mx, my, mz, angM, R, depth + 1);
    ctx.lineTo(this.cx - Math.cos(angM) * R, this.cy - Math.sin(angM) * R);
    this.clampedArc(ctx, mx, my, mz, angM, bx, by, bz, angB, R, depth + 1);
  }

  // ---------- отрисовка ----------

  redraw() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame((now) => {
      this.queued = false;
      if (this.anim) this.anim(now);
      this.draw(now);
      let pulsing = false;
      for (const m of this.marks) if (m.pulse) pulsing = true;
      if (this.anim || pulsing) this.redraw();
    });
  }

  resize() {
    const el = this.canvas.parentElement!;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.mwCanvas.width = Math.ceil(w / MW_SCALE);
    this.mwCanvas.height = Math.ceil(h / MW_SCALE);
    this.redraw();
  }

  draw(now = performance.now()) {
    if (!this.w) return;
    const t0 = performance.now();
    const ctx = this.ctx, o = this.opt;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.prep();
    ctx.fillStyle = '#080c1d';
    ctx.fillRect(0, 0, this.w, this.h);

    if (o.mw) this.drawMilkyWay();
    if (o.grid) this.drawGrid();
    if (o.ecliptic) this.drawEcliptic();
    this.drawBounds();
    if (o.lines) this.drawLines();
    if (o.dso) this.drawDso(); else this.dsoScreen = [];
    this.drawStars();
    this.drawPointers();
    this.drawMarks(now);
    this.drawLabels();
    this.adapt(performance.now() - t0);
  }

  // Если кадры дольше ~30 мс — уменьшаем плотность пикселей, потом число слабых звёзд.
  private adapt(ms: number) {
    this.frames++;
    if (this.frames <= 0) return;
    this.frameEma = this.frames > 1 ? this.frameEma * 0.85 + ms * 0.15 : ms;
    this.drawMs = this.frameEma;
    if (this.frames < 12 || this.frameEma < 30) return;
    this.frames = 0;
    if (this.dprCap > 1 && (window.devicePixelRatio || 1) > 1) {
      this.dprCap = this.dprCap > 1.5 ? 1.5 : 1;
      this.resize();
    } else if (this.magOffset > -1.2) {
      this.magOffset -= 0.4;
    }
  }

  private drawMilkyWay() {
    const m = this.mwCtx, k = 1 / MW_SCALE;
    m.setTransform(k, 0, 0, k, 0, 0);
    m.clearRect(0, 0, this.w, this.h);
    const theta = clamp(this.view.fov * 0.75 + 30, 100, 170) * D2R;
    const cosMax = Math.cos(theta), rhoMax = 2 * Math.tan(theta / 2);
    m.fillStyle = `rgba(150,170,230,${0.036 * this.opt.mwBoost})`;
    // Если точка, противоположная центру экрана, лежит внутри области, то в стереографической
    // проекции область уходит «в бесконечность» и заливка evenodd получается вывернутой.
    // Тогда добавляем большой прямоугольник — он меняет «внутри» и «снаружи» местами.
    const R = rhoMax * this.scale + 50;
    for (let li = 0; li < this.sky.mw.length; li++) {
      m.beginPath();
      for (const ring of this.sky.mw[li].rings) this.polygon(m, ring, cosMax, rhoMax);
      if (this.sky.mwContains(li, -this.c0, -this.c1, -this.c2)) m.rect(this.cx - R, this.cy - R, 2 * R, 2 * R);
      m.fill('evenodd');
    }
    this.ctx.drawImage(this.mwCanvas, 0, 0, this.w, this.h);
  }

  private drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(110,140,210,0.22)';
    ctx.lineWidth = 1;
    const g = gridCache();
    ctx.beginPath();
    for (const p of g.parallels) this.polyline(ctx, p, -0.2, true);
    for (const p of g.meridians) this.polyline(ctx, p, -0.2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,170,255,0.5)';
    ctx.beginPath();
    this.polyline(ctx, g.equator, -0.2, true);
    ctx.stroke();

    const d0 = this.view.dec;
    const labDec = Math.abs(d0) > 55 ? clamp(Math.round(d0 / 10) * 10, -70, 70) : 0;
    for (let h = 0; h < 24; h++) {
      const [x, y, c] = this.project(h * 15, labDec + 2);
      if (c > 0.2 && this.inView(x, y, -12)) this.labels.push({ text: `${h}ч`, x, y, prio: 6, style: 'grid', center: true });
    }
    const labRa = Math.round(this.view.ra / 15) * 15 + 4;
    for (let dec = -80; dec <= 80; dec += 10) {
      const [x, y, c] = this.project(labRa, dec);
      if (c > 0.2 && this.inView(x, y, -12)) this.labels.push({ text: `${dec > 0 ? '+' : dec < 0 ? '−' : ''}${Math.abs(dec)}°`, x, y: y - 7, prio: 6, style: 'grid', center: true });
    }
  }

  private drawEcliptic() {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,190,90,0.65)';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    this.polyline(ctx, gridCache().ecliptic, -0.2, true);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!this.opt.months) return;
    const year = new Date().getFullYear();
    ctx.fillStyle = 'rgba(255,200,100,0.95)';
    for (let mo = 0; mo < 12; mo++) {
      const e = eclToEq(sunLongitude(new Date(Date.UTC(year, mo, 1))));
      const [x, y, c] = this.project(e.ra, e.dec);
      if (c < 0 || !this.inView(x, y, 0)) continue;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
      this.labels.push({ text: `1 ${MONTH_SHORT[mo]}`, x, y: y + 13, prio: 1, style: 'month', center: true });
    }
  }

  private drawBounds() {
    const focusList = Object.keys(this.boundFocus);
    if (!this.opt.bounds && !focusList.length) return;
    const ctx = this.ctx;
    ctx.setLineDash([3, 4]);
    if (this.opt.bounds) {
      ctx.strokeStyle = 'rgba(140,150,190,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const abbr of this.sky.cons) {
        if (this.boundFocus[abbr]) continue;
        for (const ring of this.sky.bounds[abbr]) this.polyline(ctx, ring, -0.2, true);
      }
      ctx.stroke();
    }
    if (focusList.length) {
      ctx.strokeStyle = 'rgba(255,205,110,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const abbr of focusList) for (const ring of this.sky.bounds[abbr] || []) this.polyline(ctx, ring, -0.2, true);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private drawLines() {
    const ctx = this.ctx;
    const groups: Record<string, string[]> = { faint: [], known: [], focus: [] };
    for (const abbr of this.sky.cons) {
      const s = this.lineStyle(abbr);
      if (s !== 'hidden') groups[s].push(abbr);
    }
    const styles: [string, string, number][] = [
      ['faint', 'rgba(130,145,190,0.25)', 1], ['known', 'rgba(150,165,210,0.55)', 1.2], ['focus', 'rgba(110,200,255,0.95)', 2.2],
    ];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [name, color, width] of styles) {
      if (!groups[name].length) continue;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const abbr of groups[name]) for (const line of this.sky.lines[abbr]) this.polyline(ctx, line, this.minCos);
      ctx.stroke();
    }
  }

  private drawDso() {
    const ctx = this.ctx;
    this.dsoScreen = [];
    if (!this.dso.length) return;
    ctx.strokeStyle = 'rgba(170,230,190,0.75)';
    ctx.lineWidth = 1.1;
    for (const d of this.dso) {
      const [x, y, c] = this.project(d.ra, d.dec);
      if (c < this.minCos || !this.inView(x, y, 20)) continue;
      const r = d.size ? Math.max(4, d.size / 2 * D2R * this.scale) : 4.5;
      ctx.beginPath();
      if (d.type === 'gal') ctx.ellipse(x, y, r * 1.5, r * 0.7, -0.5, 0, Math.PI * 2);
      else if (d.type === 'gc') {
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
      } else if (d.type === 'oc') { ctx.setLineDash([2, 2]); ctx.arc(x, y, r, 0, Math.PI * 2); }
      else if (d.type === 'pt') { ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); }
      else if (d.type === 'pn') { ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      else ctx.rect(x - r, y - r, 2 * r, 2 * r);
      ctx.stroke();
      ctx.setLineDash([]);
      this.dsoScreen.push({ d, x, y, r });
    }
  }

  get quality() { return { dpr: this.dpr, magOffset: this.magOffset }; }

  magLimit(): number {
    const base = this.opt.magLimit !== null ? this.opt.magLimit : (() => {
      const f = this.view.fov;
      return f > 150 ? 4.6 : f > 100 ? 5.2 : f > 60 ? 5.7 : 6.1;
    })();
    return base + this.magOffset;
  }

  private drawStars() {
    const ctx = this.ctx, sky = this.sky, xyz = sky.xyz, mag = sky.mag;
    const lim = this.magLimit(), w = this.w, h = this.h;
    const zoom = clamp(Math.pow(70 / this.view.fov, 0.3), 0.7, 1.6);
    const vis = this.vis;
    for (let i = 0; i < vis.length; i++) vis[i] = 0;
    for (let b = 0; b < this.buckets.length; b++) {
      const list = this.buckets[b];
      if (!list.length) continue;
      ctx.fillStyle = STAR_COLORS[b >> 1];
      ctx.globalAlpha = b & 1 ? 0.72 : 1;
      ctx.beginPath();
      for (let k = 0; k < list.length; k++) {
        const i = list[k], m = mag[i];
        if (m > lim) break;
        this.projV(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]);
        if (this.pc < this.minCos) continue;
        const x = this.px, y = this.py;
        if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
        const r = (0.5 + Math.max(0, 6.4 - m) * 0.62) * zoom;
        this.sx[i] = x; this.sy[i] = y; this.sr[i] = r; this.vis[i] = 1;
        if (r < 1.1) ctx.rect(x - r, y - r, 2 * r, 2 * r);
        else { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      }
      ctx.fill();
    }
    // Ореол у ярчайших звёзд — готовой картинкой (дешевле градиента на каждую звезду).
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < sky.n && mag[i] < 1.6; i++) {
      if (!this.vis[i]) continue;
      const R = this.sr[i] * 3.4;
      ctx.drawImage(this.glow, this.sx[i] - R, this.sy[i] - R, 2 * R, 2 * R);
    }
    ctx.globalAlpha = 1;
  }

  // Экранные точки указателя. 'line' — большой круг от a через b до ближайшей к t точки.
  private pointerPath(p: Pointer): { pts: [number, number, number][]; labelAt: [number, number] | null; closed: boolean } {
    if (p.kind === 'line') {
      const A = vec(p.pts[0].ra, p.pts[0].dec), B = vec(p.pts[1].ra, p.pts[1].dec), T = vec(p.pts[2].ra, p.pts[2].dec);
      const n = unit(cross(A, B)), ab = dot(A, B);
      const U = unit([B[0] - A[0] * ab, B[1] - A[1] * ab, B[2] - A[2] * ab]);
      const tn = dot(T, n);
      const Tp: [number, number, number] = [T[0] - n[0] * tn, T[1] - n[1] * tn, T[2] - n[2] * tn];
      let end = Math.atan2(dot(Tp, U), dot(Tp, A));
      if (end < 0) end += 2 * Math.PI;
      const abAng = Math.acos(clamp(ab, -1, 1));
      const steps = Math.max(8, Math.ceil(end * R2D / 1.5));
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const th = end * i / steps, c = Math.cos(th), s = Math.sin(th);
        this.projV(A[0] * c + U[0] * s, A[1] * c + U[1] * s, A[2] * c + U[2] * s);
        pts.push([this.px, this.py, this.pc]);
      }
      const mid = pts[clamp(Math.round(steps * (abAng + (end - abAng) / 2) / end), 0, steps)];
      return { pts, labelAt: [mid[0], mid[1]], closed: false };
    }
    return { pts: p.pts.map((q) => this.project(q.ra, q.dec)), labelAt: null, closed: p.kind === 'poly' };
  }

  private drawPointers() {
    const ctx = this.ctx;
    for (const p of this.pointers) {
      const { pts, labelAt, closed } = this.pointerPath(p);
      let behind = false;
      for (const q of pts) if (q[2] < -0.1) behind = true;
      if (behind) continue;
      ctx.strokeStyle = ctx.fillStyle = '#ffcf5a';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      if (p.kind === 'path' && pts.length > 2) {
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
          ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
            p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
        }
      } else {
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      }
      if (closed) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      if (!closed) {
        const e = pts[pts.length - 1], q = pts[Math.max(0, pts.length - 2)];
        const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
        ctx.beginPath();
        ctx.moveTo(e[0], e[1]);
        ctx.lineTo(e[0] - 12 * Math.cos(a - 0.4), e[1] - 12 * Math.sin(a - 0.4));
        ctx.lineTo(e[0] - 12 * Math.cos(a + 0.4), e[1] - 12 * Math.sin(a + 0.4));
        ctx.closePath();
        ctx.fill();
      }
      if (p.kind === 'line') {
        const [x, y] = this.project(p.pts[2].ra, p.pts[2].dec);
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
      }
      if (p.label) {
        let lx: number, ly: number;
        if (labelAt) { lx = labelAt[0]; ly = labelAt[1]; } else if (closed) {
          lx = 0; ly = 0;
          for (const q of pts) { lx += q[0] / pts.length; ly += q[1] / pts.length; }
        } else {
          const a = pts[Math.floor((pts.length - 1) / 2)], b = pts[Math.ceil((pts.length - 1) / 2)];
          lx = (a[0] + b[0]) / 2; ly = (a[1] + b[1]) / 2;
        }
        this.labels.push({ text: p.label, x: lx + 8, y: ly - 9, prio: 0, style: 'pointer' });
      }
    }
  }

  private drawMarks(now: number) {
    const ctx = this.ctx;
    for (const m of this.marks) {
      const [x, y, c] = this.project(m.ra, m.dec);
      if (c < 0) continue;
      let r = 13, a = 0.95;
      if (m.pulse) { const t = ((now - (m.t0 || 0)) % 1400) / 1400; r = 9 + t * 20; a = 1 - t; }
      ctx.strokeStyle = `rgba(${MARK_COLORS[m.kind]},${a})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      if (m.label) this.labels.push({ text: m.label, x: x + 17, y: y - 13, prio: 0, style: m.kind === 'bad' ? 'bad' : m.kind === 'good' ? 'good' : 'pointer' });
    }
  }

  private measure(font: string, text: string): number {
    const key = font + '|' + text;
    let w = this.textW[key];
    if (w === undefined) { this.ctx.font = font; w = this.textW[key] = this.ctx.measureText(text).width; }
    return w;
  }

  private drawLabels() {
    const labels = this.labels, o = this.opt, sky = this.sky;
    this.labels = [];
    if (o.conLabels) {
      for (const abbr of sky.cons) {
        if (this.conLabelFilter && !this.conLabelFilter(abbr)) continue;
        const c = sky.raw.cons[abbr], focus = this.lineStyle(abbr) === 'focus';
        const spots: [number, number][] = [[c.lx, c.ly]];
        if (c.extra) spots.push(c.extra);
        for (const s of spots) {
          const [x, y, cc] = this.project(s[0], s[1]);
          if (cc > this.minCos + 0.1 && this.inView(x, y, -20)) labels.push({ text: sky.conName(abbr), x, y, prio: focus ? 1 : 4, style: focus ? 'conFocus' : 'con', center: true });
        }
      }
    }
    if (o.starLabels) {
      const f = this.view.fov;
      const brightLim = f > 150 ? 0.6 : f > 100 ? 1.3 : f > 60 ? 2.1 : 2.9;
      for (const i of this.labelStars) {
        if (this.vis[i]) labels.push({ text: this.starLabel(i, true), x: this.sx[i] + this.sr[i] + 4, y: this.sy[i] - this.sr[i] - 3, prio: 2, style: 'starFocus', star: [this.sx[i], this.sy[i], this.sr[i]] });
      }
      for (let i = 0; i < sky.n && sky.mag[i] <= brightLim; i++) {
        if (!this.vis[i] || this.labelStars.indexOf(i) >= 0) continue;
        const t = this.starLabel(i, false);
        if (t) labels.push({ text: t, x: this.sx[i] + this.sr[i] + 3, y: this.sy[i] - this.sr[i] - 2, prio: 3, style: 'star', star: [this.sx[i], this.sy[i], this.sr[i]] });
      }
    }
    if (o.dso) for (const s of this.dsoScreen) labels.push({ text: s.d.label || s.d.id, x: s.x + s.r + 3, y: s.y + s.r + 5, prio: s.d.type === 'pt' ? 2 : 5, style: 'dso' });

    labels.sort((a, b) => a.prio - b.prio);
    const placed: number[] = [];
    const ctx = this.ctx;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8,12,29,0.85)';
    let curFont = '';
    for (const l of labels) {
      if (!l.text) continue;
      const [font, color] = LABEL_STYLES[l.style];
      const w = this.measure(font, l.text), hh = 14;
      // Варианты положения: обычное; для звёзд ещё слева, справа-снизу, слева-снизу.
      const spots: [number, number][] = [[l.center ? l.x - w / 2 : l.x, l.y]];
      if (l.star) {
        const [sx, sy, sr] = l.star;
        spots.push([sx - sr - 4 - w, sy - sr - 3], [sx + sr + 4, sy + sr + 8], [sx - sr - 4 - w, sy + sr + 8]);
      }
      let x0 = 0, ly = 0, ok = false;
      for (const sp of spots) {
        x0 = sp[0]; ly = sp[1];
        const y0 = ly - hh / 2;
        let hit = !!l.star && (x0 < 2 || x0 + w > this.w - 2);
        if (!hit && l.prio > 0) {
          for (let k = 0; k < placed.length; k += 4) {
            if (x0 < placed[k + 2] && x0 + w > placed[k] && y0 < placed[k + 3] && y0 + hh > placed[k + 1]) { hit = true; break; }
          }
        }
        if (!hit) { ok = true; break; }
      }
      if (!ok) continue;
      placed.push(x0, ly - hh / 2, x0 + w, ly + hh / 2);
      if (font !== curFont) { ctx.font = font; curFont = font; }
      ctx.strokeText(l.text, x0, ly);
      ctx.fillStyle = color;
      ctx.fillText(l.text, x0, ly);
    }
  }

  // ---------- поиск под пальцем ----------

  starAt(x: number, y: number, maxDist = 14): number {
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < this.sky.n; i++) {
      if (!this.vis[i]) continue;
      const dx = this.sx[i] - x, dy = this.sy[i] - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxDist + this.sr[i]) continue;
      const score = d - (6.5 - this.sky.mag[i]) * 1.2;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  screenOfStar(i: number): [number, number] | null {
    if (!this.vis[i]) return null;
    return [this.sx[i], this.sy[i]];
  }

  private dsoAt(x: number, y: number): DsoItem | null {
    for (const s of this.dsoScreen) if (Math.abs(s.x - x) + Math.abs(s.y - y) < Math.max(12, s.r + 4)) return s.d;
    return null;
  }

  // ---------- мышь, колесо, пальцы ----------

  // Pointer Events есть только с Chrome 55. В старом Chrome (Android 5–6) — touch- и mouse-события.
  private initEvents() {
    const c = this.canvas;
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const local = (cx: number, cy: number) => {
      const r = c.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };
    const down = (id: number, cx: number, cy: number) => {
      const p = local(cx, cy);
      if (!this.touches[id]) this.nTouches++;
      this.touches[id] = p;
      drag = this.nTouches === 1 ? { x: p.x, y: p.y, moved: false } : null;
    };
    const move = (id: number, cx: number, cy: number) => {
      const prev = this.touches[id];
      if (!prev) return;
      const p = local(cx, cy);
      if (this.nTouches === 2) {
        const ids = Object.keys(this.touches);
        const a0 = this.touches[+ids[0]], b0 = this.touches[+ids[1]];
        const d0 = Math.sqrt((a0.x - b0.x) * (a0.x - b0.x) + (a0.y - b0.y) * (a0.y - b0.y));
        this.touches[id] = p;
        const a1 = this.touches[+ids[0]], b1 = this.touches[+ids[1]];
        const d1 = Math.sqrt((a1.x - b1.x) * (a1.x - b1.x) + (a1.y - b1.y) * (a1.y - b1.y));
        if (d0 > 0 && d1 > 0) this.zoomAt((a1.x + b1.x) / 2, (a1.y + b1.y) / 2, d0 / d1);
        return;
      }
      this.touches[id] = p;
      if (!drag) return;
      if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 6) drag.moved = true;
      if (drag.moved) this.panBy(p.x - prev.x, p.y - prev.y);
    };
    const up = (id: number, cx: number, cy: number, touch: boolean, cancel: boolean) => {
      if (!this.touches[id]) return;
      delete this.touches[id];
      this.nTouches = Math.max(0, this.nTouches - 1);
      if (drag && !drag.moved && !cancel && this.onclick) {
        const p = local(cx, cy);
        this.prep();
        const rd = this.unproject(p.x, p.y);
        this.onclick({ x: p.x, y: p.y, ra: rd.ra, dec: rd.dec, star: this.starAt(p.x, p.y, touch ? 22 : 14), dso: this.dsoAt(p.x, p.y), touch });
      }
      if (this.nTouches === 0) drag = null;
    };

    if ((window as unknown as { PointerEvent?: unknown }).PointerEvent) {
      c.addEventListener('pointerdown', (e) => {
        try { c.setPointerCapture(e.pointerId); } catch (_) { /* не критично */ }
        down(e.pointerId, e.clientX, e.clientY);
      });
      c.addEventListener('pointermove', (e) => move(e.pointerId, e.clientX, e.clientY));
      c.addEventListener('pointerup', (e) => up(e.pointerId, e.clientX, e.clientY, e.pointerType === 'touch', false));
      c.addEventListener('pointercancel', (e) => up(e.pointerId, e.clientX, e.clientY, true, true));
    } else {
      const eachTouch = (e: TouchEvent, fn: (t: Touch) => void) => {
        e.preventDefault(); // без этого браузер прокручивает страницу и шлёт лишние mouse-события
        for (let i = 0; i < e.changedTouches.length; i++) fn(e.changedTouches[i]);
      };
      c.addEventListener('touchstart', (e) => eachTouch(e, (t) => down(t.identifier, t.clientX, t.clientY)));
      c.addEventListener('touchmove', (e) => eachTouch(e, (t) => move(t.identifier, t.clientX, t.clientY)));
      c.addEventListener('touchend', (e) => eachTouch(e, (t) => up(t.identifier, t.clientX, t.clientY, true, false)));
      c.addEventListener('touchcancel', (e) => eachTouch(e, (t) => up(t.identifier, t.clientX, t.clientY, true, true)));
      c.addEventListener('mousedown', (e) => {
        down(-1, e.clientX, e.clientY);
        const mm = (ev: MouseEvent) => move(-1, ev.clientX, ev.clientY);
        const mu = (ev: MouseEvent) => {
          up(-1, ev.clientX, ev.clientY, false, false);
          window.removeEventListener('mousemove', mm);
          window.removeEventListener('mouseup', mu);
        };
        window.addEventListener('mousemove', mm);
        window.addEventListener('mouseup', mu);
      });
    }
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(clamp(e.deltaY, -120, 120) * 0.0018));
    }, { passive: false } as AddEventListenerOptions);
  }

  private panBy(dx: number, dy: number) {
    this.anim = null;
    this.prep();
    const k = R2D / this.scale, v = this.view;
    v.dec = clamp(v.dec + dy * k, -89.9, 89.9);
    v.ra = norm360(v.ra + dx * k / Math.max(0.15, Math.cos(v.dec * D2R)));
    this.redraw();
    if (this.onviewchange) this.onviewchange(v);
  }

  private zoomAt(x: number, y: number, f: number) {
    this.anim = null;
    this.prep();
    const g = this.unproject(x, y);
    this.view.fov = clamp(this.view.fov * f, 6, 220);
    this.prep();
    const [nx, ny] = this.project(g.ra, g.dec);
    this.panBy(x - nx, y - ny);
  }
}

function flatToVec(flat: number[]): Float32Array {
  const n = flat.length / 2, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = vec(flat[2 * i], flat[2 * i + 1]);
    out[3 * i] = v[0]; out[3 * i + 1] = v[1]; out[3 * i + 2] = v[2];
  }
  return out;
}

let GRID: { parallels: Float32Array[]; meridians: Float32Array[]; equator: Float32Array; ecliptic: Float32Array } | null = null;
function gridCache() {
  if (GRID) return GRID;
  const parallels: Float32Array[] = [], meridians: Float32Array[] = [];
  for (let dec = -80; dec <= 80; dec += 10) {
    if (dec === 0) continue;
    const pts: number[] = [];
    for (let ra = 0; ra < 360; ra += 3) pts.push(ra, dec);
    parallels.push(flatToVec(pts));
  }
  for (let h = 0; h < 24; h++) {
    const pts: number[] = [];
    for (let dec = -88; dec <= 88; dec += 4) pts.push(h * 15, dec);
    meridians.push(flatToVec(pts));
  }
  const eq: number[] = [], ecl: number[] = [];
  for (let ra = 0; ra < 360; ra += 3) eq.push(ra, 0);
  for (let l = 0; l < 360; l += 2) { const e = eclToEq(l); ecl.push(e.ra, e.dec); }
  GRID = { parallels, meridians, equator: flatToVec(eq), ecliptic: flatToVec(ecl) };
  return GRID;
}
