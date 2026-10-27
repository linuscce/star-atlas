// Проверка данных уроков и текстов (npm test): уроки, звёзды, объекты, указатели, переводы.
import { Sky } from '../src/core/sky';
import { eclToEq, norm360, sunLongitude, vec, visibility } from '../src/core/math';
import { sunCon, sunRA } from '../src/core/sun';
import type { SkyRaw, TaskLevel, TaskTopic } from '../src/core/types';
import { CONSTELLATIONS } from '../src/data/constellations';
import { DSO } from '../src/data/dso';
import { BLOCKS, LESSONS, SOUTH_BLOCKS, SOUTH_ROUTE } from '../src/data/lessons';
import { ECLIPTIC, MILKY_WAY, NEAR_ECLIPTIC, NOT_MILKY_WAY } from '../src/data/sky-facts';
import { CITIES, SOLVED } from '../src/data/tasks';
import type { SolvedTask } from '../src/data/tasks';
import { setTexts } from '../src/i18n';
import type { SouthTexts, Texts } from '../src/i18n/types';
import { GENERATORS, generate } from '../src/tasks/generate';
import type { Scope } from '../src/tasks/generate';

declare const require: (m: string) => unknown;
declare const process: { exitCode: number };
const { loadTexts } = require('./texts') as { loadTexts: () => { langs: string[]; texts: Record<string, Texts>; south: Record<string, SouthTexts>; errors: string[]; warnings: string[] } };
const g = globalThis as unknown as { window: { SKY: SkyRaw } };
g.window = {} as { SKY: SkyRaw };
require('../public/sky.js');
let errors = 0;
const err = (m: string) => { errors++; console.log('ОШИБКА:', m); };

const loaded = loadTexts();
for (const w of loaded.warnings) console.log('Внимание:', w);
for (const e of loaded.errors) err(e);
setTexts(loaded.texts.ru);
const sky = new Sky(g.window.SKY);

// 1. Все 88 созвездий — ровно в одном уроке.
const seen: Record<string, string> = {};
for (const L of LESSONS) for (const c of L.cons) {
  if (!CONSTELLATIONS[c]) err(`урок ${L.id}: неизвестное созвездие ${c}`);
  if (seen[c]) err(`созвездие ${c} в двух уроках: ${seen[c]} и ${L.id}`);
  seen[c] = L.id;
}
const missing = Object.keys(CONSTELLATIONS).filter((c) => !seen[c]);
if (missing.length) err(`созвездия без урока: ${missing.join(', ')}`);
console.log(`Созвездий в уроках: ${Object.keys(seen).length} из ${Object.keys(CONSTELLATIONS).length}`);

// 2. Звёзды, объекты и указатели находятся.
const dsoIds: Record<string, true> = {};
for (const d of DSO) dsoIds[d.id] = true;
for (const L of LESSONS) {
  if (BLOCKS.indexOf(L.block) < 0) err(`урок ${L.id}: неизвестный блок ${L.block}`);
  for (const k of L.stars || []) {
    const i = sky.starIndex(k);
    if (i < 0) err(`урок ${L.id}: нет звезды ${k}`);
    else if (L.cons.length && sky.starCon(i) && L.cons.indexOf(sky.starCon(i)!) < 0 && k !== 'α And') err(`урок ${L.id}: звезда ${k} из другого созвездия (${sky.starCon(i)})`);
  }
  for (const id of L.dso || []) if (!dsoIds[id]) err(`урок ${L.id}: нет объекта ${id}`);
  for (const p of L.pointers || []) for (const r of p.line || p.path || p.poly || []) if (!sky.point(r)) err(`урок ${L.id}: указатель на ${JSON.stringify(r)}`);
}

// 3. Тексты на каждом языке: у каждого урока, созвездия, звезды и объекта.
for (const lang of loaded.langs) {
  const t = loaded.texts[lang];
  for (const b of BLOCKS) if (!t.blocks[b]) err(`${lang}: нет названия блока ${b}`);
  for (const L of LESSONS) {
    const x = t.lessons[L.id];
    if (!x) { err(`${lang}: нет текстов урока ${L.id}`); continue; }
    if (L.theory ? !x.html : !x.find || !x.look) err(`${lang}: урок ${L.id} без ${L.theory ? 'html' : 'find/look'}`);
    if (L.cons.length !== 1 && !x.title) err(`${lang}: урок ${L.id} без названия (title)`);
    const n = (L.pointers || []).length, m = (x.labels || []).length;
    if (n !== m) err(`${lang}: урок ${L.id}: указателей ${n}, подписей ${m}`);
  }
  for (const id of Object.keys(t.lessons)) if (!LESSONS.some((L) => L.id === id)) err(`${lang}: тексты для несуществующего урока ${id}`);
  for (const c of Object.keys(CONSTELLATIONS)) if (!t.cons[c] || !t.cons[c].name || !t.cons[c].gen) err(`${lang}: нет названия созвездия ${c}`);
  for (const k of Object.keys(t.stars)) if (sky.starIndex(k) < 0) err(`${lang}: имя для несуществующей звезды ${k}`);
  for (const d of DSO) if (!t.dso[d.id] || !t.dso[d.id].name) err(`${lang}: нет названия объекта ${d.id}`);
  for (const id of Object.keys(t.dso)) if (!dsoIds[id]) err(`${lang}: название для несуществующего объекта ${id}`);
}
console.log(`Языки: ${loaded.langs.join(', ')}`);

