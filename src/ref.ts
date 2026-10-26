import { $, app, each, save, state } from './app';
import { goCon } from './atlas';
import { GREEK } from './catalog';
import { lessonOfCon } from './learn';
import { eclToEq, fmtDayMonth, fmtDec, fmtMag, fmtNum, fmtRA, sunLongitude, visibility, fmtDeg } from './math';

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

export function zodiacTableHtml(): string {
  const runs = sunRuns().slice();
  // Стрелец переходит через Новый год — склеиваем начало и конец года.
  let first = runs[0];
  const last = runs[runs.length - 1];
  if (runs.length > 1 && first.con === last.con) {
    first = { con: first.con, from: last.from, to: first.to };
    runs.shift(); runs.pop(); runs.unshift(first);
  }
  return '<table class="tbl"><tr><th>Созвездие</th><th>Солнце</th><th>дней</th></tr>' + runs.map((r) => {
    let days = Math.round((r.to.getTime() - r.from.getTime()) / 86400000) + 1;
    if (days < 0) days += 365;
    return `<tr><td>${app.sky.conName(r.con)}</td><td>${fmtDayMonth(r.from)} — ${fmtDayMonth(r.to)}</td><td>${days}</td></tr>`;
  }).join('') + '</table>';
}

function visShort(dec: number): string {
  const v = visibility(dec, state.lat);
  return v.kind === 'never-sets' ? `не заходит (${fmtDeg(v.hmax)})` : v.kind === 'never-rises' ? 'не восходит' : `до ${fmtDeg(v.hmax)}`;
}

function brightTable(): string {
  const sky = app.sky, rows: string[] = [];
  for (let i = 0; i < sky.n && rows.length < 25; i++) {
    const name = sky.starName(i);
    if (!name) continue;
    rows.push(`<tr><td>${rows.length + 1}</td><td><b>${name}</b></td><td>${sky.starDesig(i)}<br><span class="muted">${sky.starDesig(i, true)}</span></td>` +
      `<td>${fmtMag(sky.mag[i], 2)}</td><td>${fmtRA(sky.ra[i])}</td><td>${fmtDec(sky.dec[i])}</td><td>${visShort(sky.dec[i])}</td></tr>`);
  }
  return `<table class="tbl"><tr><th>№</th><th>Звезда</th><th>Обозначение</th><th>m</th><th>α</th><th>δ</th><th>На широте ${fmtNum(state.lat, 1)}°</th></tr>${rows.join('')}</table>`;
}

const ASTERISMS: [string, string][] = [
  ['Большой Ковш', 'семь ярких звёзд Большой Медведицы'],
  ['Летний треугольник', 'Вега (Лира), Денеб (Лебедь), Альтаир (Орёл)'],
  ['Зимний треугольник', 'Бетельгейзе (Орион), Сириус (Большой Пёс), Процион (Малый Пёс)'],
  ['Зимний шестиугольник', 'Сириус, Процион, Поллукс, Капелла, Альдебаран, Ригель'],
  ['Большой квадрат Пегаса', 'Альферац (Андромеда), Шеат, Маркаб, Альгениб (Пегас)'],
  ['Пояс Ориона', 'Минтака, Альнилам, Альнитак'],
  ['Северный крест', 'главные звёзды Лебедя: Денеб, Садр, Альбирео и крылья'],
  ['Чайник', 'восемь звёзд Стрельца'],
  ['Серп Льва', 'голова и грудь Льва с Регулом'],
  ['Трапеция Геркулеса', 'туловище Геркулеса, рядом M13'],
  ['Кувшин', 'четыре звезды Водолея около Садалмелика'],
  ['Колечко', 'кольцо слабых звёзд западной Рыбы'],
  ['Ложный крест', 'ε и ι Киля, δ и κ Парусов — похож на Южный Крест'],
];

