import { angDist, eclToEq, norm360, sunLongitude, visibility } from '../core/math';
import type { Sky } from '../core/sky';
import { sunCon, sunRA, sunRuns } from '../core/sun';
import type { RaDec, TaskLevel, TaskTopic, View } from '../core/types';
import { shuffle } from '../core/util';
import { LESSONS } from '../data/lessons';
import { ECLIPTIC, FAMOUS, MILKY_WAY, NEAR_ECLIPTIC, NOT_MILKY_WAY, ZODIAC } from '../data/sky-facts';
import { CITIES, SOLVED } from '../data/tasks';
import { T, fill, fmtDate, fmtDec, fmtMag, fmtNum, fmtRA } from '../i18n';

// Задача для вкладки «Задачи». Ответ всегда считается из данных неба (или задан в src/data/tasks.ts).
export interface Problem {
  topic: TaskTopic;
  level: TaskLevel;
  key: string;           // чтобы не повторять одну и ту же задачу подряд
  text: string;
  kind: 'choice' | 'multi' | 'number' | 'names';
  options?: string[];
  correct?: number[];    // choice, multi: номера верных вариантов; names: верный вариант для каждой метки
  value?: number;        // number: ответ ± tol
  tol?: number;
  marks?: RaDec[];       // names: где на карте метки 1, 2, 3…
  solution: string;
  view?: View;
  focus?: string[];      // созвездия, которые показать после ответа
  stars?: number[];      // звёзды, которые подписать после ответа
  ecliptic?: boolean;
}

// Что меняет уровень сложности:
//   easy — яркие звёзды и известные созвездия (FAMOUS), склонение дано в условии, варианты далеко друг от друга;
//   mid  — ярчайшие звёзды, склонения помнить примерно;
//   hard — тусклые созвездия, звёзды 2–3-й величины, близкие варианты, меньше допуск, даты у границ созвездий.
type Gen = (sky: Sky, scope: Scope, level: TaskLevel) => Problem | null;
// Чьё небо: широта пользователя; all — всё небо, а не только то, что видно с этой широты.
export interface Scope { lat: number; all: boolean }
// Видно ли с широты пользователя: в верхней кульминации — хотя бы на minAlt градусов над горизонтом.
const seen = (scope: Scope, dec: number, minAlt = 10) => scope.all || 90 - Math.abs(scope.lat - dec) >= minAlt;
const byLevel = <V>(level: TaskLevel, easy: V, mid: V, hard: V): V => (level === 'easy' ? easy : level === 'mid' ? mid : hard);

const pick = <V>(a: V[]): V => a[Math.floor(Math.random() * a.length)];
const lat1 = (x: number) => fmtNum(x, 1);
const famous = (c: string) => FAMOUS.indexOf(c) >= 0;
// Разница прямых восхождений по кругу, градусы.
const dRA = (a: number, b: number) => { const d = Math.abs(norm360(a) - norm360(b)); return Math.min(d, 360 - d); };

// Созвездия из уроков — те, что видно с широты пользователя (или все).
function conPool(sky: Sky, scope: Scope): string[] {
  const out: string[] = [];
  for (const L of LESSONS) for (const c of L.cons) if (seen(scope, sky.geo[c].fig.dec)) out.push(c);
  return out;
}

// Города для задач: своего полушария; на сложном уровне и для «всего неба» — любые.
const citiesFor = (scope: Scope, level: TaskLevel) =>
  (level === 'hard' || scope.all ? CITIES : CITIES.filter((c) => (c.lat < 0) === (scope.lat < 0)));

// Звёзды с отобранными именами в диапазоне блеска.
function namedStars(sky: Sky, minMag: number, maxMag: number, scope: Scope): number[] {
  const out: number[] = [];
  for (let i = 0; i < sky.n && sky.mag[i] <= maxMag; i++) {
    if (sky.mag[i] >= minMag && sky.curatedName(i) && seen(scope, sky.dec[i])) out.push(i);
  }
  return out;
}
const starsFor = (sky: Sky, scope: Scope, level: TaskLevel, midMax: number) =>
  byLevel(level, namedStars(sky, -2, 1.3, scope), namedStars(sky, -2, midMax, scope), namedStars(sky, 1.3, 3, scope));

// Ближайшие к звезде i из списка — для близких (трудных) вариантов.
function nearestStars(sky: Sky, i: number, list: number[], n: number): number[] {
  const p = { ra: sky.ra[i], dec: sky.dec[i] };
  return list.filter((s) => s !== i).map((s) => ({ s, d: angDist(p, { ra: sky.ra[s], dec: sky.dec[s] }) }))
    .sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.s);
}

