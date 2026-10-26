import { eclToEq, sunLongitude, visibility } from '../core/math';
import { T, fill, fmtDayMonth, fmtDec, fmtDeg, fmtMag, fmtNum, fmtRA } from '../i18n';
import { app } from '../ui/app';
import { $, each } from '../ui/dom';
import { save, state } from '../ui/state';
import { goCon } from './atlas';
import { lessonOfCon } from './learn';

const ZODIAC = ['Psc', 'Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Oph', 'Sgr', 'Cap', 'Aqr'];

let zodiacCache: { con: string; from: Date; to: Date }[] | null = null;

// Даты, когда Солнце в каждом созвездии, — по настоящим границам созвездий (IAU).
export function sunRuns(): { con: string; from: Date; to: Date }[] {
  if (zodiacCache) return zodiacCache;
  const year = new Date().getFullYear(), runs: { con: string; from: Date; to: Date }[] = [];
  for (let d = 0; d < 366; d++) {
    const date = new Date(Date.UTC(year, 0, 1 + d, 12));
    if (date.getUTCFullYear() !== year) break;
    const p = eclToEq(sunLongitude(date));
    const con = app.sky.conAt(p.ra, p.dec, ZODIAC) || '?';
    const last = runs[runs.length - 1];
    if (last && last.con === con) last.to = date;
    else runs.push({ con, from: date, to: date });
  }
  zodiacCache = runs;
  return runs;
}

const head = (cols: string[]) => '<tr>' + cols.map((c) => `<th>${c}</th>`).join('') + '</tr>';

export function zodiacTableHtml(): string {
  const runs = sunRuns().slice();
  // Стрелец переходит через Новый год — склеиваем начало и конец года.
  let first = runs[0];
  const last = runs[runs.length - 1];
  if (runs.length > 1 && first.con === last.con) {
    first = { con: first.con, from: last.from, to: first.to };
    runs.shift(); runs.pop(); runs.unshift(first);
  }
  return '<table class="tbl">' + head(T.ui.sunHead) + runs.map((r) => {
    let days = Math.round((r.to.getTime() - r.from.getTime()) / 86400000) + 1;
    if (days < 0) days += 365;
    return `<tr><td>${app.sky.conName(r.con)}</td><td>${fmtDayMonth(r.from)} — ${fmtDayMonth(r.to)}</td><td>${days}</td></tr>`;
  }).join('') + '</table>';
}

function visShort(dec: number): string {
  const v = visibility(dec, state.lat), ui = T.ui;
  return v.kind === 'never-rises' ? ui.visShortNeverRises : fill(v.kind === 'never-sets' ? ui.visShortNeverSets : ui.visShortRises, { h: fmtDeg(v.hmax) });
}

function brightTable(): string {
  const sky = app.sky, rows: string[] = [];
  for (let i = 0; i < sky.n && rows.length < 25; i++) {
    const name = sky.starName(i);
    if (!name) continue;
    rows.push(`<tr><td>${rows.length + 1}</td><td><b>${name}</b></td><td>${sky.starDesig(i)}<br><span class="muted">${sky.starDesig(i, true)}</span></td>` +
      `<td>${fmtMag(sky.mag[i], 2)}</td><td>${fmtRA(sky.ra[i])}</td><td>${fmtDec(sky.dec[i])}</td><td>${visShort(sky.dec[i])}</td></tr>`);
  }
  return '<table class="tbl">' + head(T.ui.brightHead.concat(fill(T.ui.atLat, { lat: fmtNum(state.lat, 1) }))) + rows.join('') + '</table>';
}

export function renderRef() {
  const sky = app.sky, ui = T.ui, el = $('ref');
  let h = `<div class="ref-inner"><h1>${ui.refTitle}</h1>`;
  h += `<label class="lat">${ui.myLat} <input id="r-lat" type="number" step="0.1" min="-90" max="90" value="${state.lat}"> °</label>`;

  h += `<h2>${ui.greekTitle}</h2><div class="greek">` + Object.keys(T.greek).map((l) => `<div><b>${l}</b>${T.greek[l]}</div>`).join('') + '</div>';

  h += `<h2>${ui.brightTitle}</h2><div class="tbl-wrap" id="r-bright">${brightTable()}</div>`;
  h += `<p class="muted small">${ui.brightNote}</p>`;

  h += `<h2>${fill(ui.sunTitle, { year: new Date().getFullYear() })}</h2><div class="tbl-wrap">${zodiacTableHtml()}</div>`;
  h += `<p class="muted small">${ui.sunNote}</p>`;

  h += `<h2>${ui.formulasTitle}</h2><ul class="facts">` + ui.formulas.map((f) => `<li>${f}</li>`).join('') + '</ul>';

  h += `<h2>${ui.asterismsTitle}</h2><ul class="facts">` + T.asterisms.map((a) => `<li><b>${a.name}</b> — ${a.stars}</li>`).join('') + '</ul>';

  const cons = sky.cons.slice().sort((a, b) => sky.conName(a).localeCompare(sky.conName(b), T.locale));
  h += `<h2>${ui.allConsTitle}</h2><div class="tbl-wrap"><table class="tbl">${head(ui.consHead)}` +
    cons.map((a) => {
      const li = lessonOfCon(a);
      return `<tr class="click" data-con="${a}"><td><b>${sky.conName(a)}</b></td><td>${sky.conAlt(a)}</td><td>${sky.conLatinGen(a)}</td><td>${a}</td><td>${li >= 0 ? li + 1 : ''}</td></tr>`;
    }).join('') + '</table></div>';

  const dso = Object.keys(sky.dsoById).map((k) => sky.dsoById[k]).filter((d) => d.type !== 'pt');
  h += `<h2>${ui.objectsTitle}</h2><div class="tbl-wrap"><table class="tbl">${head(ui.dsoHead)}` +
    dso.map((d) => {
      const c = sky.conAt(d.ra, d.dec);
      return `<tr><td><b>${d.label || d.id}</b></td><td>${d.name}</td><td>${c ? sky.conName(c) : ''}</td><td>${fmtRA(d.ra)}</td><td>${fmtDec(d.dec)}</td></tr>`;
    }).join('') + '</table></div>';

  h += `<p class="muted small credits">${ui.credits}</p></div>`;
  el.innerHTML = h;
  each(el.querySelectorAll('tr[data-con]'), (tr) => tr.addEventListener('click', () => goCon(tr.dataset.con!)));
  const lat = el.querySelector('#r-lat') as HTMLInputElement;
  lat.addEventListener('change', () => {
    const v = parseFloat(lat.value.replace(',', '.'));
    if (!isNaN(v) && v >= -90 && v <= 90) { state.lat = v; save(); $('r-bright').innerHTML = brightTable(); }
  });
}
