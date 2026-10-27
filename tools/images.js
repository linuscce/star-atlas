// Картинки для поисковиков и соцсетей (запускать вручную после npm run build, результат — в git):
//   public/og-<язык>.png         — превью ссылки в Telegram, ВКонтакте и т. п. (1200×630): название, описание, Ковш;
//   public/favicon.ico           — значок 48×48 (поисковикам нужен значок файлом, старому Chrome — .ico);
//   public/apple-touch-icon.png  — значок для экрана «Домой» (180×180).
// Нужен Chrome (CHROME_PATH или стандартный путь), как для npm run e2e.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { loadTexts } = require('./texts');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUB = path.join(__dirname, '..', 'public');
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// ICO с одной картинкой PNG внутри (так умеют все браузеры с Windows Vista).
function ico(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(size, 6); head.writeUInt8(size, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

(async () => {
  const { langs, texts } = loadTexts();
  const icon = fs.readFileSync(path.join(PUB, 'icon.svg'), 'utf8');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  const shot = async (html, w, h, transparent) => {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden">${html}</body></html>`, { waitUntil: 'load' });
    return page.screenshot({ type: 'png', omitBackground: !!transparent });
  };
  const svgAt = (svg, size) => svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `);

  fs.writeFileSync(path.join(PUB, 'favicon.ico'), ico(await shot(svgAt(icon, 48), 48, 48, true), 48));
  // На экране «Домой» углы скругляет сама система — значок квадратный.
  fs.writeFileSync(path.join(PUB, 'apple-touch-icon.png'), await shot(svgAt(icon.replace('rx="7"', 'rx="0"'), 180), 180, 180));

  for (const lang of langs) {
    const t = texts[lang];
    const home = fs.readFileSync(path.join(PUB, lang, 'index.html'), 'utf8');
    const fig = /<div id="fig-n">(<svg[\s\S]*?<\/svg>)/.exec(home);
    if (!fig) throw new Error(`${lang}/index.html: нет картинки Ковша — сначала npm run build`);
    const html = `<div style="display:flex;align-items:center;width:1200px;height:630px;background:#0b1020 radial-gradient(ellipse at 72% 30%, #182552 0%, rgba(11,16,32,0) 60%) no-repeat;color:#e7ecff;font-family:${FONT.replace(/"/g, "'")}">
  <div style="flex:1;padding:0 36px 0 64px">
    <div style="margin-bottom:28px">${svgAt(icon, 56)}</div>
    <div style="font-size:60px;font-weight:700;line-height:1.12;margin-bottom:24px">${t.page.brand}<br>${t.page.brandSub}</div>
    <div style="font-size:27px;line-height:1.42;color:#c4cbe6">${t.page.description}</div>
  </div>
  <div style="flex:none;width:520px;margin-right:56px;padding:14px 16px;background:#080c1d;border:1px solid #243057;border-radius:18px">${fig[1].replace('<svg ', '<svg style="display:block;width:100%;height:auto" ')}</div>
</div>`;
    fs.writeFileSync(path.join(PUB, `og-${lang}.png`), await shot(html, 1200, 630));
    console.log(`public/og-${lang}.png`);
  }
  await browser.close();
  console.log('public/favicon.ico, public/apple-touch-icon.png');
})().catch((e) => { console.error(e); process.exit(1); });
