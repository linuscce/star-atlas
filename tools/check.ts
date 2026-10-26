// Проверка данных уроков и текстов (npm test): уроки, звёзды, объекты, указатели, переводы.
import { Sky } from '../src/core/sky';
import { eclToEq, sunLongitude } from '../src/core/math';
import type { SkyRaw } from '../src/core/types';
import { CONSTELLATIONS } from '../src/data/constellations';
import { DSO } from '../src/data/dso';
import { BLOCKS, LESSONS } from '../src/data/lessons';
import { setTexts } from '../src/i18n';
import type { Texts } from '../src/i18n/types';

declare const require: (m: string) => unknown;
declare const process: { exitCode: number };
const { loadTexts } = require('./texts') as { loadTexts: () => { langs: string[]; texts: Record<string, Texts>; errors: string[]; warnings: string[] } };
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

console.log(errors ? `\nОшибок: ${errors}` : '\nВсё в порядке.');
process.exitCode = errors ? 1 : 0;
