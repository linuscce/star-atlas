// Скорость отрисовки: компьютер и «слабый телефон» (процессор замедлен в 10 раз).
// Время кадра берётся из режима ?fps (скользящее среднее draw() в SkyMap). Бюджет плавности — 16 мс.
//
// Запуск: npm run perf. Скриншоты телефона — в tools/e2e/shots.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUB = path.join(__dirname, '..', '..', 'public');
const URL = pathToFileURL(path.join(PUB, 'ru', 'app', 'index.html')).href;
const HOME = pathToFileURL(path.join(PUB, 'ru', 'index.html')).href;
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function drag(page, x0, y0, dx, dy, steps, touch) {
  if (touch) {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx * i / steps, y: y0 + dy * i / steps }] });
      await wait(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + dx * i / steps, y0 + dy * i / steps); await wait(16); }
    await page.mouse.up();
  }
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const errors = [];
  const watch = (p) => {
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  };

  const desk = await (await browser.createBrowserContext()).newPage();
  watch(desk);
  await desk.setViewport({ width: 1440, height: 900 });
  await desk.goto(URL + '?fps', { waitUntil: 'load' });
  await desk.click('[data-tab="atlas"]');
  await wait(800);
  await drag(desk, 700, 450, 300, 120, 40, false);
  await wait(600);
  console.log('Компьютер, атлас:', await desk.evaluate(() => document.querySelector('.fps').textContent));

  const phone = await (await browser.createBrowserContext()).newPage();
  watch(phone);
  await phone.emulate({ viewport: { width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0 Mobile Safari/537.36' });
  const cdp = await phone.target().createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 10 });
  let t0 = Date.now();
  await phone.goto(HOME, { waitUntil: 'load' });
  console.log('Телефон (CPU ×10): главная страница', Date.now() - t0, 'мс');
  t0 = Date.now();
  await phone.goto(URL + '?fps', { waitUntil: 'load' });
  console.log('Телефон (CPU ×10): загрузка карты', Date.now() - t0, 'мс');
  await wait(1500);
  await drag(phone, 180, 200, 140, 60, 40, true);
  await wait(400);
  console.log('Телефон (CPU ×10), урок:', await phone.evaluate(() => document.querySelector('.fps').textContent));
  await phone.screenshot({ path: path.join(OUT, 'phone-learn.png') });
  await phone.evaluate(() => document.querySelector('.bottom-tabs [data-tab="atlas"]').click());
  await wait(1200);
  await drag(phone, 180, 200, 160, 100, 50, true);
  await wait(600);
  console.log('Телефон (CPU ×10), атлас со всеми линиями:', await phone.evaluate(() => document.querySelector('.fps').textContent));
  await phone.screenshot({ path: path.join(OUT, 'phone-atlas.png') });

  await browser.close();
  console.log(errors.length ? 'Ошибки в консоли:\n' + errors.join('\n') : 'Ошибок в консоли нет.');
  process.exitCode = errors.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