function nearestCons(sky: Sky, con: string, list: string[]): string[] {
  return list.filter((c) => c !== con).map((c) => ({ c, d: angDist(sky.geo[con].fig, sky.geo[c].fig) }))
    .sort((a, b) => a.d - b.d).map((x) => x.c);
}

// Ярчайшая звезда каждого созвездия — считается один раз.
let brightest: Record<string, number> | null = null;
function brightestStar(sky: Sky, con: string): number {
  if (!brightest) {
    brightest = {};
    for (let i = 0; i < sky.n; i++) { const c = sky.starCon(i); if (c && !(c in brightest)) brightest[c] = i; }
  }
  return brightest[con];
}

// Варианты: верный + неверные, перемешанные. Возвращает подписи и номер верного.
function choices(right: string, wrong: string[]): { options: string[]; correct: number[] } {
  const options = shuffle([right].concat(wrong));
  return { options, correct: [options.indexOf(right)] };
}

// Неверные варианты-созвездия на эклиптике: лёгкие — далеко по кругу зодиака, трудные — соседи.
function eclipticWrong(con: string, level: TaskLevel): string[] {
  const n = ECLIPTIC.length, k = ECLIPTIC.indexOf(con);
  const step = (c: string) => { const d = Math.abs(ECLIPTIC.indexOf(c) - k); return Math.min(d, n - d); };
  const others = ECLIPTIC.filter((c) => c !== con);
  if (level === 'easy') return shuffle(others.filter((c) => step(c) >= 3)).slice(0, 3);
  if (level === 'hard') return shuffle(others.filter((c) => step(c) <= 2)).slice(0, 3);
  return shuffle(others).slice(0, 3);
}

const starView = (sky: Sky, i: number, fov = 60): View => ({ ra: sky.ra[i], dec: sky.dec[i], fov });
const randomDate = (): Date => new Date(Date.UTC(new Date().getFullYear(), 0, 1 + Math.floor(Math.random() * 365), 12));
// На лёгком уровне склонение звезды дано в условии.
const withDec = (text: string, sky: Sky, i: number, level: TaskLevel) =>
  (level === 'easy' ? `${text} ${fill(T.tasks.gen.decGiven, { dec: fmtDec(sky.dec[i]) })}` : text);

// ---------- созвездия на карте ----------

const genMap: Gen = (sky, scope, level) => {
  const pool = conPool(sky, scope);
  const seed = pick(byLevel(level, pool.filter(famous), pool, pool.filter((c) => !famous(c))));
  const near = nearestCons(sky, seed, level === 'easy' ? pool.filter(famous) : pool);
  const k = level === 'hard' ? 4 : 3;
  const chosen = shuffle([seed].concat(shuffle(near.slice(0, k + 1)).slice(0, k - 1)));
  const pts: RaDec[] = [];
  for (const c of chosen) for (const l of sky.raw.lines[c] || []) for (let i = 0; i < l.length; i += 2) pts.push({ ra: l[i], dec: l[i + 1] });
  const view = sky.fit(pts, 45, 150);
  if (view.fov > (level === 'hard' ? 140 : 130)) return null;
  const rest = near.filter((c) => chosen.indexOf(c) < 0);
  const others = level === 'easy' ? shuffle(rest).slice(0, 3) : rest.slice(0, 3);
  const names = chosen.concat(others).map((c) => sky.conName(c)).sort((a, b) => a.localeCompare(b, T.locale));
  const marks = chosen.map((c) => { const s = brightestStar(sky, c); return { ra: sky.ra[s], dec: sky.dec[s] }; });
  const g = T.tasks.gen.map;
  return {
    topic: 'map', level, key: `map:${chosen.join(',')}`, kind: 'names', text: g.text, options: names,
    correct: chosen.map((c) => names.indexOf(sky.conName(c))), marks, view, focus: chosen,
    solution: fill(g.solution, { list: chosen.map((c, j) => `${j + 1} — ${sky.conName(c)}`).join(', ') }),
  };
};

// ---------- видимость и высота ----------

