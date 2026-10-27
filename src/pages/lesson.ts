import { D2R, R2D, clamp, cross, dot, enclosingCircle, toRaDec, unit, vec } from '../core/math';
import type { Vec3 } from '../core/math';
import { Sky } from '../core/sky';
import type { Lesson } from '../core/types';
import { BLOCKS, LESSONS, SOUTH_ROUTE } from '../data/lessons';
import { T, fill, fmtMag, setTexts } from '../i18n';
import { zodiacTableHtml } from '../tabs/zodiac';

// Статические страницы уроков: <язык>/lessons/<slug>/. Всё, что после # в адресе приложения, поисковики
// отдельными страницами не считают, поэтому у каждого урока есть ещё и обычная страница: текст урока,
// картинка созвездия с указателями (SVG по тем же данным, что карта) и ссылка в приложение.
// Собирает их tools/build.js в Node, уроки — по северному маршруту.

export { Sky, setTexts, LESSONS, SOUTH_ROUTE };

export interface StaticPage { title: string; description: string; body: string }

export const lessonSlug = (L: Lesson) => L.id.toLowerCase().replace(/_/g, '-');
export const lessonTitle = (sky: Sky, L: Lesson) => (T.lessons[L.id] && T.lessons[L.id].title) || sky.conName(L.cons[0]);

// ---------- картинка ----------

// Ширина 440: на телефоне картинка ~370 px, подписи — не мельче 11 px.
const FW = 440, FH = 330;
const MAG = 5;          // фоновые звёзды — до 5ᵐ
const MIN_FIELD = 30;   // самое крупное увеличение: 30° по ширине (для маленьких созвездий вроде Северной Короны)
const r1 = (x: number) => Math.round(x * 10) / 10;
const pt = (p: number[]) => `${r1(p[0])},${r1(p[1])}`;
const starR = (mag: number) => Math.max(0.6, 3.4 - 0.55 * mag);

interface Box { x0: number; y0: number; x1: number; y1: number }

// Подписи без наложений: следующая встаёт, только если не задевает уже поставленные и не выходит за края.
class Labels {
  private boxes: Box[] = [];
  readonly out: string[] = [];

  place(text: string, x: number, y: number, size: number, anchor: string, attrs: string): boolean {
    const w = text.length * size * 0.56, x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    const b = { x0, y0: y - size * 0.8, x1: x0 + w, y1: y + size * 0.25 };
    if (b.x0 < 2 || b.x1 > FW - 2 || b.y0 < 2 || b.y1 > FH - 2) return false;
    for (const o of this.boxes) if (b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) return false;
    this.boxes.push(b);
    this.out.push(`<text x="${r1(x)}" y="${r1(y)}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${size !== 13 ? ` font-size="${size}"` : ''} ${attrs}>${text}</text>`);
    return true;
  }

  // Подпись звезды: справа, слева, снизу или сверху — где свободно.
  star(text: string, p: number[], r: number, attrs: string) {
    const x = p[0], y = p[1];
    if (!this.place(text, x + r + 4, y + 4.5, 13, 'start', attrs) && !this.place(text, x - r - 4, y + 4.5, 13, 'end', attrs) &&
      !this.place(text, x, y + r + 13, 13, 'middle', attrs)) this.place(text, x, y - r - 5, 13, 'middle', attrs);
  }
}

interface Ptr { kind: string; vs: Vec3[]; label?: string; mid?: number; target?: Vec3 }

// Указатели урока в векторах. 'line' — сразу дуга большого круга от a через b до ближайшей к t точки,
// как на карте (SkyMap.pointerPath).
function pointers(sky: Sky, L: Lesson): Ptr[] {
  const labels = (T.lessons[L.id] && T.lessons[L.id].labels) || [], out: Ptr[] = [];
  (L.pointers || []).forEach((p, k) => {
    const refs = p.line || p.path || p.poly || [];
    const vs: Vec3[] = [];
    for (const r of refs) { const q = sky.point(r); if (q) vs.push(vec(q.ra, q.dec)); }
    if (vs.length !== refs.length) return;
    if (!p.line) { out.push({ kind: p.path ? 'path' : 'poly', vs, label: labels[k] }); return; }
    const A = vs[0], B = vs[1], Tg = vs[2];
    const n = unit(cross(A, B)), ab = dot(A, B);
    const U = unit([B[0] - A[0] * ab, B[1] - A[1] * ab, B[2] - A[2] * ab]);
    const tn = dot(Tg, n);
    const Tp: Vec3 = [Tg[0] - n[0] * tn, Tg[1] - n[1] * tn, Tg[2] - n[2] * tn];
    let end = Math.atan2(dot(Tp, U), dot(Tp, A));
    if (end < 0) end += 2 * Math.PI;
    const abAng = Math.acos(clamp(ab, -1, 1));
    const steps = Math.max(8, Math.ceil(end * R2D / 1.5)), arc: Vec3[] = [];
    for (let i = 0; i <= steps; i++) {
      const th = end * i / steps, c = Math.cos(th), s = Math.sin(th);
      arc.push([A[0] * c + U[0] * s, A[1] * c + U[1] * s, A[2] * c + U[2] * s]);
    }
    out.push({ kind: 'line', vs: arc, label: labels[k], target: Tg, mid: clamp(Math.round(steps * (abAng + (end - abAng) / 2) / end), 0, steps) });
  });
  return out;
}

