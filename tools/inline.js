// Собирает один самодостаточный файл dist/star-atlas.html (стили, данные и код внутри).
// Его можно скопировать на телефон и открыть без интернета и без сервера.
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(pub, f), 'utf8');
// Внутри <script> нельзя встречать «</script» — экранируем на всякий случай.
const safeJs = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('style.css')}\n</style>`);
html = html.replace('<script src="sky.js"></script>', () => `<script>\n${safeJs(read('sky.js'))}\n</script>`);
html = html.replace('<script src="app.js"></script>', () => `<script>\n${safeJs(read('app.js'))}\n</script>`);

const out = path.join(__dirname, '..', 'dist');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'star-atlas.html'), html);
console.log(`dist/star-atlas.html: ${Math.round(html.length / 1024)} КБ`);