const genVis: Gen = (sky, scope, level) => {
  const i = pick(starsFor(sky, scope, level, 2.6)), city = pick(citiesFor(scope, level)), dec = sky.dec[i];
  const up = 90 - Math.abs(city.lat);
  if (Math.abs(dec - up) < 2 || Math.abs(dec + up) < 2) return null; // слишком близко к границе — спорно
  const v = visibility(dec, city.lat), k = v.kind === 'never-sets' ? 0 : v.kind === 'rises' ? 1 : 2;
  if (level === 'hard' && k === 1 && Math.random() < 0.6) return null; // на сложном чаще незаходящие и невосходящие
  const g = T.tasks.gen.vis;
  return {
    topic: 'vis', level, key: `vis:${i}:${city.id}`, kind: 'choice', options: g.options, correct: [k],
    text: withDec(fill(g.text, { star: sky.curatedName(i), city: T.tasks.cities[city.id], lat: lat1(city.lat) }), sky, i, level),
    solution: fill(city.lat < 0 ? g.solutionSouth : g.solution, { dec: fmtDec(dec), lat: lat1(city.lat), up: lat1(up), answer: g.options[k] }),
    view: starView(sky, i), stars: [i],
  };
};

const genAlt: Gen = (sky, scope, level) => {
  const i = pick(starsFor(sky, scope, level, 2.6)), city = pick(citiesFor(scope, level)), dec = sky.dec[i];
  const h = 90 - Math.abs(city.lat - dec);
  if (h < 5) return null;
  const g = T.tasks.gen.alt;
  return {
    topic: 'vis', level, key: `alt:${i}:${city.id}`, kind: 'number', value: h, tol: byLevel(level, 2, 3, 2),
    text: withDec(fill(g.text, { star: sky.curatedName(i), city: T.tasks.cities[city.id], lat: lat1(city.lat) }), sky, i, level),
    solution: fill(g.solution, { dec: fmtDec(dec), decd: lat1(dec), lat: lat1(city.lat), h: lat1(h) }),
    view: starView(sky, i), stars: [i],
  };
};

const genLat: Gen = (sky, scope, level) => {
  const i = pick(starsFor(sky, scope, level, 2.0)), dec = sky.dec[i], south = scope.lat < 0, g = T.tasks.gen.lat;
  // В северном полушарии — кульминация к югу от зенита (δ < φ), в южном — к северу (δ > φ).
  const lat = south ? -Math.round(20 + Math.random() * 30) : Math.round(30 + Math.random() * 38);
  if (south ? dec < lat + 5 : dec > lat - 5) return null;
  const h = Math.round(south ? 90 + lat - dec : 90 - lat + dec);
  if (h < 8) return null;
  const value = south ? h - 90 + dec : 90 - h + dec;
  return {
    topic: 'vis', level, key: `lat:${i}:${h}`, kind: 'number', value, tol: byLevel(level, 2, 3, 2),
    text: withDec(fill(south ? g.textSouth : g.text, { star: sky.curatedName(i), h }), sky, i, level),
    solution: fill(south ? g.solutionSouth : g.solution, { decd: lat1(dec), h, lat: lat1(value) }),
    view: starView(sky, i), stars: [i],
  };
};

const genCirc: Gen = (sky, scope, level) => {
  const cities = citiesFor(scope, level).filter((c) => { const a = Math.abs(c.lat); return byLevel(level, a >= 50, a >= 30, a >= 30 && a <= 56); });
  if (!cities.length) return null;
  const city = pick(cities), limit = 90 - Math.abs(city.lat), south = city.lat < 0;
  const down = level !== 'easy' && Math.random() < byLevel(level, 0, 0.3, 0.5);
  const all = conPool(sky, { lat: 0, all: true }), known = conPool(sky, scope);
  const ok = (c: string) => (level === 'easy' ? famous(c) : true);
  // В южном полушарии всё зеркально: считаем как для северного, но со склонениями с обратным знаком.
  const range = (c: string): [number, number] => { const r = sky.conDecRange(c); return south ? [-r[1], -r[0]] : r; };
  let right: string[], wrong: string[];
  if (!down) {
    right = known.filter((c) => ok(c) && range(c)[0] > limit + 2);
    // Неверные — созвездия, которые заходят хотя бы частично; на сложном — те, что почти не заходят.
    wrong = known.filter((c) => {
      const r = range(c);
      return ok(c) && r[1] > limit && r[0] < limit - 3 && (level !== 'hard' || r[0] > limit - 12);
    });
  } else {
    right = all.filter((c) => range(c)[1] < -limit - 2);
    wrong = all.filter((c) => {
      const r = range(c);
      return r[1] > -limit + 3 && r[0] < -limit && (level !== 'hard' || r[1] < -limit + 12);
    });
  }
  if (!right.length || wrong.length < 3) return null;
  const con = pick(right), r = sky.conDecRange(con);
  const ch = choices(sky.conName(con), shuffle(wrong).slice(0, 3).map((c) => sky.conName(c)));
  const g = down ? T.tasks.gen.circDown : T.tasks.gen.circUp;
  // Крайняя точка созвездия у границы: для «не заходит» на севере — южная, на юге — северная; для «не видно» — наоборот.
  const d = down !== south ? r[1] : r[0];
  return {
    topic: 'vis', level, key: `circ:${con}:${city.id}`, kind: 'choice', options: ch.options, correct: ch.correct,
    text: fill(g.text, { city: T.tasks.cities[city.id], lat: lat1(city.lat) }),
    solution: fill(south ? g.solutionSouth : g.solution, { limit: lat1(limit), con: sky.conName(con), d: lat1(d) }),
    view: { ra: sky.geo[con].fig.ra, dec: sky.geo[con].fig.dec, fov: 90 }, focus: [con],
  };
};

