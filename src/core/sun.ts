import { ECLIPTIC } from '../data/sky-facts';
import { eclToEq, sunLongitude } from './math';
import type { Sky } from './sky';

export interface SunRun { con: string; from: Date; to: Date }

let cache: { year: number; runs: SunRun[] } | null = null;

// Даты, когда Солнце в каждом созвездии, — по настоящим границам созвездий (IAU), полдень по UTC.
export function sunRuns(sky: Sky, year = new Date().getFullYear()): SunRun[] {
  if (cache && cache.year === year) return cache.runs;
  const runs: SunRun[] = [];
  for (let d = 0; d < 366; d++) {
    const date = new Date(Date.UTC(year, 0, 1 + d, 12));
    if (date.getUTCFullYear() !== year) break;
    const con = sunCon(sky, date);
    const last = runs[runs.length - 1];
    if (last && last.con === con) last.to = date;
    else runs.push({ con, from: date, to: date });
  }
  cache = { year, runs };
  return runs;
}

// Созвездие, в котором Солнце в этот день.
export function sunCon(sky: Sky, date: Date): string {
  const p = eclToEq(sunLongitude(date));
  return sky.conAt(p.ra, p.dec, ECLIPTIC) || '?';
}

// Прямое восхождение Солнца, градусы.
export function sunRA(date: Date): number {
  return eclToEq(sunLongitude(date)).ra;
}
