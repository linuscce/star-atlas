import { norm360, visibility } from '../core/math';
import { sunRA } from '../core/sun';
import { T, fill, fmtDate, fmtDec, fmtDeg, fmtMag, fmtNum, fmtRA } from '../i18n';
import { app } from '../ui/app';
import { $, each } from '../ui/dom';
import { bindPlace, placeHtml } from '../ui/place';
import { state } from '../ui/state';
import { goCon } from './atlas';
import { head, zodiacTableHtml } from './zodiac';
import { lessonOfCon } from '../ui/course';

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

// Что кульминирует в полночь 15-го числа каждого месяца: α ≈ α Солнца + 12ч.
// Только созвездия, которые на этой широте поднимаются хотя бы на 10°, и не огромные (у Гидры центр ничего не значит).
function monthsTable(): string {
  const sky = app.sky, year = new Date().getFullYear(), rows: string[] = [];
  const cands = sky.cons.filter((c) => { const f = sky.geo[c].fig; return f.r < 30 && 90 - Math.abs(state.lat - f.dec) > 10; });
  for (let m = 0; m < 12; m++) {
    const date = new Date(Date.UTC(year, m, 15, 12)), sun = sunRA(date), target = norm360(sun + 180);
    const cons = cands.filter((c) => { const d = Math.abs(norm360(sky.geo[c].fig.ra) - target); return Math.min(d, 360 - d) <= 15; })
      .sort((a, b) => sky.geo[b].fig.dec - sky.geo[a].fig.dec).map((c) => sky.conName(c));
    rows.push(`<tr><td>${fmtDate(date)}</td><td>${fmtRA(sun)}</td><td>${fmtRA(target)}</td><td>${cons.join(', ')}</td></tr>`);
  }
  return '<table class="tbl">' + head(T.ui.monthsHead) + rows.join('') + '</table>';
}

// Созвездия, которые на широте φ целиком не заходят или совсем не видны (по границам).
function latConsHtml(): string {
  const sky = app.sky, phi = state.lat, ui = T.ui;
  const always: string[] = [], never: string[] = [];
  for (const c of sky.cons) {
    const [lo, hi] = sky.conDecRange(c);
    if (phi >= 0 ? lo > 90 - phi : hi < -90 - phi) always.push(sky.conName(c));
    if (phi >= 0 ? hi < phi - 90 : lo > 90 + phi) never.push(sky.conName(c));
  }
  const list = (a: string[]) => (a.length ? a.sort((x, y) => x.localeCompare(y, T.locale)).join(', ') : ui.latConsNone);
  return `<h2>${fill(ui.latConsTitle, { lat: fmtNum(phi, 1) })}</h2><ul class="facts">` +
    `<li><b>${ui.latConsAlways}:</b> ${list(always)}</li><li><b>${ui.latConsNever}:</b> ${list(never)}</li></ul>` +
    `<p class="muted small">${ui.latConsNote}</p>`;
}

export function renderRef() {
  const sky = app.sky, ui = T.ui, el = $('ref');
  let h = `<div class="ref-inner"><h1>${ui.refTitle}</h1>`;
  h += placeHtml('r-lat');

  h += `<h2>${ui.greekTitle}</h2><div class="greek">` + Object.keys(T.greek).map((l) => `<div><b>${l}</b>${T.greek[l]}</div>`).join('') + '</div>';

  h += `<h2>${ui.brightTitle}</h2><div class="tbl-wrap" id="r-bright">${brightTable()}</div>`;
  h += `<p class="muted small">${ui.brightNote}</p>`;

  h += `<h2>${fill(ui.sunTitle, { year: new Date().getFullYear() })}</h2><div class="tbl-wrap">${zodiacTableHtml(app.sky)}</div>`;
  h += `<p class="muted small">${ui.sunNote}</p>`;

  h += `<h2>${ui.monthsTitle}</h2><div class="tbl-wrap" id="r-months">${monthsTable()}</div>`;
  h += `<p class="muted small">${ui.monthsNote}</p>`;

  h += `<div id="r-latcons">${latConsHtml()}</div>`;

  h += `<h2>${ui.formulasTitle}</h2><ul class="facts">` + ui.formulas.map((f) => `<li>${f}</li>`).join('') + '</ul>';

  h += `<h2>${T.tasks.guideTitle}</h2><ul class="facts">` + T.tasks.guide.map((g) => `<li>${g}</li>`).join('') + '</ul>';

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
  bindPlace(el, 'r-lat', () => {
    $('r-bright').innerHTML = brightTable();
    $('r-months').innerHTML = monthsTable();
    $('r-latcons').innerHTML = latConsHtml();
  });
}