// 3а. Южный маршрут: те же уроки в другом порядке, блоки идут подряд, указатели — от уже знакомого:
// созвездия, пройденного раньше, или звезды, к которой уже приводил указатель.
const byId: Record<string, (typeof LESSONS)[number]> = {};
for (const L of LESSONS) byId[L.id] = L;
const inRoute: Record<string, number> = {};
let lastBlock = 0;
const knownSouth: Record<string, true> = {}, reached: Record<string, true> = {};
for (const st of SOUTH_ROUTE) {
  const L = byId[st.id];
  if (!L) { err(`южный маршрут: нет урока ${st.id}`); continue; }
  inRoute[st.id] = (inRoute[st.id] || 0) + 1;
  const b = SOUTH_BLOCKS.indexOf(st.block);
  if (b < 0) err(`южный маршрут: урок ${st.id} в неизвестном блоке ${st.block}`);
  else if (b < lastBlock) err(`южный маршрут: урок ${st.id} (блок ${st.block}) после уроков следующего блока`);
  else lastBlock = b;
  for (const p of st.pointers || L.pointers || []) {
    const pts = p.line || p.path || p.poly || [];
    for (const r of pts) if (!sky.point(r)) err(`южный маршрут, урок ${st.id}: указатель на ${JSON.stringify(r)}`);
    const i = typeof pts[0] === 'string' ? sky.starIndex(pts[0]) : -1, c = i >= 0 ? sky.starCon(i) : null;
    if (c && !knownSouth[c] && L.cons.indexOf(c) < 0 && !reached[pts[0] as string]) err(`южный маршрут, урок ${st.id}: указатель начинается с ${pts[0]} — созвездие ${c} ещё не пройдено`);
    for (const r of pts) if (typeof r === 'string') reached[r] = true;
  }
  for (const c of L.cons) knownSouth[c] = true;
}
for (const L of LESSONS) if (inRoute[L.id] !== 1) err(`южный маршрут: урок ${L.id} встречается ${inRoute[L.id] || 0} раз`);
for (const b of SOUTH_BLOCKS) if (!SOUTH_ROUTE.some((st) => st.block === b)) err(`южный маршрут: пустой блок ${b}`);
for (const lang of loaded.langs) {
  const t = loaded.texts[lang], so = loaded.south[lang];
  for (const b of SOUTH_BLOCKS) if (!so.blocks[b] && !t.blocks[b]) err(`${lang}: нет названия южного блока ${b}`);
  for (const id of Object.keys(so.lessons)) if (!byId[id]) err(`${lang}: south.csv — тексты для несуществующего урока ${id}`);
  for (const st of SOUTH_ROUTE) {
    const L = byId[st.id];
    if (!L) continue;
    // Как в ui/course.ts: если у урока есть южные тексты, подписи указателей берутся только из них.
    const x = so.lessons[st.id], base = t.lessons[st.id] || {};
    const labels = x ? x.labels || [] : base.labels || [];
    const n = (st.pointers || L.pointers || []).length;
    if (n !== labels.length) err(`${lang}: южный урок ${st.id}: указателей ${n}, подписей ${labels.length}`);
    if (!L.theory && !(x && x.find)) err(`${lang}: южный урок ${st.id} без «Как найти» (find)`);
  }
}
console.log(`Южный маршрут: ${SOUTH_ROUTE.length} уроков, ${SOUTH_BLOCKS.length} блоков`);

// 4. Определение созвездия по точке совпадает с каталогом для звёзд с обозначением Байера.
let total = 0, bad = 0;
const badList: string[] = [];
for (let i = 0; i < sky.n; i++) {
  const con = sky.starCon(i);
  if (!con || !sky.starLetter(i) || sky.mag[i] > 5) continue;
  total++;
  const got = sky.conAt(sky.ra[i], sky.dec[i]);
  if (got !== con) { bad++; if (badList.length < 12) badList.push(`${sky.starDesig(i, true)}→${got}`); }
}
console.log(`conAt: ${total - bad}/${total} совпадений. Расхождения: ${badList.join(', ')}`);
if (bad > total * 0.01) err('слишком много расхождений conAt');