export function renderRef() {
  const sky = app.sky, el = $('ref');
  let h = '<div class="ref-inner"><h1>Шпаргалка</h1>';
  h += `<label class="lat">Моя широта <input id="r-lat" type="number" step="0.1" min="-90" max="90" value="${state.lat}"> °</label>`;

  h += '<h2>Греческий алфавит</h2><div class="greek">' + GREEK.map(([l, n]) => `<div><b>${l}</b>${n}</div>`).join('') + '</div>';

  h += '<h2>Ярчайшие звёзды</h2><div class="tbl-wrap" id="r-bright">' + brightTable() + '</div>';
  h += '<p class="muted small">Координаты на эпоху J2000. В скобках — наибольшая высота над горизонтом.</p>';

  h += `<h2>Солнце в созвездиях (${new Date().getFullYear()})</h2><div class="tbl-wrap">${zodiacTableHtml()}</div>`;
  h += '<p class="muted small">Посчитано по настоящим границам созвездий. Это не астрологические «знаки».</p>';

  h += '<h2>Формулы видимости</h2><ul class="facts">' +
    '<li>Не заходит: <b>δ &gt; 90° − φ</b>. Не восходит: <b>δ &lt; −(90° − φ)</b>.</li>' +
    '<li>Высота в верхней кульминации: <b>h = 90° − |φ − δ|</b> (для звёзд южнее зенита — 90° − φ + δ).</li>' +
    '<li>Высота Полярной ≈ широте места φ.</li>' +
    '<li>α Солнца ≈ 0ч 21 марта, 6ч 22 июня, 12ч 23 сентября, 18ч 22 декабря (+2ч в месяц).</li>' +
    '<li>В полночь на юге звёзды с α ≈ α Солнца + 12ч. Полная Луна — напротив Солнца.</li>' +
    '<li>Звёздные сутки = 23ч 56м 4с: каждый день звёзды восходят на ~4 минуты раньше.</li>' +
    '<li>Разница в 5<sup>m</sup> — в 100 раз по яркости; 1<sup>m</sup> — в 2,512 раза.</li></ul>';

  h += '<h2>Астеризмы</h2><ul class="facts">' + ASTERISMS.map(([a, b]) => `<li><b>${a}</b> — ${b}</li>`).join('') + '</ul>';

  const cons = sky.cons.slice().sort((a, b) => sky.conName(a).localeCompare(sky.conName(b), 'ru'));
  h += '<h2>Все 88 созвездий</h2><div class="tbl-wrap"><table class="tbl"><tr><th>Созвездие</th><th>Латынь</th><th>Род. падеж</th><th></th><th>Урок</th></tr>' +
    cons.map((a) => {
      const li = lessonOfCon(a);
      return `<tr class="click" data-con="${a}"><td><b>${sky.conName(a)}</b></td><td>${sky.conLatin(a)}</td><td>${sky.conLatinGen(a)}</td><td>${a}</td><td>${li >= 0 ? li + 1 : ''}</td></tr>`;
    }).join('') + '</table></div>';

  const dso = Object.keys(sky.dsoById).map((k) => sky.dsoById[k]).filter((d) => d.type !== 'pt');
  h += '<h2>Объекты</h2><div class="tbl-wrap"><table class="tbl"><tr><th>Объект</th><th>Что это</th><th>Созвездие</th><th>α</th><th>δ</th></tr>' +
    dso.map((d) => {
      const c = sky.conAt(d.ra, d.dec);
      return `<tr><td><b>${d.label || d.id}</b></td><td>${d.name}</td><td>${c ? sky.conName(c) : ''}</td><td>${fmtRA(d.ra)}</td><td>${fmtDec(d.dec)}</td></tr>`;
    }).join('') + '</table></div>';

  h += '<p class="muted small credits">Данные о звёздах, линиях и границах созвездий: проект d3-celestial (Olaf Frohn), каталоги Hipparcos и IAU.</p></div>';
  el.innerHTML = h;
  each(el.querySelectorAll('tr[data-con]'), (tr) => tr.addEventListener('click', () => goCon((tr as HTMLElement).dataset.con!)));
  const lat = el.querySelector('#r-lat') as HTMLInputElement;
  lat.addEventListener('change', () => {
    const v = parseFloat(lat.value.replace(',', '.'));
    if (!isNaN(v) && v >= -90 && v <= 90) { state.lat = v; save(); $('r-bright').innerHTML = brightTable(); }
  });
}