// Карта урока в той же проекции, что приложение (стереографическая, север сверху, восток слева):
// новые созвездия — голубым, знакомые по прошлым урокам — серым, указатели — жёлтым пунктиром.
function figure(sky: Sky, L: Lesson, known: Record<string, true>): string {
  const ptrs = pointers(sky, L);
  const keyStars = (L.stars || []).map((k) => sky.starIndex(k)).filter((k) => k >= 0);
  const starV = (i: number): Vec3 => [sky.xyz[3 * i], sky.xyz[3 * i + 1], sky.xyz[3 * i + 2]];
  const fit: Vec3[] = [];
  for (const a of L.cons) {
    for (const l of sky.raw.lines[a] || []) for (let i = 0; i < l.length; i += 2) fit.push(vec(l[i], l[i + 1]));
    const cc = sky.raw.cons[a];
    if (cc) fit.push(vec(cc.lx, cc.ly));
  }
  for (const p of ptrs) for (const v of p.vs) fit.push(v);
  for (const i of keyStars) fit.push(starV(i));

  const c = enclosingCircle(fit.map(toRaDec)), c0 = vec(c.ra, c.dec);
  const el = Math.sqrt(c0[0] * c0[0] + c0[1] * c0[1]);
  const east: Vec3 = el > 1e-6 ? [-c0[1] / el, c0[0] / el, 0] : [0, 1, 0];
  const north = cross(c0, east);
  const raw = (v: Vec3) => { const k = 2 / (1 + dot(v, c0)); return [-k * dot(v, east), -k * dot(v, north)]; };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const v of fit) {
    const p = raw(v);
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  }
  // Поля — под подписи у краёв.
  const s = Math.min((FW - 100) / Math.max(x1 - x0, 1e-6), (FH - 50) / Math.max(y1 - y0, 1e-6), FW / (4 * Math.tan(MIN_FIELD / 4 * D2R)));
  const ox = FW / 2 - s * (x0 + x1) / 2, oy = FH / 2 - s * (y0 + y1) / 2;
  const P = (v: Vec3) => { const p = raw(v); return [ox + s * p[0], oy + s * p[1]]; };
  const inFrame = (p: number[], m: number) => p[0] > -m && p[0] < FW + m && p[1] > -m && p[1] < FH + m;
  const out: string[] = [], lab = new Labels();

  // Фоновые звёзды — тремя группами по яркости, чтобы не повторять цвет у каждой. Звёзды отсортированы по яркости.
  const bg = ['', '', ''];
  for (let i = 0; i < sky.n && sky.mag[i] <= MAG; i++) {
    const v = starV(i);
    if (dot(v, c0) < 0.2) continue;
    const p = P(v);
    if (!inFrame(p, -2)) continue;
    bg[sky.mag[i] < 2.5 ? 0 : sky.mag[i] < 4 ? 1 : 2] += `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${r1(starR(sky.mag[i]))}"/>`;
  }
  out.push(`<g fill="#eef4ff">${bg[0]}</g><g fill="#cfd8ff" fill-opacity="0.75">${bg[1]}</g><g fill="#cfd8ff" fill-opacity="0.45">${bg[2]}</g>`);

  // Линии созвездий: сначала знакомые, поверх — новые.
  const focus: Record<string, true> = {};
  for (const a of L.cons) focus[a] = true;
  const linesPath = (a: string) => {
    let d = '';
    for (const l of sky.raw.lines[a] || []) {
      const q: number[][] = [];
      let any = false;
      for (let i = 0; i < l.length; i += 2) {
        const v = vec(l[i], l[i + 1]);
        if (dot(v, c0) < 0) return '';
        const p = P(v);
        if (inFrame(p, 0)) any = true;
        q.push(p);
      }
      if (any) d += 'M' + q.map(pt).join('L');
    }
    return d;
  };
  let dKnown = '', dFocus = '';
  for (const a of sky.cons) if (focus[a]) dFocus += linesPath(a); else if (known[a]) dKnown += linesPath(a);
  if (dKnown) out.push(`<path d="${dKnown}" fill="none" stroke="#96a5d2" stroke-opacity="0.6" stroke-width="1.2" stroke-linejoin="round"/>`);
  out.push(`<path d="${dFocus}" fill="none" stroke="#6ec8ff" stroke-width="2.2" stroke-linejoin="round"/>`);

  // Указатели: пунктир, стрелка на конце; у 'line' — кружок вокруг цели. Подписи указателей ставятся первыми.
  for (const p of ptrs) {
    const q = p.vs.map(P), n = q.length;
    let d = 'M' + pt(q[0]);
    if (p.kind === 'path' && n > 2) {
      // Плавная кривая через точки (Catmull-Rom), как на карте.
      for (let i = 0; i < n - 1; i++) {
        const p0 = q[Math.max(0, i - 1)], a = q[i], b = q[i + 1], p3 = q[Math.min(n - 1, i + 2)];
        d += `C${pt([a[0] + (b[0] - p0[0]) / 6, a[1] + (b[1] - p0[1]) / 6])} ${pt([b[0] - (p3[0] - a[0]) / 6, b[1] - (p3[1] - a[1]) / 6])} ${pt(b)}`;
      }
    } else {
      for (let i = 1; i < n; i++) d += 'L' + pt(q[i]);
    }
    if (p.kind === 'poly') d += 'Z';
    out.push(`<path d="${d}" fill="none" stroke="#ffcf5a" stroke-width="1.8" stroke-dasharray="7 5"/>`);
    if (p.kind !== 'poly') {
      const e = q[n - 1], b = q[Math.max(0, n - 2)], an = Math.atan2(e[1] - b[1], e[0] - b[0]);
      out.push(`<path d="M${pt(e)}L${pt([e[0] - 12 * Math.cos(an - 0.4), e[1] - 12 * Math.sin(an - 0.4)])}L${pt([e[0] - 12 * Math.cos(an + 0.4), e[1] - 12 * Math.sin(an + 0.4)])}Z" fill="#ffcf5a"/>`);
    }
    if (p.target) { const t = P(p.target); out.push(`<circle cx="${r1(t[0])}" cy="${r1(t[1])}" r="11" fill="none" stroke="#ffcf5a" stroke-width="1.8"/>`); }
    if (!p.label) continue;
    let lx = 0, ly = 0;
    if (p.mid !== undefined) { lx = q[p.mid][0]; ly = q[p.mid][1]; } else if (p.kind === 'poly') {
      for (const v of q) { lx += v[0] / n; ly += v[1] / n; }
    } else {
      const a = q[Math.floor((n - 1) / 2)], b = q[Math.ceil((n - 1) / 2)];
      lx = (a[0] + b[0]) / 2; ly = (a[1] + b[1]) / 2;
    }
    lab.place(p.label, lx + 8, ly - 6, 13, 'start', 'fill="#ffd76e" font-weight="600"');
  }

  // Названия новых созвездий, главные звёзды, звёзды указателей, названия знакомых созвездий — по важности.
  const conLabel = (a: string, size: number, attrs: string) => {
    const cc = sky.raw.cons[a];
    if (!cc) return;
    const v = vec(cc.lx, cc.ly);
    if (dot(v, c0) < 0.2) return;
    const p = P(v);
    lab.place(sky.conName(a), p[0], p[1], size, 'middle', attrs);
  };
  for (const a of L.cons) conLabel(a, 15, 'fill="#86d2ff" font-weight="700"');
  const named: Record<number, true> = {};
  for (const i of keyStars) {
    named[i] = true;
    lab.star(sky.curatedName(i) || sky.starLetter(i), P(starV(i)), starR(sky.mag[i]), 'fill="#eef4ff" font-weight="600"');
  }
  for (const p of L.pointers || []) for (const r of p.line || p.path || p.poly || []) {
    const i = typeof r === 'string' ? sky.starIndex(r) : -1;
    if (i < 0 || named[i]) continue;
    named[i] = true;
    const q = P(starV(i));
    if (inFrame(q, 0)) lab.star(sky.curatedName(i) || sky.starLetter(i), q, starR(sky.mag[i]), 'fill="#d7dcf0"');
  }
  for (const a of sky.cons) if (known[a] && !focus[a]) conLabel(a, 11, 'fill="#afb9e1" fill-opacity="0.8" font-weight="600"');

  // Обводка цветом фона — чтобы подписи читались поверх линий.
  out.push(`<g paint-order="stroke" stroke="#080c1d" stroke-width="3" stroke-linejoin="round">${lab.out.join('')}</g>`);
  return `<svg viewBox="0 0 ${FW} ${FH}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" role="img" aria-label="${T.site.figure.replace(/"/g, '&quot;')}">${out.join('')}</svg>`;
}