// 5. Солнце по созвездиям.
const runs: string[] = [];
let prev = '';
for (let d = 0; d < 365; d++) {
  const date = new Date(Date.UTC(2026, 0, 1 + d, 12));
  const p = eclToEq(sunLongitude(date));
  const c = sky.conAt(p.ra, p.dec) || '?';
  if (c !== prev) { runs.push(`${date.getUTCDate()}.${date.getUTCMonth() + 1} ${c}`); prev = c; }
}
console.log('Солнце входит в созвездия (2026):', runs.join(' | '));

// 6. Объекты лежат в ожидаемых созвездиях.
const expect: Record<string, string> = { M31: 'And', M42: 'Ori', M45: 'Tau', M44: 'Cnc', M13: 'Her', M57: 'Lyr', M27: 'Vul', M1: 'Tau', M8: 'Sgr', M51: 'CVn', M81: 'UMa', M104: 'Vir', M11: 'Sct', M7: 'Sco', LMC: 'Dor', SMC: 'Tuc', omegaCen: 'Cen', GC: 'Sgr', NGP: 'Com', SGP: 'Scl', NEP: 'Dra', Mel111: 'Com', M33: 'Tri', M16: 'Ser', hχPer: 'Per' };
for (const id of Object.keys(expect)) {
  const d = DSO.filter((x) => x.id === id)[0];
  const c = sky.conAt(d.ra, d.dec);
  if (c !== expect[id]) err(`${id} оказался в ${c}, ожидалось ${expect[id]}`);
}

// 7. Млечный Путь: списки в src/data/sky-facts.ts сверяются с его настоящей картой (доля линий созвездия внутри).
const mwShare = (c: string) => {
  let n = 0, inside = 0;
  for (const l of sky.raw.lines[c] || []) for (let i = 0; i < l.length; i += 2) {
    const v = vec(l[i], l[i + 1]);
    n++;
    if (sky.mwContains(0, v[0], v[1], v[2])) inside++;
  }
  return n ? inside / n : 0;
};
for (const c of MILKY_WAY) if (mwShare(c) < 0.2) err(`Млечный Путь почти не проходит через ${c}, а он в списке MILKY_WAY`);
for (const c of NOT_MILKY_WAY) if (mwShare(c) > 0) err(`Млечный Путь задевает ${c}, а он в списке NOT_MILKY_WAY`);
for (const c of NEAR_ECLIPTIC) if (ECLIPTIC.indexOf(c) >= 0) err(`${c} на эклиптике, а он в списке «не зодиакальных»`);

// 8. Задачи с решением: тексты на всех языках, номера ответов, и сами ответы — по каталогу.
const starAt = (k: string) => sky.starIndex(k);
const decOf = (k: string) => sky.dec[starAt(k)];
const indicesWhere = (keys: string[], ok: (k: string) => boolean) => keys.map((k, i) => (ok(k) ? i : -1)).filter((i) => i >= 0);
const vis = (k: string, lat: number) => visibility(decOf(k), lat).kind;
const verify: Record<string, (t: SolvedTask) => boolean> = {
  'circumpolar-moscow': (t) => indicesWhere(t.stars!, (k) => vis(k, 55.75) === 'never-sets').join() === t.correct!.join(),
  'sochi-spb': (t) => indicesWhere(t.stars!, (k) => vis(k, 43.6) !== 'never-rises' && vis(k, 59.94) === 'never-rises').join() === t.correct!.join(),
  'zenith-moscow': (t) => {
    const z = t.stars!.map((k) => Math.abs(55.75 - decOf(k)));
    return z.indexOf(Math.min.apply(null, z)) === t.correct![0];
  },
  'brightness-order': (t) => { const m = t.stars!.map((k) => sky.mag[starAt(k)]); return m[0] < m[1] && m[1] < m[2] && m[2] < m[3]; },
  'sirius-lat': (t) => Math.abs(90 + decOf('α CMa') - t.value!) < 0.2,
  'polaris-height': (t) => Math.abs(59.94 - t.value!) < 0.2,
  'noon-sun-height': (t) => Math.abs(90 - 55.75 + 23.44 - t.value!) < 0.2,
  'solstice-con': (t) => { const p = eclToEq(90); return sky.conAt(p.ra, p.dec) === 'Tau' && t.correct![0] === 2; },
  'equinox-point': () => sky.conAt(0, 0) === 'Psc',
  'vega-lower': (t) => Math.abs(55.75 + decOf('α Lyr') - 90 - t.value!) < 0.2,
  'sun-ophiuchus': (t) => sunCon(sky, new Date(Date.UTC(2026, 11, 5, 12))) === 'Oph' && t.correct![0] === 1,
  'ori-sco': () => {
    // Полуинтервал над горизонтом (часы) и восход/заход в звёздном времени для Москвы.
    const up = (k: string) => {
      const i = starAt(k), h = Math.acos(-Math.tan(55.75 * Math.PI / 180) * Math.tan(sky.dec[i] * Math.PI / 180)) * 12 / Math.PI;
      return [sky.ra[i] / 15 - h, sky.ra[i] / 15 + h];
    };
    const a = up('α Ori'), b = up('α Sco');
    return a[1] < b[0] && b[1] < a[0] + 24;
  },
  'orion-month': () => {
    // Дата, когда α Солнца = α Ориона − 12ч, должна быть в декабре.
    const target = norm360(sky.geo.Ori.fig.ra - 180);
    for (let d = 0; d < 365; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d, 12));
      const diff = Math.abs(norm360(sunRA(date) - target));
      if (Math.min(diff, 360 - diff) < 1) return date.getUTCMonth() === 11;
    }
    return false;
  },
};
for (const t of SOLVED) {
  for (const lang of loaded.langs) {
    const x = loaded.texts[lang].tasks.solved[t.id];
    if (!x || !x.text || !x.solution) { err(`${lang}: нет текста задачи ${t.id}`); continue; }
    const n = (x.options || []).length;
    if (t.kind === 'number' ? n !== 0 || t.value === undefined : n < 2 || !t.correct || t.correct.some((k) => k >= n)) err(`${lang}: задача ${t.id}: варианты и ответ не сходятся`);
  }
  for (const k of t.stars || []) if (starAt(k) < 0) err(`задача ${t.id}: нет звезды ${k}`);
  if (verify[t.id] && !verify[t.id](t)) err(`задача ${t.id}: ответ не сходится с каталогом`);
}
for (const lang of loaded.langs) for (const c of CITIES) if (!loaded.texts[lang].tasks.cities[c.id]) err(`${lang}: нет названия города ${c.id}`);
const LEVELS: TaskLevel[] = ['easy', 'mid', 'hard'];
for (const l of LEVELS) if (!SOLVED.some((t) => t.level === l)) err(`нет задач с решением уровня ${l}`);