// ---------- Солнце, Луна, время года ----------

const DAY = 864e5;

const genSun: Gen = (sky, _scope, level) => {
  const date = randomDate(), runs = sunRuns(sky, date.getUTCFullYear());
  const run = runs.filter((r) => r.from <= date && date <= r.to)[0];
  if (!run) return null;
  const edge = Math.min(date.getTime() - run.from.getTime(), run.to.getTime() - date.getTime()) / DAY;
  if (level === 'easy' ? edge < 7 : level === 'mid' ? edge < 3 : edge < 2 || edge > 6) return null;
  const ch = choices(sky.conName(run.con), eclipticWrong(run.con, level).map((c) => sky.conName(c)));
  const p = eclToEq(sunLongitude(date)), g = T.tasks.gen.sun;
  return {
    topic: 'sun', level, key: `sun:${run.con}`, kind: 'choice', options: ch.options, correct: ch.correct,
    text: fill(g.text, { date: fmtDate(date) }),
    solution: fill(g.solution, { con: sky.conName(run.con), from: fmtDate(run.from), to: fmtDate(run.to) }),
    view: { ra: p.ra, dec: p.dec, fov: 90 }, focus: [run.con], ecliptic: true,
  };
};

const genMoon: Gen = (sky, _scope, level) => {
  const date = randomDate(), lam = sunLongitude(date) + 180;
  const at = (l: number) => { const p = eclToEq(l); return sky.conAt(p.ra, p.dec, ECLIPTIC); };
  const con = at(lam), margin = byLevel(level, 8, 4, 2.5);
  if (!con || at(lam - margin) !== con || at(lam + margin) !== con) return null; // у границы созвездий — спорно
  if (level === 'hard' && at(lam - 6) === con && at(lam + 6) === con) return null; // на сложном — рядом с границей
  const ch = choices(sky.conName(con), eclipticWrong(con, level).map((c) => sky.conName(c)));
  const p = eclToEq(lam), g = T.tasks.gen.moon;
  return {
    topic: 'sun', level, key: `moon:${con}`, kind: 'choice', options: ch.options, correct: ch.correct,
    text: fill(g.text, { date: fmtDate(date) }),
    solution: fill(g.solution, { date: fmtDate(date), sun: sky.conName(sunCon(sky, date)), con: sky.conName(con) }),
    view: { ra: p.ra, dec: p.dec, fov: 90 }, focus: [con], ecliptic: true,
  };
};

