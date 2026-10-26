// Эмуляция встроенного Chrome 37–50 (Android 5–6) в headless Chrome: перед загрузкой удаляем новые API
// (Pointer Events, Set/Map, NodeList.forEach, .fill и др.), проходим урок касаниями пальца,
// проверяем щипок, тренировку, шпаргалку и заливку Млечного Пути с 400 точек обзора.
//
// Запуск: npm run e2e  (или node tools/e2e/old-browser.js [--dist])
// Chrome: переменная CHROME_PATH или стандартный путь установки.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..', '..');
const useDist = process.argv.indexOf('--dist') >= 0;
const FILE = pathToFileURL(path.join(ROOT, useDist ? 'dist/star-atlas.html' : 'public/index.html')).href;
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
  await page.goto(FILE + '?debug', { waitUntil: 'load' });
  await wait(800);
  console.log(`Файл: ${useDist ? 'dist/star-atlas.html' : 'public/index.html'}`);
  if (!(await page.evaluate(() => window.__oldEnv))) failures.push('не удалось удалить новые API');

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

  // 1. Урок «Волопас» + «Проверь себя» касаниями (все ответы правильные).
  await page.evaluate(() => document.querySelector('#btn-menu').click());
  await wait(400);
  await page.evaluate(() => {
    const l = document.querySelectorAll('.li');
    for (let i = 0; i < l.length; i++) if (l[i].textContent.indexOf('Волопас') >= 0) l[i].click();
  });
  await wait(900);
  await page.evaluate(() => document.querySelector('#l-check').click());
  await wait(900);
  for (let k = 0; k < 8; k++) {
    const task = await page.evaluate(() => document.querySelector('#banner').textContent);
    if (!/Найди/.test(task)) break;
    const name = task.replace('Найди: ', '').replace(/\s*\d+ \/ \d+$/, '').trim();
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
  console.log('Самопроверка «Волопас» касаниями:', score);
  if (score !== '4/4') failures.push(`самопроверка: ${score}, ожидалось 4/4`);

  // 2. Перетаскивание и щипок пальцами.
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

  // 3. Млечный Путь: с 400 точек обзора полоса должна быть залита, а галактические полюса и т. п. — нет.
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

  // 4. Скриншот южного неба (там раньше «выворачивалась» заливка).
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="atlas"]').click());
  await wait(500);
  await page.evaluate(() => window.__app.map.setView({ ra: 190, dec: -68, fov: 120 }));
  await wait(400);
  await page.screenshot({ path: path.join(OUT, 'old-south.png') });

  // 5. Тренировка и шпаргалка открываются.
  await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="quiz"]').click());
  await wait(800);
  await page.evaluate(() => { const o = document.querySelector('.opt') || document.querySelector('#q-skip') || document.querySelector('#q-north'); if (o) o.click(); });
  await wait(400);
  const fb = await page.evaluate(() => { const f = document.querySelector('.q-feedback'); return f ? f.textContent : ''; });
  console.log('Тренировка:', fb || 'вопрос не задан');
  const rows = await (async () => {
    await page.evaluate(() => document.querySelector('.bottom-tabs [data-tab="ref"]').click());
    await wait(500);
    return page.evaluate(() => document.querySelectorAll('.tbl tr').length);
  })();
  console.log('Шпаргалка, строк в таблицах:', rows);
  if (rows < 100) failures.push('шпаргалка не построилась');

  if (errors.length) failures.push('ошибки в консоли:\n  ' + errors.join('\n  '));
  await browser.close();
  console.log(failures.length ? `\nПРОВАЛ:\n- ${failures.join('\n- ')}` : '\nВсё работает. Скриншот: tools/e2e/shots/old-south.png');
  process.exitCode = failures.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