// 9. Генераторы задач: на каждом языке, уровне и теме; для Москвы и Сиднея, только видимое и всё небо — по 60 задач.
for (const lang of loaded.langs) {
  setTexts(loaded.texts[lang]);
  const s = new Sky(g.window.SKY);
  let made = 0;
  const scopes: Scope[] = [{ lat: 55.75, all: false }, { lat: 55.75, all: true }, { lat: -33.87, all: false }, { lat: -33.87, all: true }];
  for (const level of LEVELS) for (const topic of Object.keys(GENERATORS) as TaskTopic[]) for (const scope of scopes) for (let k = 0; k < 60; k++) {
    const p = generate(topic, s, scope, level);
    made++;
    const where = `${lang} ${level}: задача ${p.key}`;
    if (p.level !== level || p.topic !== topic) err(`${where}: уровень ${p.level}, тема ${p.topic}`);
    if (level === 'easy' && /^(vis|alt|lat):/.test(p.key) && p.text.indexOf('δ') < 0) err(`${where}: на лёгком уровне не дано склонение`);
    if (topic === 'map' && p.marks!.length !== (level === 'hard' ? 4 : 3)) err(`${where}: меток ${p.marks!.length}`);
    // С южной широты не спрашиваем про то, чего оттуда не видно (Малая Медведица, Полярная).
    if (!scope.all && scope.lat < 0 && topic === 'map' && p.focus!.some((c) => 90 - Math.abs(scope.lat - s.geo[c].fig.dec) < 10)) err(`${where}: на карте невидимое с юга созвездие`);
    if (/\{\w+[:}]/.test(p.text + p.solution)) err(`${where}: осталась подстановка: ${p.text}`);
    if (p.kind === 'number') { if (!(p.value! > -90 && p.value! < 90)) err(`${where}: ответ ${p.value}`); continue; }
    const opts = p.options || [];
    if (opts.some((o, i) => !o || opts.indexOf(o) !== i)) err(`${where}: пустые или повторяющиеся варианты: ${opts.join(' | ')}`);
    if (!p.correct || !p.correct.length || p.correct.some((c) => c < 0 || c >= opts.length)) err(`${where}: неверные номера ответов`);
    if (p.kind === 'names' && (p.marks!.length !== p.correct!.length || p.correct!.some((c, i) => p.correct!.indexOf(c) !== i))) err(`${where}: метки не сходятся с ответами`);
    if (errors > 20) break;
  }
  console.log(`${lang}: сгенерировано и проверено задач: ${made}`);
}
setTexts(loaded.texts.ru);

console.log(errors ? `\nОшибок: ${errors}` : '\nВсё в порядке.');
process.exitCode = errors ? 1 : 0;