const genMidnight: Gen = (sky, scope, level) => {
  const date = randomDate(), sun = sunRA(date), target = norm360(sun + 180);
  // Только созвездия, которые в кульминации поднимаются хотя бы на 30° на широте пользователя.
  const cands = conPool(sky, scope).filter((c) => {
    const f = sky.geo[c].fig;
    return f.r < 25 && 90 - Math.abs(scope.lat - f.dec) >= 30 && Math.abs(f.dec) < 75 && (level !== 'easy' || famous(c));
  });
  const far = byLevel(level, 90, 60, 37.5); // неверные варианты — не ближе (градусы по α)
  const right = cands.filter((c) => dRA(sky.geo[c].fig.ra, target) <= 15);
  const wrong = cands.filter((c) => dRA(sky.geo[c].fig.ra, target) >= far);
  if (!right.length || wrong.length < 3) return null;
  const con = pick(right);
  const wr = level === 'hard' ? wrong.sort((a, b) => dRA(sky.geo[a].fig.ra, target) - dRA(sky.geo[b].fig.ra, target)).slice(0, 5) : wrong;
  const ch = choices(sky.conName(con), shuffle(wr).slice(0, 3).map((c) => sky.conName(c)));
  const g = T.tasks.gen.midnight;
  return {
    topic: 'sun', level, key: `mid:${con}`, kind: 'choice', options: ch.options, correct: ch.correct,
    text: fill(g.text, { date: fmtDate(date) }),
    solution: fill(g.solution, { date: fmtDate(date), sun: fmtRA(sun), target: fmtRA(target), con: sky.conName(con), ra: fmtRA(sky.geo[con].fig.ra) }),
    view: { ra: target, dec: 20, fov: 110 }, focus: [con],
  };
};

// ---------- звёзды и созвездия ----------

const genCoords: Gen = (sky, scope, level) => {
  const stars = namedStars(sky, -2, byLevel(level, 1.0, 1.6, 2.2), scope), i = pick(stars);
  const others = level === 'hard' ? nearestStars(sky, i, stars, 3) : shuffle(stars.filter((s) => s !== i)).slice(0, 3);
  const ch = choices(sky.curatedName(i), others.map((s) => sky.curatedName(s)));
  const g = T.tasks.gen.coords;
  return {
    topic: 'stars', level, key: `coords:${i}`, kind: 'choice', options: ch.options, correct: ch.correct,
    text: fill(g.text, { ra: fmtRA(sky.ra[i]), dec: fmtDec(sky.dec[i]) }),
    solution: fill(g.solution, { star: sky.curatedName(i), desig: sky.starDesig(i), mag: fmtMag(sky.mag[i], 1) }),
    view: starView(sky, i), stars: [i],
  };
};

const genDesig: Gen = (sky, scope, level) => {
  const lettered = (s: number) => !!sky.starLetter(s) && !!sky.starCon(s);
  const stars = starsFor(sky, scope, level, 2.5).filter(lettered), i = pick(stars);
  let others: number[];
  if (level === 'hard') {
    // Звёзды того же созвездия, потом ближайшие: «β Лиры или γ Лиры?»
    const pool = namedStars(sky, -2, 4, { lat: 0, all: true }).filter(lettered);
    const same = shuffle(pool.filter((s) => s !== i && sky.starCon(s) === sky.starCon(i)));
    others = same.concat(nearestStars(sky, i, pool.filter((s) => same.indexOf(s) < 0), 3)).slice(0, 3);
  } else {
    others = shuffle(stars.filter((s) => s !== i)).slice(0, 3);
  }
  const back = Math.random() < 0.5, g = T.tasks.gen;
  const ch = back ? choices(sky.curatedName(i), others.map((s) => sky.curatedName(s)))
    : choices(sky.starDesig(i), others.map((s) => sky.starDesig(s)));
  return {
    topic: 'stars', level, key: `desig:${i}`, kind: 'choice', options: ch.options, correct: ch.correct,
    text: back ? fill(g.desigBack.text, { desig: sky.starDesig(i) }) : fill(g.desig.text, { star: sky.curatedName(i) }),
    solution: fill(g.desig.solution, { star: sky.curatedName(i), desig: sky.starDesig(i), latin: sky.starDesig(i, true) }),
    view: starView(sky, i), stars: [i],
  };
};

const genConOf: Gen = (sky, scope, level) => {
  let name: string, con: string | null, at: RaDec, star: number | undefined;
  if (Math.random() < byLevel(level, 1, 0.6, 0.5)) {
    const i = pick(namedStars(sky, byLevel(level, -2, -2, 1.3), byLevel(level, 1.3, 3, 3.5), scope));
    name = sky.curatedName(i); con = sky.starCon(i); at = { ra: sky.ra[i], dec: sky.dec[i] }; star = i;
  } else {
    const ids = Object.keys(sky.dsoById).filter((k) => { const d = sky.dsoById[k]; return d.type !== 'pt' && seen(scope, d.dec); });
    const d = sky.dsoById[pick(ids)];
    name = d.label && d.label !== d.id ? `${d.label} (${d.id})` : d.name; con = sky.conAt(d.ra, d.dec); at = d;
  }
  if (!con) return null;
  const cons = sky.cons.filter((c) => seen(scope, sky.geo[c].fig.dec) && (level !== 'easy' || famous(c)));
  const near = nearestCons(sky, con, cons);
  const wrong = byLevel(level, shuffle(near).slice(0, 3), shuffle(near.slice(0, 5)).slice(0, 3), near.slice(0, 3));
  const ch = choices(sky.conName(con), wrong.map((c) => sky.conName(c)));
  const g = T.tasks.gen.conOf;
  return {
    topic: 'stars', level, key: `conof:${name}`, kind: 'choice', options: ch.options, correct: ch.correct,
    text: fill(g.text, { name }), solution: fill(g.solution, { name, con: sky.conName(con) }),
    view: { ra: at.ra, dec: at.dec, fov: 70 }, focus: [con], stars: star === undefined ? [] : [star],
  };
};

