// Эмуляция встроенного Chrome 37–50 (Android 5–6) в headless Chrome: перед загрузкой удаляем новые API
// (Pointer Events, Set/Map, NodeList.forEach, .fill и др.), открываем урок по адресу и проходим его касаниями,
// проверяем адреса разделов и «назад», щипок, тренировку, шпаргалку, заливку Млечного Пути с 400 точек обзора
// и главную страницу.
//
// Запуск: npm run e2e  (или node tools/e2e/old-browser.js [--dist] [--lang=en])
// Chrome: переменная CHROME_PATH или стандартный путь установки.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const useDist = process.argv.indexOf('--dist') >= 0;
const langArg = process.argv.filter((a) => /^--lang=/.test(a))[0];
const LANG = langArg ? langArg.slice(7) : 'ru';
const REL = useDist ? `dist/star-atlas-${LANG}.html` : `public/${LANG}/app/index.html`;
const FILE = pathToFileURL(path.join(ROOT, REL)).href;
const HOME = pathToFileURL(path.join(ROOT, 'public', LANG, 'index.html')).href;
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const failures = [];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.evaluateOnNewDocument(() => {
    const kill = (obj, names) => names.forEach((n) => { try { delete obj[n]; } catch (e) { /* пропускаем */ } });
    kill(window, ['PointerEvent', 'ResizeObserver', 'Set', 'Map', 'WeakSet', 'Promise', 'IntersectionObserver']);
    kill(NodeList.prototype, ['forEach']);
    kill(Array.prototype, ['find', 'findIndex', 'includes', 'fill', 'flat', 'flatMap']);
    kill(Object.getPrototypeOf(Int8Array.prototype), ['fill', 'includes', 'find']);
    kill(Object, ['assign', 'entries', 'values']);
    kill(Array, ['from', 'of']);
    kill(String.prototype, ['includes', 'startsWith', 'endsWith', 'padStart', 'repeat']);
    kill(Math, ['hypot', 'sign', 'trunc']);
    kill(Element.prototype, ['closest']);
    kill(KeyboardEvent.prototype, ['key']);
    window.__oldEnv = !window.Set && !window.PointerEvent && !NodeList.prototype.forEach;
  });
  await page.emulate({
    viewport: { width: 400, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 5.1; SM-J320F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0 Mobile Safari/537.36',
  });
  // 1. Урок «Волопас» по адресу #lesson/Boo.
  await page.goto(FILE + '?debug#lesson/Boo', { waitUntil: 'load' });
  await wait(800);
  console.log(`Файл: ${REL}`);
  if (!(await page.evaluate(() => window.__oldEnv))) failures.push('не удалось удалить новые API');
  const title = await page.evaluate(() => [document.querySelector('#panel h1').textContent, window.TEXT.cons.Boo.name]);
  if (title[0] !== title[1]) failures.push(`по адресу #lesson/Boo открылся урок «${title[0]}»`);

  const cdp = await page.target().createCDPSession();
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const box = async () => (await page.$('#sky')).boundingBox();
  const tapSky = async (ra, dec) => {
    const b = await box();
    const p = await page.evaluate((ra, dec) => window.__app.map.project(ra, dec), ra, dec);
    await tap(b.x + p[0], b.y + p[1]);
  };

  // 2. «Проверь себя» касаниями (все ответы правильные).
  await page.evaluate(() => document.querySelector('#l-check').click());
  await wait(900);
  for (let k = 0; k < 8; k++) {
    const name = await page.evaluate(() => {
      const b = document.querySelector('#banner.show b');
      return b && document.querySelector('#banner .cnt') ? b.textContent : null;
    });
    if (!name) break;
    const t = await page.evaluate((name) => {
      const s = window.__app.sky;
      for (let i = 0; i < s.n; i++) if (s.curatedName(i) === name || s.starDesig(i) === name) return [s.ra[i], s.dec[i]];
      return null;
    }, name);
    if (!t) { failures.push(`в самопроверке не нашлась звезда «${name}»`); break; }
    await tapSky(t[0], t[1]);
    await wait(1100);
  }
  await wait(400);
  const score = await page.evaluate(() => JSON.parse(localStorage.getItem('sa.done') || '{}').Boo);
  console.log('Самопроверка «Boo» касаниями:', score);
  if (score !== '4/4') failures.push(`самопроверка: ${score}, ожидалось 4/4`);

  // 3. Перетаскивание и щипок пальцами.
  const b = await box();
  const view = () => page.evaluate(() => window.__app.map.view);
  const v0 = await view();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 150, y: b.y + 150 }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + 150 + i * 8, y: b.y + 150 + i * 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(100);
  const v1 = await view();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 150, y: b.y + 150, id: 1 }, { x: b.x + 250, y: b.y + 150, id: 2 }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + 150 - i * 5, y: b.y + 150, id: 1 }, { x: b.x + 250 + i * 5, y: b.y + 150, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(100);
  const v2 = await view();
  const moved = Math.abs(v1.ra - v0.ra) + Math.abs(v1.dec - v0.dec) > 1, zoomed = v2.fov < v1.fov * 0.8;
  console.log(`Перетаскивание: ${moved ? 'да' : 'НЕТ'}, щипок: ${zoomed ? 'да' : 'НЕТ'}`);
  if (!moved) failures.push('перетаскивание пальцем не двигает карту');
  if (!zoomed) failures.push('щипок не приближает карту');

  // 4. Млечный Путь: с 400 точек обзора полоса должна быть залита, а галактические полюса и т. п. — нет.
  const mw = await page.evaluate(() => {
    const map = window.__app.map;
    map.opt.mw = true;
    const inside = [[266.4, -29], [305, 40], [186, -62], [10, 60], [100, 2], [283, -5], [160, -58], [80, 35]];
    const outside = [[192.9, 27.1], [12.9, -27.1], [150, 60], [60, -45], [220, 10], [340, -20], [0, 20], [120, -80]];
    let bad = 0, checks = 0;
    const fails = [];
    for (let k = 0; k < 400; k++) {
      const ra = (k * 47) % 360, dec = -85 + ((k * 37) % 170);
      map.setView({ ra, dec, fov: 120 });
      map.draw();
      const mc = map.mwCanvas.getContext('2d');
      const alphaAt = (p) => {
        const s = map.project(p[0], p[1]);
        if (s[2] < 0.3 || s[0] < 12 || s[1] < 12 || s[0] >= map.w - 12 || s[1] >= map.h - 12) return null;
        return mc.getImageData(Math.floor(s[0] / 3), Math.floor(s[1] / 3), 1, 1).data[3];
      };
      for (const p of inside) { const al = alphaAt(p); if (al === null) continue; checks++; if (al < 8) { bad++; fails.push(`центр ${ra},${dec}: внутри ${p} альфа ${al}`); } }
      for (const p of outside) { const al = alphaAt(p); if (al === null) continue; checks++; if (al > 0) { bad++; fails.push(`центр ${ra},${dec}: снаружи ${p} альфа ${al}`); } }
    }
    return { checks, bad, fails: fails.slice(0, 6) };
  });
  console.log(`Млечный Путь: ${mw.checks} проверок, ошибок ${mw.bad} ${mw.fails.join(' | ')}`);
  if (mw.bad) failures.push(`Млечный Путь залит неправильно в ${mw.bad} проверках`);

  // 5. Адреса: атлас → #atlas, «назад» возвращает урок; ссылка на другой язык ведёт в тот же раздел.
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="atlas"]').click());
  await wait(500);
  const atlasHash = await page.evaluate(() => location.hash);
  await page.evaluate(() => history.back());
  await wait(700);
  const back = await page.evaluate(() => [location.hash, document.body.className, document.querySelector('#lang').getAttribute('href')]);
  console.log(`Адреса: атлас ${atlasHash}, после «назад» ${back[0]}, ссылка на другой язык ${back[2]}`);
  if (atlasHash !== '#atlas') failures.push(`вкладка «Атлас» дала адрес ${atlasHash}`);
  if (back[0] !== '#lesson/Boo' || !/\btab-learn\b/.test(back[1])) failures.push(`«назад» из атласа: ${back[0]}, ${back[1]}`);
  if (!/#lesson\/Boo$/.test(back[2])) failures.push(`ссылка на другой язык не ведёт в тот же раздел: ${back[2]}`);

  // 6. Скриншот южного неба (там раньше «выворачивалась» заливка).
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="atlas"]').click());
  await wait(500);
  await page.evaluate(() => window.__app.map.setView({ ra: 190, dec: -68, fov: 120 }));
  await wait(400);
  await page.screenshot({ path: path.join(OUT, `old-south-${LANG}.png`) });

  // 7. Тренировка и шпаргалка открываются.
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="quiz"]').click());
  await wait(800);
  await page.evaluate(() => { const o = document.querySelector('.opt') || document.querySelector('#q-skip') || document.querySelector('#q-north'); if (o) o.click(); });
  await wait(400);
  const fb = await page.evaluate(() => { const f = document.querySelector('.q-feedback'); return f ? f.textContent : ''; });
  console.log('Тренировка:', fb || 'вопрос не задан');
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="ref"]').click());
  await wait(500);
  const rows = await page.evaluate(() => document.querySelectorAll('.tbl tr').length);
  console.log('Шпаргалка, строк в таблицах:', rows);
  if (rows < 100) failures.push('шпаргалка не построилась');
  await page.screenshot({ path: path.join(OUT, `old-ref-${LANG}.png`) });

  // 8. Панель с текстом: свернуть (карта на весь экран) и развернуть (без карты).
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="learn"]').click());
  await wait(500);
  const skyH = () => page.evaluate(() => document.getElementById('sky').getBoundingClientRect().height);
  const hMid = await skyH();
  await page.evaluate(() => document.getElementById('sheet-down').click());
  await wait(300);
  const hMin = await skyH();
  await page.evaluate(() => { document.getElementById('sheet-up').click(); document.getElementById('sheet-up').click(); });
  await wait(300);
  const maxOk = await page.evaluate(() => /sheet-max/.test(document.body.className) && document.querySelector('.map-col').offsetHeight === 0 && document.getElementById('panel').offsetHeight > 400);
  await page.evaluate(() => document.getElementById('sheet-down').click());
  await wait(300);
  console.log(`Панель: карта ${Math.round(hMid)} → свёрнута ${Math.round(hMin)}, во весь экран: ${maxOk ? 'да' : 'НЕТ'}`);
  if (!(hMin > hMid * 1.5)) failures.push('свёрнутая панель не освобождает место для карты');
  if (!maxOk) failures.push('панель не разворачивается во весь экран');

  // 9. Задачи: ответить, увидеть решение, перейти к следующей.
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="tasks"]').click());
  await wait(800);
  const task1 = await page.evaluate(() => document.querySelector('.task-text').textContent);
  await page.evaluate(() => {
    const o = document.querySelector('.task .opt');
    if (o) { o.click(); return; }
    const num = document.getElementById('t-num');
    if (num) num.value = '45';
    const box = document.querySelector('.task-multi input');
    if (box) box.checked = true;
    const sel = document.querySelectorAll('.task-slot select');
    for (let i = 0; i < sel.length; i++) sel[i].selectedIndex = 1;
    document.getElementById('t-check').click();
  });
  await wait(500);
  const solved = await page.evaluate(() => [location.hash, !!document.querySelector('.task .q-feedback'), !!document.querySelector('.task .solution'), !!document.getElementById('t-next')]);
  await page.evaluate(() => document.getElementById('t-next').click());
  await wait(600);
  const task2 = await page.evaluate(() => document.querySelector('.task-text').textContent);
  console.log(`Задачи: ${solved[0]}, ответ проверен: ${solved[1] ? 'да' : 'НЕТ'}, решение: ${solved[2] ? 'да' : 'НЕТ'}, следующая: ${task2 !== task1 ? 'да' : 'та же'}`);
  if (solved[0] !== '#tasks' || !solved[1] || !solved[2] || !solved[3]) failures.push('задача: нет проверки ответа или решения');

  // 10. Атлас: щелчок по созвездию выделяет его, повторный — снимает выделение.
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="atlas"]').click());
  await wait(500);
  await page.evaluate(() => window.__app.map.setView({ ra: 84, dec: 0, fov: 60 }));
  await wait(300);
  const focus = () => page.evaluate(() => [Object.keys(window.__app.map.boundFocus).join(), !!document.querySelector('#atlas-info h2')]);
  await tapSky(78, 8);
  await wait(400);
  const f1 = await focus();
  await tapSky(78, 8);
  await wait(400);
  const f2 = await focus();
  console.log(`Атлас: выделено «${f1[0]}», после второго касания «${f2[0]}»`);
  if (f1[0] !== 'Ori' || !f1[1]) failures.push(`касание по Ориону выделило «${f1[0]}»`);
  if (f2[0] !== '' || f2[1]) failures.push('повторное касание не снимает выделение');

  // 11. Телефон боком: вкладки в шапке, без нижней панели, карта и текст рядом.
  await page.setViewport({ width: 924, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await wait(600);
  const land = await page.evaluate(() => {
    const vis = (sel) => { const e = document.querySelector(sel); return !!e && e.offsetWidth > 0; };
    const sky = document.getElementById('sky').getBoundingClientRect(), panel = document.querySelector('.panel').getBoundingClientRect();
    return { tabs: vis('.tabs'), bottom: vis('.bottom-tabs'), side: panel.left >= sky.right - 1, sky: Math.round(sky.width) };
  });
  console.log(`Телефон боком: вкладки в шапке ${land.tabs ? 'да' : 'НЕТ'}, нижняя панель ${land.bottom ? 'ЕСТЬ' : 'нет'}, текст справа от карты ${land.side ? 'да' : 'НЕТ'}, карта ${land.sky} px`);
  if (!land.tabs || land.bottom || !land.side || land.sky < 450) failures.push('раскладка для телефона боком');
  await page.screenshot({ path: path.join(OUT, `old-landscape-${LANG}.png`) });
  await page.setViewport({ width: 400, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await wait(300);

  // 12. Южное полушарие: Сидней в атласе — карта юг сверху, касание по повёрнутой карте верное; уроки — южным
  // маршрутом, тексты которого (south.js) подгружаются только сейчас; тот же урок — под другим номером.
  const listInfo = () => page.evaluate(() => {
    const cur = document.querySelector('#lessons .li.cur');
    return { blk: document.querySelector('#lessons .blk').textContent, cur: cur.querySelector('.t').textContent, n: cur.querySelector('.n').textContent, loaded: !!window.TEXT_SOUTH };
  });
  const listNorth = await listInfo();
  if (!useDist && listNorth.loaded) failures.push('south.js загружен в северном полушарии');
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="atlas"]').click());
  await wait(400);
  const pickCity = (south) => page.evaluate((south) => {
    const b = document.querySelectorAll('#panel .city');
    for (let i = 0; i < b.length; i++) if ((+b[i].getAttribute('data-lat') < 0) === south) { b[i].click(); return; }
  }, south);
  await pickCity(true);
  await wait(600);
  const south = await page.evaluate(() => {
    const m = window.__app.map;
    m.setView({ ra: 84, dec: 0, fov: 60 });
    const c = m.project(84, 0), n = m.project(84, 10);
    return { up: m.opt.southUp, toggle: !!document.querySelector('#tg-south.on'), flipped: n[1] > c[1] };
  });
  await wait(300);
  await tapSky(78, 8);
  await wait(400);
  const fSouth = await focus();
  const listSouth = await listInfo();
  const southOk = listSouth.loaded && listSouth.blk === (await page.evaluate(() => window.TEXT_SOUTH && window.TEXT_SOUTH.blocks['s-start']))
    && listSouth.cur === listNorth.cur && listSouth.n !== listNorth.n;
  console.log(`Южное полушарие: юг сверху ${south.up && south.flipped ? 'да' : 'НЕТ'}, кнопка ${south.toggle ? 'включена' : 'НЕТ'}, касание по Ориону → «${fSouth[0]}»`);
  console.log(`  уроки: «${listSouth.blk}», «${listSouth.cur}» — урок ${listNorth.n} → ${listSouth.n}${southOk ? '' : ' — НЕВЕРНО'}`);
  if (!south.up || !south.flipped || !south.toggle) failures.push('южная широта не поворачивает карту');
  if (fSouth[0] !== 'Ori') failures.push(`на повёрнутой карте касание по Ориону выделило «${fSouth[0]}»`);
  if (!southOk) failures.push(`южный маршрут уроков: ${JSON.stringify(listSouth)}`);
  // Урок южного маршрута: свой «Как найти».
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="learn"]').click());
  await wait(500);
  const southLesson = await page.evaluate(() => {
    const id = location.hash.split('/')[1], d = document.createElement('div');
    d.innerHTML = (window.TEXT_SOUTH.lessons[id] || {}).find || '';
    const want = d.textContent.slice(0, 40);
    return { id, ok: !!want && document.getElementById('panel').textContent.indexOf(want) >= 0 };
  });
  if (!southLesson.ok) failures.push(`урок ${southLesson.id}: нет южного текста «Как найти»`);
  await page.screenshot({ path: path.join(OUT, `old-south-lesson-${LANG}.png`) });
  // Перезапуск с южной широтой: south.js приходит вместе со страницей, сразу южный маршрут.
  await page.reload({ waitUntil: 'load' });
  await wait(800);
  const listReload = await listInfo();
  if (listReload.blk !== listSouth.blk || listReload.n !== listSouth.n) failures.push(`после перезапуска на юге: ${JSON.stringify(listReload)}`);
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="atlas"]').click());
  await wait(400);
  await pickCity(false);
  await wait(300);
  if (await page.evaluate(() => window.__app.map.opt.southUp)) failures.push('северная широта не возвращает карту');
  const listBack = await listInfo();
  if (listBack.blk !== listNorth.blk || listBack.n !== listNorth.n) failures.push(`северный маршрут не вернулся: ${JSON.stringify(listBack)}`);
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="learn"]').click());
  await wait(300);

  // 13. Главная страница: «Продолжить» с прогрессом, выбор полушария, переход в атлас по карточке.
  if (!useDist) {
    await page.goto(HOME, { waitUntil: 'load' });
    await wait(300);
    const home = await page.evaluate(() => [document.getElementById('go').textContent, document.getElementById('go').getAttribute('href'),
      document.getElementById('prog').textContent, !!document.querySelector('.fig svg polyline')]);
    console.log(`Главная: «${home[0]}» → ${home[1]}; ${home[2]}`);
    if (!/index\.html#lesson\/Boo$/.test(home[1])) failures.push(`«Продолжить» ведёт на ${home[1]}`);
    if (!home[3]) failures.push('на главной нет картинки');
    await page.screenshot({ path: path.join(OUT, `old-home-${LANG}.png`), fullPage: true });
    await page.evaluate(() => document.getElementById('hemi-s').click());
    await wait(200);
    const hemi = await page.evaluate(() => [document.getElementById('fig-s').offsetHeight > 0, document.getElementById('south-note').offsetHeight > 0,
      JSON.parse(localStorage.getItem('sa.lat')), document.getElementById('go').textContent, document.getElementById('go').getAttribute('href')]);
    console.log(`Главная, южное полушарие: картинка Креста ${hemi[0] ? 'да' : 'НЕТ'}, совет ${hemi[1] ? 'да' : 'НЕТ'}, широта ${hemi[2]}; «${hemi[3]}»`);
    if (!hemi[0] || !hemi[1] || !(hemi[2] < 0)) failures.push('выбор южного полушария на главной');
    // Тот же урок, но номер — по южному маршруту.
    if (hemi[3] === home[0] || hemi[4] !== home[1]) failures.push(`«Продолжить» на юге: «${hemi[3]}» → ${hemi[4]}`);
    await page.screenshot({ path: path.join(OUT, `old-home-south-${LANG}.png`) });
    await page.evaluate(() => document.getElementById('hemi-n').click());
    await wait(200);
    await page.evaluate(() => document.querySelector('.card[href*="#atlas"]').click());
    await wait(1200);
    const atlas = await page.evaluate(() => [location.hash, document.body.className]);
    if (atlas[0] !== '#atlas' || !/\btab-atlas\b/.test(atlas[1])) failures.push(`карточка «Атлас» открыла ${atlas.join(' ')}`);
  }

  if (errors.length) failures.push('ошибки в консоли:\n  ' + errors.join('\n  '));
  await browser.close();
  console.log(failures.length ? `\nПРОВАЛ:\n- ${failures.join('\n- ')}` : `\nВсё работает. Скриншоты: tools/e2e/shots/*-${LANG}.png`);
  process.exitCode = failures.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
