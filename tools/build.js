// Сборка после tsc (.build/). Тексты берутся из таблиц texts/*.csv (tools/texts.js). Получается:
//   public/app.js                    — код, один на все языки;
//   public/<язык>/index.html         — главная страница (src/home.html), лёгкая, без карты;
//   public/<язык>/app/index.html     — приложение (src/app.html) с надписями этого языка;
//   public/<язык>/app/text.js        — тексты языка (window.TEXT);
//   public/<язык>/app/south.js       — тексты южного маршрута уроков (window.TEXT_SOUTH), только для южан;
//   public/<язык>/lessons/<id>/      — страницы уроков для поисковиков (src/lesson.html, src/pages/lesson.ts);
//   public/sitemap.xml, robots.txt, 404.html, icon.svg;
//   dist/star-atlas-<язык>.html      — приложение одним файлом: его копируют на телефон без интернета.
// Адрес сайта (для canonical, hreflang, sitemap) — homepage в package.json. Картинки og-*.png и значки — npm run images.
const crypto = require('crypto');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadTexts } = require('./texts');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const SITE = require('../package.json').homepage.replace(/\/$/, '');
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

// Уроки, данные неба и статические страницы уроков (src/pages/lesson.ts) — для главной и страниц уроков.
const pagesJs = esbuild.buildSync({ entryPoints: [path.join(ROOT, '.build/pages/lesson.js')], bundle: true, format: 'cjs', write: false }).outputFiles[0].text;
const pages = { exports: {} };
vm.runInNewContext(pagesJs, { module: pages, exports: pages.exports });
const { LESSONS, SOUTH_ROUTE } = pages.exports;
const skyBox = { window: {} };
vm.runInNewContext(read('sky.js'), skyBox);
const SKY = skyBox.window.SKY;

// Значок сайта. На сайте — файлами (поисковикам нужен значок по адресу, старому Chrome — .ico из npm run images),
// в однофайловой версии — внутри страницы.
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#10172e"/><path d="M16 5l2.6 7.4L26 15l-7.4 2.6L16 25l-2.6-7.4L6 15l7.4-2.6z" fill="#6cc4ff"/></svg>';
const iconLinks = (root) => [
  `<link rel="icon" href="${root}favicon.ico" sizes="48x48">`,
  `<link rel="icon" href="${root}icon.svg" type="image/svg+xml">`,
  `<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">`,
].join('\n');
const iconInline = `<link rel="icon" href="data:image/svg+xml,${ICON.replace(/"/g, "'").replace(/[<>#]/g, encodeURIComponent)}">`;