const genZodiac: Gen = (sky, _scope, level) => {
  const con = pick(NEAR_ECLIPTIC.filter((c) => byLevel(level, famous(c), true, !famous(c))));
  const zodiac = ZODIAC.filter((c) => level !== 'easy' || famous(c));
  const ch = choices(sky.conName(con), shuffle(zodiac.slice()).slice(0, 3).map((c) => sky.conName(c)));
  const g = T.tasks.gen.zodiac;
  return {
    topic: 'stars', level, key: `zodiac:${con}`, kind: 'choice', options: ch.options, correct: ch.correct, text: g.text,
    solution: fill(g.solution, { list: ECLIPTIC.map((c) => sky.conName(c)).join(', '), con: sky.conName(con) }),
    view: { ra: sky.geo[con].fig.ra, dec: sky.geo[con].fig.dec, fov: 100 }, focus: [con], ecliptic: true,
  };
};

const genMw: Gen = (sky, scope, level) => {
  const fits = (c: string) => byLevel(level, famous(c), true, !famous(c));
  const con = pick(NOT_MILKY_WAY.filter(fits));
  const yes = shuffle(MILKY_WAY.filter((c) => fits(c) && seen(scope, sky.geo[c].fig.dec))).slice(0, 3);
  if (yes.length < 3) return null;
  const ch = choices(sky.conName(con), yes.map((c) => sky.conName(c)));
  const g = T.tasks.gen.mw;
  return {
    topic: 'stars', level, key: `mw:${con}`, kind: 'choice', options: ch.options, correct: ch.correct, text: g.text,
    solution: fill(g.solution, { yes: yes.map((c) => sky.conName(c)).join(', '), con: sky.conName(con) }),
    view: { ra: sky.geo[con].fig.ra, dec: sky.geo[con].fig.dec, fov: 120 }, focus: [con],
  };
};

// ---------- задачи с решением ----------

const solvedOrder: Record<string, number[]> = {};
export function solvedProblem(sky: Sky, level: TaskLevel, index?: number): Problem {
  if (index === undefined) {
    let order = solvedOrder[level];
    if (!order || !order.length) {
      order = solvedOrder[level] = shuffle(SOLVED.map((_s, k) => k).filter((k) => SOLVED[k].level === level));
    }
    index = order.shift()!;
  }
  const s = SOLVED[index], t = T.tasks.solved[s.id];
  return {
    topic: 'solved', level: s.level, key: `solved:${s.id}`, kind: s.kind, text: t.text, options: t.options, correct: s.correct,
    value: s.value, tol: s.tol, solution: t.solution, view: s.view, focus: s.focus, ecliptic: s.ecliptic,
    stars: (s.stars || []).map((k) => sky.starIndex(k)).filter((i) => i >= 0),
  };
}

export const GENERATORS: Record<TaskTopic, Gen[]> = {
  map: [genMap],
  vis: [genVis, genAlt, genLat, genCirc],
  sun: [genSun, genMoon, genMidnight],
  stars: [genCoords, genDesig, genConOf, genZodiac, genMw],
  solved: [(sky, _scope, level) => solvedProblem(sky, level)],
};

// Новая задача по теме и уровню; avoid — ключи недавних задач, чтобы не повторяться.
export function generate(topic: TaskTopic, sky: Sky, scope: Scope, level: TaskLevel, avoid: string[] = []): Problem {
  let last: Problem | null = null;
  for (let k = 0; k < 80; k++) {
    const p = pick(GENERATORS[topic])(sky, scope, level);
    if (!p) continue;
    last = p;
    if (avoid.indexOf(p.key) < 0) return p;
  }
  return last || solvedProblem(sky, level);
}
