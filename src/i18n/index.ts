import { norm360, pad2 } from '../core/math';
import type { Texts } from './types';

// Тексты текущего языка (из таблиц texts/*.csv). Их загружает отдельный скрипт text.js (window.TEXT);
// main.ts передаёт их сюда первым делом, до создания карты и вкладок.
export let T = null as unknown as Texts;
export function setTexts(t: Texts) { T = t; }

// Номер формы множественного числа: «1 звезда, 2 звезды, 5 звёзд» / «1 star, 2 stars».
const PLURAL: Record<string, (n: number) => number> = {
  ru: (n) => (n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2),
  en: (n) => (n === 1 ? 0 : 1),
};

// Заполнить надпись из таблицы: «Урок {n} из {total}» — значение,
// «{stars:звезда|звезды|звёзд}» — форма слова для числа stars.
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)(?::([^}]*))?\}/g, (m, k: string, forms?: string) => {
    if (!(k in vars)) return m;
    if (!forms) return String(vars[k]);
    const f = forms.split('|'), rule = PLURAL[T.lang] || PLURAL.en;
    return f[Math.min(rule(+vars[k]), f.length - 1)];
  });
}

// ---------- форматирование ----------

const minus = (x: number) => (x < 0 ? '−' : '');

export function fmtNum(x: number, digits = 1): string {
  const s = Math.abs(x).toFixed(digits);
  return (+s === 0 ? '' : minus(x)) + s.replace('.', T.decimal);
}

export function fmtMag(m: number, digits = 1): string {
  return fmtNum(m, digits) + '<sup>m</sup>';
}

export function fmtRA(ra: number): string {
  const tm = Math.round(norm360(ra) / 15 * 60);
  return `${Math.floor(tm / 60) % 24}${T.hour}${pad2(tm % 60)}${T.minute}`;
}

export function fmtDec(dec: number): string {
  const t = Math.round(Math.abs(dec) * 60);
  return `${dec < 0 ? '−' : '+'}${Math.floor(t / 60)}°${pad2(t % 60)}′`;
}

export function fmtDeg(x: number): string {
  return `${minus(x)}${Math.round(Math.abs(x))}°`;
}

export const fmtDayMonth = (d: Date) => `${d.getUTCDate()} ${T.months[d.getUTCMonth()]}`;
