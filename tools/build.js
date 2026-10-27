// Сборка после tsc (.build/). Тексты берутся из таблиц texts/*.csv (tools/texts.js). Получается:
//   public/app.js                    — код, один на все языки;
//   public/<язык>/index.html         — главная страница (src/home.html), лёгкая, без карты;
//   public/<язык>/app/index.html     — приложение (src/app.html) с надписями этого языка;
//   public/<язык>/app/text.js        — тексты языка (window.TEXT);
//   public/<язык>/app/south.js       — тексты южного маршрута уроков (window.TEXT_SOUTH), только для южан;
//   dist/star-atlas-<язык>.html      — приложение одним файлом: его копируют на телефон без интернета.
const crypto = require('crypto');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadTexts } = require('./texts');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
// esbuild только склеивает и сжимает: в ES5 код переводит tsc, а --target=es5 проверяет, что новинок не осталось.
const common = { bundle: true, minify: true, charset: 'utf8', target: 'es5', logLevel: 'warning' };

const { langs, texts, south, errors, warnings } = loadTexts();
for (const w of warnings) console.log('Внимание:', w);
if (errors.length) {
  for (const e of errors) console.log('ОШИБКА:', e);
  process.exit(1);
}

esbuild.buildSync({ ...common, entryPoints: [path.join(ROOT, '.build/main.js')], outfile: path.join(PUB, 'app.js') });