// ---------- страница ----------

const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// Описание для поисковиков (meta description): начало текста урока, до ~160 знаков, по границе слова.
function cut(s: string, n = 160) {
  if (s.length <= n) return s;
  const k = s.lastIndexOf(' ', n - 1);
  return s.slice(0, k > n / 2 ? k : n - 1).replace(/[\s,;:—–-]+$/, '') + '…';
}

const section = (title: string, body?: string) => (body ? `<section><h2>${title}</h2><p>${body}</p></section>` : '');

export function lessonPage(sky: Sky, i: number): StaticPage {
  const L = LESSONS[i], text = T.lessons[L.id] || {}, ui = T.ui, site = T.site, title = lessonTitle(sky, L);
  const h1 = L.theory ? title : fill(L.cons.length > 1 ? site.titleMany : site.titleOne, { con: title });
  const known: Record<string, true> = {};
  for (let k = 0; k < i; k++) for (const a of LESSONS[k].cons) known[a] = true;

  let h = `<div class="crumb"><a href="../../#program">${site.allLessons}</a> · ${fill(ui.lessonCrumb, { n: i + 1, total: LESSONS.length, block: T.blocks[L.block] })}</div><h1>${h1}</h1>`;
  if (L.cons.length) {
    h += '<div class="con-names">' + L.cons.map((a) =>
      `<div><b>${sky.conName(a)}</b> · <i>${sky.conAlt(a)}</i>, ${ui.gen} <i>${sky.conLatinGen(a)}</i> · ${a}</div>`).join('') + '</div>';
  }
  const cta = `<p class="cta"><a class="btn" href="../../app/#lesson/${L.id}">${site.openMap}</a></p>`;
  let description: string;
  if (L.theory) {
    const html = (text.html || '').replace(/(<(\w+)[^>]*id="zodiac-table"[^>]*>)\s*(<\/\2>)/, (_m, open: string, _tag: string, close: string) =>
      `${open}<div class="tbl-wrap">${zodiacTableHtml(sky)}</div>${close}`);
    h += cta + `<div class="prose">${html}</div>`;
    description = cut(plain(text.html || ''));
  } else {
    h += `<figure class="fig">${figure(sky, L, known)}<figcaption>${site.figure}</figcaption></figure>` + cta;
    h += section(ui.find, text.find) + section(ui.look, text.look);
    const stars = (L.stars || []).map((k) => sky.starIndex(k)).filter((k) => k >= 0);
    if (stars.length) {
      h += `<section><h2>${ui.keyStars}</h2><ul class="rows">` + stars.map((s) =>
        `<li><span class="mag">${fmtMag(sky.mag[s], 1)}</span>${sky.curatedName(s) ? `<b>${sky.curatedName(s)}</b> <span>${sky.starDesig(s)}</span>` : `<b>${sky.starDesig(s)}</b>`}</li>`).join('') + '</ul></section>';
    }
    const dso = (L.dso || []).map((id) => sky.dsoById[id]).filter((d) => !!d);
    if (dso.length) {
      h += `<section><h2>${ui.objects}</h2><ul class="rows">` + dso.map((d) =>
        `<li>${d.name.indexOf(d.label || d.id) === 0 ? `<b>${d.name}</b>` : `<b>${d.label || d.id}</b> <span>${d.name}</span>`}</li>`).join('') + '</ul></section>';
    }
    if (text.facts && text.facts.length) h += `<section><h2>${ui.facts}</h2><ul class="facts">` + text.facts.map((f) => `<li>${f}</li>`).join('') + '</ul></section>';
    description = cut(plain(text.find || ''));
  }
  h += cta;
  const prev = LESSONS[i - 1], next = LESSONS[i + 1];
  h += '<nav class="pager">' +
    (prev ? `<a class="prev" href="../${lessonSlug(prev)}/"><span>${ui.prev}</span>${lessonTitle(sky, prev)}</a>` : '') +
    (next ? `<a class="next" href="../${lessonSlug(next)}/"><span>${ui.next}</span>${lessonTitle(sky, next)}</a>` : '') + '</nav>';
  return { title: h1, description, body: h };
}

// Список всех уроков по блокам — для главной: по нему поисковик находит страницы уроков.
export function programHtml(sky: Sky): string {
  let h = '', n = 0;
  for (const b of BLOCKS) {
    const ls = LESSONS.filter((L) => L.block === b);
    if (!ls.length) continue;
    h += `<div class="blk"><h3>${T.blocks[b]}</h3><ol start="${n + 1}">` +
      ls.map((L) => `<li><a href="lessons/${lessonSlug(L)}/">${lessonTitle(sky, L)}</a></li>`).join('') + '</ol></div>';
    n += ls.length;
  }
  return h;
}
