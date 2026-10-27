// Тексты сайта лежат в таблицах texts/*.csv: столбец key и по столбцу на каждый язык (ru — эталон).
// Модуль читает таблицы и собирает для каждого языка объект Texts (см. src/i18n/types.ts).
// Ключ — путь в этом объекте: «ui.check», «lessons.UMa.facts.2» (число — номер в списке, с 1).
//
// Запуск как скрипт (npm run texts): проверить таблицы и записать src/i18n/gen/ru.json —
// по нему TypeScript знает, какие надписи есть (T.ui.check и т. п.).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'texts');
const FILES = ['ui', 'catalog', 'lessons', 'tasks'];
// Тексты южного маршрута уроков — отдельно: они попадают в south.js, который загружается только для южного полушария.
const SOUTH_FILES = ['south'];
const REF = 'ru';
// Значения-числа (остальное — строки).
const NUMBERS = { defaultLat: true };

// CSV по RFC 4180: значения в кавычках могут содержать разделитель, кавычки ("") и переводы строк.
// Разделитель — «;» или «,»: смотрим, какой стоит после key в первой строке.
function parseCsv(text) {
  const sep = /^key\s*;/.test(text) ? ';' : ',';
  const rows = [];
  let row = [], cell = '', i = 0, quoted = false, line = 1, rowLine = 1;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      if (c === '\n') line++;
      cell += c; i++;
      continue;
    }
    if (c === '"' && cell === '') { quoted = true; i++; continue; }
    if (c === sep) { row.push(cell); cell = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') { row.line = rowLine; rows.push(row); }
      row = [];
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++; line++; rowLine = line;
      continue;
    }
    cell += c; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); row.line = rowLine; rows.push(row); }
  return rows;
}

function readFile(file) {
  const buf = fs.readFileSync(file);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    throw new Error(`${path.relative(ROOT, file)}: файл не в UTF-8. В Excel сохраняй как «CSV UTF-8 (разделитель — запятая)».`);
  }
  return text.replace(/^﻿/, '');
}

const placeholders = (s) => (s.match(/\{\w+(?::[^}]*)?\}/g) || []).map((p) => p.replace(/:.*\}$/, '}')).sort().join(' ');

// «lessons.UMa.facts.2» → obj.lessons.UMa.facts[1]
function put(obj, key, value) {
  const parts = key.split('.');
  let o = obj;
  for (let k = 0; k < parts.length; k++) {
    const isIndex = /^\d+$/.test(parts[k]);
    const p = isIndex ? +parts[k] - 1 : parts[k];
    if (k === parts.length - 1) { o[p] = value; return; }
    if (o[p] === undefined) o[p] = /^\d+$/.test(parts[k + 1]) ? [] : {};
    o = o[p];
  }
}

function loadTexts() {
  const main = loadGroup(FILES), south = loadGroup(SOUTH_FILES);
  const errors = main.errors.concat(south.errors), warnings = main.warnings.concat(south.warnings);
  if (south.langs.join() !== main.langs.join()) errors.push(`texts/south.csv: языки ${south.langs.join(', ')}, а в остальных таблицах — ${main.langs.join(', ')}`);
  return { langs: main.langs, texts: main.texts, south: south.texts, errors, warnings };
}

function loadGroup(files) {
  const errors = [], warnings = [];
  let langs = null;
  const rows = [], seen = {};
  for (const name of files) {
    const file = path.join(DIR, `${name}.csv`), rel = `texts/${name}.csv`;
    const table = parseCsv(readFile(file));
    const head = table.shift().map((h) => h.trim());
    if (head[0] !== 'key') throw new Error(`${rel}: первый столбец должен называться key`);
    const cols = head.slice(1).filter(Boolean);
    if (!langs) langs = cols;
    else if (cols.join() !== langs.join()) errors.push(`${rel}: языки ${cols.join(', ')}, а в других таблицах — ${langs.join(', ')}`);
    if (cols.indexOf(REF) < 0) throw new Error(`${rel}: нет столбца ${REF}`);
    for (const r of table) {
      const key = (r[0] || '').trim();
      if (!key) continue;
      const where = `${rel}:${r.line} ${key}`;
      if (seen[key]) { errors.push(`${where}: ключ уже есть в ${seen[key]}`); continue; }
      seen[key] = `${rel}:${r.line}`;
      const vals = {};
      cols.forEach((l, k) => { vals[l] = (r[k + 1] || '').replace(/\r\n?/g, '\n').trim(); });
      rows.push({ key, vals, where });
    }
  }

  const texts = {};
  for (const lang of langs) {
    const t = {};
    let missing = 0;
    for (const { key, vals, where } of rows) {
      let v = vals[lang];
      const ref = vals[REF];
      if (!v && ref) {
        // Не переведено — показываем эталонный текст, чтобы сайт собрался и с неполным переводом.
        v = ref;
        missing++;
        if (missing <= 10) warnings.push(`${lang}: не переведено ${where}`);
      }
      if (!v) continue;
      if (lang !== REF && ref && placeholders(v) !== placeholders(ref)) {
        errors.push(`${lang}: ${where}: подстановки «${placeholders(v)}», а в ${REF} — «${placeholders(ref)}»`);
      }
      put(t, key, NUMBERS[key] ? parseFloat(v.replace(',', '.')) : v);
    }
    if (missing > 10) warnings.push(`${lang}: … всего не переведено строк: ${missing}`);
    texts[lang] = t;
  }
  return { langs, texts, errors, warnings };
}

module.exports = { loadTexts, parseCsv };

if (require.main === module) {
  const { texts, errors, warnings } = loadTexts();
  for (const w of warnings) console.log('Внимание:', w);
  if (errors.length) {
    for (const e of errors) console.log('ОШИБКА:', e);
    process.exit(1);
  }
  const gen = path.join(ROOT, 'src', 'i18n', 'gen');
  fs.mkdirSync(gen, { recursive: true });
  fs.writeFileSync(path.join(gen, `${REF}.json`), JSON.stringify(texts[REF], null, 1));
}