const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const template = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/\r\n/g, '\n');
// JSON внутри <script>: без «</script» и без U+2028/2029 (в старом JS это перевод строки).
const safeJs = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)} КБ`;
// Метка содержимого в адресе (app.js?v=…): файл изменился — адрес новый, и браузер не возьмёт старый из кэша.
const ver = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 10);

// Уроки (устройство) и данные неба — для главной страницы.
const lessonsJs = esbuild.buildSync({ entryPoints: [path.join(ROOT, '.build/data/lessons.js')], bundle: true, format: 'cjs', write: false }).outputFiles[0].text;
const lessonsMod = { exports: {} };
vm.runInNewContext(lessonsJs, { module: lessonsMod, exports: lessonsMod.exports });
const { LESSONS, SOUTH_ROUTE } = lessonsMod.exports;
const skyBox = { window: {} };
vm.runInNewContext(read('sky.js'), skyBox);
const SKY = skyBox.window.SKY;

// Иконки разделов: в нижних вкладках приложения и на карточках главной.
const ICONS = {
  learn: '<svg viewBox="0 0 24 24"><path d="M4 5c3-1.5 5.5-1.5 8 0v14c-2.5-1.5-5-1.5-8 0zM12 5c2.5-1.5 5-1.5 8 0v14c-3-1.5-5.5-1.5-8 0"/></svg>',
  quiz: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8"/></svg>',
  tasks: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 9.5l2 2 4-4M8 16h8"/></svg>',
  atlas: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 6.5l1.4 3.9 3.9 1.4-3.9 1.4L12 17.5l-1.4-4.3-3.9-1.4 3.9-1.4z"/></svg>',
  ref: '<svg viewBox="0 0 24 24"><path d="M6 4h12v16H6zM9 9h6M9 13h6M9 17h3"/></svg>',
  // Стрелка «вверх» для кнопок панели; в нужную сторону её поворачивает CSS.
  chevron: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// {{page.title}} → тексты языка; {{figure}} и т. п. — из vars (готовый HTML).
function render(tpl, t, vars) {
  return tpl.replace(/\{\{([\w.]+)\}\}/g, (_m, k) => {
    if (k in vars) return String(vars[k]);
    if (/^icon\./.test(k)) return ICONS[k.slice(5)];
    const v = k.split('.').reduce((o, p) => (o ? o[p] : undefined), t);
    if (typeof v !== 'string') throw new Error(`${t.lang}: в таблицах нет текста ${k}`);
    return v.replace(/"/g, '&quot;');
  });
}

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const lessonTitle = (t, L) => (t.lessons[L.id] && t.lessons[L.id].title) || t.cons[L.cons[0]].name;

// Картинки для главной — по настоящим координатам, в той же проекции, что карта (стереографическая).
function figure(t, south) {
  const W = 420, H = 300, D = Math.PI / 180;
  const vec = (ra, dec) => [Math.cos(dec * D) * Math.cos(ra * D), Math.cos(dec * D) * Math.sin(ra * D), Math.sin(dec * D)];
  // «α Cru» — это α¹ Cru: как в Sky, ищем и с номером; звёзды идут по яркости, поэтому первая найденная — ярчайшая.
  const find = (bayer, con) => {
    for (const k of Object.keys(SKY.names)) { const n = SKY.names[k]; if (n[1] === con && n[0].replace(/\d+$/, '') === bayer) return +k; }
    throw new Error(`build.js: нет звезды ${bayer} ${con}`);
  };
  const at = (i) => ({ ra: SKY.stars[4 * i], dec: SKY.stars[4 * i + 1], mag: SKY.stars[4 * i + 2] });
  const star = (key) => { const [b, c] = key.split(' '); return at(find(b, c)); };
  // Север: Мерак → Дубхе → Полярная (×5). Юг: Гакрукс → Акрукс → южный полюс мира (×4,5), юг сверху —
  // так южное небо видит наблюдатель в южном полушарии, и полюс, как и Полярная, оказывается вверху.
  const scene = south ? {
    figs: { Cru: '#86d2ff' }, from: star('γ Cru'), to: { ra: 0, dec: -89.99, mag: 9 },
    ptr: `×4${t.decimal}5`, toLabel: t.dso.SCP.label || t.dso.SCP.name, flip: true, caption: t.home.figureSouth,
    // «Указатели» α и β Центавра — без всей огромной фигуры Центавра, чтобы Крест не терялся.
    pair: ['α Cen', 'β Cen'],
    labels: [['α Cru', -9, 4, 'end'], ['γ Cru', -9, 4, 'end'], ['α Cen', 9, 4], ['β Cen', 9, 4]],
  } : {
    figs: { UMa: '#86d2ff', UMi: '#5f74a8' }, from: star('β UMa'), to: star('α UMi'),
    ptr: (t.lessons.UMi && t.lessons.UMi.labels && t.lessons.UMi.labels[0]) || '×5', toLabel: t.stars['α UMi'], flip: false, caption: t.home.figure,
    labels: [['α UMa', -8, -7, 'end'], ['β UMa', 8, 14]],
  };
  const pts = [vec(scene.to.ra, scene.to.dec)];
  for (const k of scene.pair || []) { const st = star(k); pts.push(vec(st.ra, st.dec)); }
  for (const c of Object.keys(scene.figs)) for (const l of SKY.lines[c]) for (let i = 0; i < l.length; i += 2) pts.push(vec(l[i], l[i + 1]));
  const m = pts.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]);
  const ml = Math.hypot(m[0], m[1], m[2]), c0 = [m[0] / ml, m[1] / ml, m[2] / ml];
  const east = [-c0[1], c0[0], 0].map((x) => x / Math.hypot(c0[0], c0[1]));
  const north = [c0[1] * east[2] - c0[2] * east[1], c0[2] * east[0] - c0[0] * east[2], c0[0] * east[1] - c0[1] * east[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = scene.flip ? -1 : 1;
  const raw = (v) => { const k = 2 / (1 + dot(v, c0)); return [-f * k * dot(v, east), -f * k * dot(v, north)]; };
  const ps = pts.map(raw);
  const x0 = Math.min(...ps.map((p) => p[0])), x1 = Math.max(...ps.map((p) => p[0]));
  const y0 = Math.min(...ps.map((p) => p[1])), y1 = Math.max(...ps.map((p) => p[1]));
  const s = Math.min((W - 130) / (x1 - x0), (H - 50) / (y1 - y0));
  const ox = (W - s * (x1 - x0)) / 2 - s * x0, oy = (H - s * (y1 - y0)) / 2 - s * y0;
  // Целые пиксели: картинка 420×300, а размер страницы важен — она должна открываться сразу.
  const P = (ra, dec) => { const p = raw(vec(ra, dec)); return [Math.round(ox + s * p[0]), Math.round(oy + s * p[1])]; };
  const r = (mag) => Math.max(0.6, 3.4 - 0.55 * mag).toFixed(1);
  const out = [];
  // Фоновые звёзды до 4,6ᵐ — двумя группами по яркости, чтобы не повторять цвет у каждой.
  const bg = [[], []];
  for (let i = 0; i < SKY.hip.length; i++) {
    const st = at(i);
    if (st.mag > 4.6 || dot(vec(st.ra, st.dec), c0) < 0.5) continue;
    const [x, y] = P(st.ra, st.dec);
    if (x < 2 || y < 2 || x > W - 2 || y > H - 2) continue;
    bg[st.mag < 3 ? 0 : 1].push(`<circle cx="${x}" cy="${y}" r="${r(st.mag)}"/>`);
  }
  out.push(`<g fill="#cfd8ff" fill-opacity="0.55">${bg[0].join('')}</g><g fill="#cfd8ff" fill-opacity="0.35">${bg[1].join('')}</g>`);
  // Линии созвездий: первое — как новое созвездие урока, второе — как знакомое.
  for (const c of Object.keys(scene.figs)) {
    for (const l of SKY.lines[c]) {
      const q = [];
      for (let i = 0; i < l.length; i += 2) q.push(P(l[i], l[i + 1]).join(','));
      out.push(`<polyline points="${q.join(' ')}" fill="none" stroke="${scene.figs[c]}" stroke-width="1.6" stroke-linejoin="round"/>`);
    }
  }
  if (scene.pair) {
    const [p1, p2] = scene.pair.map((k) => { const st = star(k); return P(st.ra, st.dec); });
    out.push(`<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="#5f74a8" stroke-width="1.4"/>`);
  }
  // Указатель со стрелкой к цели.
  const a = P(scene.from.ra, scene.from.dec), b = P(scene.to.ra, scene.to.dec);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  const tip = [b[0] - ux * 9, b[1] - uy * 9];
  out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${tip[0].toFixed(1)}" y2="${tip[1].toFixed(1)}" stroke="#ffd76e" stroke-width="1.8" stroke-dasharray="6 5"/>`);
  out.push(`<path d="M${tip[0].toFixed(1)},${tip[1].toFixed(1)} l${(-ux * 9 - uy * 5).toFixed(1)},${(-uy * 9 + ux * 5).toFixed(1)} l${(uy * 10).toFixed(1)},${(-ux * 10).toFixed(1)}z" fill="#ffd76e"/>`);
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  out.push(`<text x="${(mx + 10).toFixed(1)}" y="${(my - 6).toFixed(1)}" fill="#ffd76e" font-weight="600">${scene.ptr}</text>`);
  // Цель: звезда или точка полюса (кружок с крестиком).
  if (scene.to.mag < 6) out.push(`<circle cx="${b[0]}" cy="${b[1]}" r="${(+r(scene.to.mag) + 0.6).toFixed(1)}" fill="#eef4ff"/>`);
  else out.push(`<circle cx="${b[0]}" cy="${b[1]}" r="4" fill="none" stroke="#eef4ff" stroke-width="1.4"/><path d="M${b[0] - 7},${b[1]}h14M${b[0]},${b[1] - 7}v14" stroke="#eef4ff" stroke-width="1"/>`);
  out.push(`<text x="${(b[0] + 9).toFixed(1)}" y="${(b[1] + 4).toFixed(1)}" fill="#eef4ff">${scene.toLabel}</text>`);
  for (const [key, dx, dy, anchor] of scene.labels) {
    const st = star(key), [x, y] = P(st.ra, st.dec);
    out.push(`<circle cx="${x}" cy="${y}" r="${(+r(st.mag) + 0.6).toFixed(1)}" fill="#eef4ff"/>`);
    out.push(`<text x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" fill="#eef4ff" text-anchor="${anchor || 'start'}">${t.stars[key]}</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" role="img" aria-label="${scene.caption.replace(/"/g, '&quot;')}">${out.join('')}</svg>`;
}

fs.mkdirSync(DIST, { recursive: true });
for (const lang of langs) {
  const t = texts[lang];
  const other = langs[(langs.indexOf(lang) + 1) % langs.length];

  // Тексты языка — JSON, оформленный как скрипт (window.TEXT, как window.SKY в sky.js).
  const textJs = `// Сгенерировано tools/build.js из texts/*.csv. Не редактировать вручную.\nwindow.TEXT = ${safeJs(JSON.stringify(t))};\n`;
  write(path.join(PUB, lang, 'app', 'text.js'), textJs);
  // Тексты южного маршрута — отдельным файлом: его загружают только южане.
  const southJs = `// Сгенерировано tools/build.js из texts/south.csv. Не редактировать вручную.\nwindow.TEXT_SOUTH = ${safeJs(JSON.stringify(south[lang]))};\n`;
  write(path.join(PUB, lang, 'app', 'south.js'), southJs);
  const v = { vApp: ver(read('app.js')), vStyle: ver(read('style.css')), vSky: ver(read('sky.js')), vText: ver(textJs), vSouth: ver(southJs) };

  const app = template('app.html');
  write(path.join(PUB, lang, 'app', 'index.html'), render(app, t, {
    ...v,
    lang,
    alternates: langs.map((l) => `<link rel="alternate" hreflang="${l}" href="../../${l}/app/">`).join('\n'),
    otherLangHref: `../../${other}/app/`,
    otherLangCode: other,
    brandTag: 'a',
    brandHref: ' href="../"',
  }));

  // Один файл: всё внутри, ссылка на другой язык — на соседний файл, главной страницы нет.
  let single = render(app.replace(/\?v=\{\{\w+\}\}/g, ''), t, {
    lang, alternates: '', otherLangHref: `star-atlas-${other}.html`, otherLangCode: other, brandTag: 'div', brandHref: '',
  });
  single = single
    .replace('<link rel="stylesheet" href="../../style.css">', () => `<style>\n${read('style.css')}\n</style>`)
    .replace('<script src="../../sky.js"></script>', () => `<script>\n${safeJs(read('sky.js'))}\n</script>`)
    .replace('<script src="text.js"></script>', () => `<script>\n${textJs}\n</script>`)
    .replace(/<script>window\.SOUTH_JS[^\n]*<\/script>/, () => `<script>\n${southJs}\n</script>`)
    .replace('<script src="../../app.js"></script>', () => `<script>\n${safeJs(read('app.js'))}\n</script>`);
  if (/<(script|link)[^>]+(src|href)="(?!data:)/.test(single)) throw new Error(`dist/star-atlas-${lang}.html: остались внешние файлы`);
  const singleName = `star-atlas-${lang}.html`;
  write(path.join(DIST, singleName), single);

  const mb = (Buffer.byteLength(single) / 1048576).toFixed(1).replace('.', t.decimal);
  const home = render(template('home.html'), t, {
    ...v,
    lang,
    alternates: langs.map((l) => `<link rel="alternate" hreflang="${l}" href="../${l}/">`).join('\n'),
    otherLangHref: `../${other}/`,
    otherLangCode: other,
    firstLesson: LESSONS[0].id,
    lessons: safeJs(JSON.stringify(LESSONS.map((L) => [L.id, lessonTitle(t, L)]))),
    southOrder: JSON.stringify(SOUTH_ROUTE.map((s) => s.id)),
    figure: figure(t, false),
    figureSouth: figure(t, true),
    defaultLat: t.defaultLat,
    offlineHref: `../${singleName}`,
    offlineLink: fill(t.home.download, { size: mb }),
  });
  write(path.join(PUB, lang, 'index.html'), home);
  console.log(`${lang}: главная ${kb(home)}, text.js ${kb(textJs)}, south.js ${kb(southJs)}, dist/${singleName} ${kb(single)}`);
}
// Прежнее имя офлайн-файла (до разделения по языкам).
if (fs.existsSync(path.join(DIST, 'star-atlas.html'))) fs.unlinkSync(path.join(DIST, 'star-atlas.html'));
console.log(`app.js ${kb(read('app.js'))}, sky.js ${kb(read('sky.js'))}`);
