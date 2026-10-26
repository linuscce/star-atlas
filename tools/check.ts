// Проверка данных уроков: npx esbuild tools/check.ts --bundle --platform=node --outfile=tools/.check.js && node tools/.check.js
import { CON_RU, DSO, STAR_NAMES } from '../src/catalog';
import { LESSONS } from '../src/lessons';
import { eclToEq, sunLongitude } from '../src/math';
import { Sky } from '../src/sky';
import type { SkyRaw } from '../src/types';

declare const require: (m: string) => unknown;
declare const process: { exitCode: number };
const g = globalThis as unknown as { window: { SKY: SkyRaw } };
g.window = {} as { SKY: SkyRaw };
require('../public/sky.js');
const sky = new Sky(g.window.SKY);
let errors = 0;
const err = (m: string) => { errors++; console.log('ОШИБКА:', m); };

// 1. Все 88 созвездий — ровно в одном уроке.
const seen: Record<string, string> = {};
for (const L of LESSONS) for (const c of L.cons) {
  if (!CON_RU[c]) err(`урок ${L.id}: неизвестное созвездие ${c}`);
  if (seen[c]) err(`созвездие ${c} в двух уроках: ${seen[c]} и ${L.id}`);
  seen[c] = L.id;
}
const missing = Object.keys(CON_RU).filter((c) => !seen[c]);
if (missing.length) err(`созвездия без урока: ${missing.join(', ')}`);
console.log(`Созвездий в уроках: ${Object.keys(seen).length} из ${Object.keys(CON_RU).length}`);

// 2. Звёзды, объекты и указатели находятся.
for (const k of Object.keys(STAR_NAMES)) if (sky.starIndex(k) < 0) err(`имя для несуществующей звезды ${k}`);
const dsoIds: Record<string, true> = {};
for (const d of DSO) dsoIds[d.id] = true;
for (const L of LESSONS) {
  for (const k of L.stars || []) {
    const i = sky.starIndex(k);
    if (i < 0) err(`урок ${L.id}: нет звезды ${k}`);
    else if (L.cons.length && sky.starCon(i) && L.cons.indexOf(sky.starCon(i)!) < 0 && k !== 'α And') err(`урок ${L.id}: звезда ${k} из другого созвездия (${sky.starCon(i)})`);
  }
  for (const id of L.dso || []) if (!dsoIds[id]) err(`урок ${L.id}: нет объекта ${id}`);
  for (const p of L.pointers || []) for (const r of p.line || p.path || p.poly || []) if (!sky.point(r)) err(`урок ${L.id}: указатель на ${JSON.stringify(r)}`);
}

// 3. Определение созвездия по точке совпадает с каталогом для звёзд с обозначением Байера.
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

// 4. Солнце по созвездиям.
const runs: string[] = [];
let prev = '';
for (let d = 0; d < 365; d++) {
  const date = new Date(Date.UTC(2026, 0, 1 + d, 12));
  const p = eclToEq(sunLongitude(date));
  const c = sky.conAt(p.ra, p.dec) || '?';
  if (c !== prev) { runs.push(`${date.getUTCDate()}.${date.getUTCMonth() + 1} ${c}`); prev = c; }
}
console.log('Солнце входит в созвездия (2026):', runs.join(' | '));

// 5. Объекты лежат в ожидаемых созвездиях.
const expect: Record<string, string> = { M31: 'And', M42: 'Ori', M45: 'Tau', M44: 'Cnc', M13: 'Her', M57: 'Lyr', M27: 'Vul', M1: 'Tau', M8: 'Sgr', M51: 'CVn', M81: 'UMa', M104: 'Vir', M11: 'Sct', M7: 'Sco', LMC: 'Dor', SMC: 'Tuc', omegaCen: 'Cen', GC: 'Sgr', NGP: 'Com', SGP: 'Scl', NEP: 'Dra', Mel111: 'Com', M33: 'Tri', M16: 'Ser', hχPer: 'Per' };
for (const id of Object.keys(expect)) {
  const d = DSO.filter((x) => x.id === id)[0];
  const c = sky.conAt(d.ra, d.dec);
  if (c !== expect[id]) err(`${id} оказался в ${c}, ожидалось ${expect[id]}`);
}

console.log(errors ? `\nОшибок: ${errors}` : '\nВсё в порядке.');
process.exitCode = errors ? 1 : 0;