// Для текста в атрибуте и в <title>.
const esc = (s) => s.replace(/&(?![#\w]+;)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Теги для поисковиков и соцсетей. Адреса — только полные: относительные в canonical и hreflang поисковики не принимают.
// rel — путь страницы внутри языка: '', 'app/', 'lessons/uma/'. x-default (язык не подошёл): для главной — корень
// сайта (он сам выбирает язык), для остальных — английская версия.
function seoHead(t, rel, title, description) {
  const url = (l) => `${SITE}/${l}/${rel}`;
  return [
    `<link rel="canonical" href="${url(t.lang)}">`,
    ...langs.map((l) => `<link rel="alternate" hreflang="${l}" href="${url(l)}">`),
    `<link rel="alternate" hreflang="x-default" href="${rel ? url('en') : SITE + '/'}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${esc(t.page.title)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url(t.lang)}">`,
    `<meta property="og:image" content="${SITE}/og-${t.lang}.png">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:locale" content="${t.ogLocale}">`,
    '<meta name="twitter:card" content="summary_large_image">',
  ].join('\n');
}

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
const sitemap = [];
for (const lang of langs) {
  const t = texts[lang];
  const other = langs[(langs.indexOf(lang) + 1) % langs.length];
  pages.exports.setTexts(t);
  const sky = new pages.exports.Sky(SKY);

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
    pageTitle: esc(t.page.appTitle),
    icons: iconLinks('../../'),
    head: seoHead(t, 'app/', t.page.appTitle, t.page.description),
    otherLangHref: `../../${other}/app/`,
    otherLangCode: other,
    brandTag: 'a',
    brandHref: ' href="../"',
  }));

  // Один файл: всё внутри, ссылка на другой язык — на соседний файл, главной страницы нет.
  // Его не индексируют: это копия приложения для телефона без интернета.
  let single = render(app.replace(/\?v=\{\{\w+\}\}/g, ''), t, {
    lang, pageTitle: esc(t.page.title), icons: iconInline, head: '<meta name="robots" content="noindex">',
    otherLangHref: `star-atlas-${other}.html`, otherLangCode: other, brandTag: 'div', brandHref: '',
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
    icons: iconLinks('../'),
    head: seoHead(t, '', t.home.title, t.page.description),
    otherLangHref: `../${other}/`,
    otherLangCode: other,
    firstLesson: LESSONS[0].id,
    lessons: safeJs(JSON.stringify(LESSONS.map((L) => [L.id, pages.exports.lessonTitle(sky, L)]))),
    southOrder: JSON.stringify(SOUTH_ROUTE.map((s) => s.id)),
    figure: figure(t, false),
    figureSouth: figure(t, true),
    program: pages.exports.programHtml(sky),
    defaultLat: t.defaultLat,
    offlineHref: `../${singleName}`,
    offlineLink: fill(t.home.download, { size: mb }),
  });
  write(path.join(PUB, lang, 'index.html'), home);
  sitemap.push(`${SITE}/${lang}/`, `${SITE}/${lang}/app/`);

  // Страницы уроков. Папку — заново: урок могли переименовать.
  fs.rmSync(path.join(PUB, lang, 'lessons'), { recursive: true, force: true });
  const lessonTpl = template('lesson.html');
  let lessonBytes = 0;
  LESSONS.forEach((L, i) => {
    const slug = pages.exports.lessonSlug(L), p = pages.exports.lessonPage(sky, i);
    const title = `${p.title} · ${t.page.brand}`;
    const html = render(lessonTpl, t, {
      ...v,
      lang,
      title: esc(title),
      description: esc(p.description),
      icons: iconLinks('../../../'),
      head: seoHead(t, `lessons/${slug}/`, title, p.description),
      otherLangHref: `../../../${other}/lessons/${slug}/`,
      otherLangCode: other,
      body: p.body,
    });
    write(path.join(PUB, lang, 'lessons', slug, 'index.html'), html);
    lessonBytes = Math.max(lessonBytes, Buffer.byteLength(html));
    sitemap.push(`${SITE}/${lang}/lessons/${slug}/`);
  });
  console.log(`${lang}: главная ${kb(home)}, text.js ${kb(textJs)}, south.js ${kb(southJs)}, dist/${singleName} ${kb(single)}, ` +
    `${LESSONS.length} страниц уроков (самая большая ${Math.round(lessonBytes / 1024)} КБ)`);
  if (!fs.existsSync(path.join(PUB, `og-${lang}.png`))) console.log(`Внимание: нет public/og-${lang}.png (картинка для соцсетей) — npm run images`);
}

// Для поисковиков: список страниц, robots.txt со ссылкой на него, значок и страница «нет такой страницы».
write(path.join(PUB, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemap.map((u) => `<url><loc>${u}</loc></url>`).join('\n') + '\n</urlset>\n');
write(path.join(PUB, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
write(path.join(PUB, 'icon.svg'), ICON + '\n');
// 404.html GitHub Pages показывает по любому неизвестному адресу, поэтому ссылки в ней — полные.
write(path.join(PUB, '404.html'), `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${langs.map((l) => texts[l].site.notFound).join(' · ')}</title>
${iconLinks(SITE + '/')}
<style>
  body { margin: 0; padding: 60px 20px; background: #0b1020; color: #e7ecff; font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center; }
  a { color: #6cc4ff; }
  p { margin: 0 0 24px; }
</style>
</head>
<body>
${langs.map((l) => `<p lang="${l}"><b>${texts[l].site.notFound}</b><br><a href="${SITE}/${l}/">${texts[l].site.toHome}</a></p>`).join('\n')}
</body>
</html>
`);
// Прежнее имя офлайн-файла (до разделения по языкам).
if (fs.existsSync(path.join(DIST, 'star-atlas.html'))) fs.unlinkSync(path.join(DIST, 'star-atlas.html'));
console.log(`app.js ${kb(read('app.js'))}, sky.js ${kb(read('sky.js'))}, sitemap.xml: ${sitemap.length} адресов (${SITE})`);
