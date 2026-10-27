import type { Sky } from '../core/sky';
import { sunRuns } from '../core/sun';
import { T, fmtDayMonth } from '../i18n';

// Без DOM и app: таблицу «Солнце в созвездиях» строит и сборка — для статической страницы урока «Эклиптика и зодиак».

export const head = (cols: string[]) => '<tr>' + cols.map((c) => `<th>${c}</th>`).join('') + '</tr>';

export function zodiacTableHtml(sky: Sky): string {
  const runs = sunRuns(sky).slice();
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
    return `<tr><td>${sky.conName(r.con)}</td><td>${fmtDayMonth(r.from)} — ${fmtDayMonth(r.to)}</td><td>${days}</td></tr>`;
  }).join('') + '</table>';
}
