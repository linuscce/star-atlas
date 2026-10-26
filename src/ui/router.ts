import type { Tab } from '../core/types';
import { $, each } from './dom';

// Раздел сайта — в адресе после #: #lesson/UMa, #quiz, #atlas, #atlas/Ori, #ref.
// Язык — в пути (/ru/, /en/), раздел — после #: так адреса работают и на любом статическом
// хостинге без настройки, и в одном файле без сервера (file://), и в старом Chrome (hashchange).
export interface Route { tab: Tab; id?: string }

export function parseRoute(hash: string): Route | null {
  const m = /^#?(lesson|learn|quiz|atlas|ref)(?:\/([\w-]+))?$/.exec(hash);
  if (!m) return null;
  return { tab: m[1] === 'lesson' ? 'learn' : m[1] as Tab, id: m[2] };
}

export function routeHash(r: Route): string {
  if (r.tab === 'learn') return r.id ? `#lesson/${r.id}` : '#learn';
  return `#${r.tab}${r.id ? '/' + r.id : ''}`;
}

let current = '';
let langLink: HTMLAnchorElement | null = null;
let langBase = '';

// Слушать переходы «назад/вперёд» и ручную правку адреса. Возвращает раздел из адреса при запуске.
export function startRouter(onChange: (r: Route) => void): Route | null {
  current = location.hash;
  // Без сервера (file://) папка сама не открывается — дописываем index.html в ссылки вида «../».
  if (location.protocol === 'file:') {
    each(document.querySelectorAll('a[href]'), (a) => {
      const m = /^([^:#]*\/)(#.*)?$/.exec(a.getAttribute('href') || '');
      if (m) a.setAttribute('href', m[1] + 'index.html' + (m[2] || ''));
    });
  }
  langLink = $<HTMLAnchorElement>('lang');
  if (langLink) {
    langBase = langLink.getAttribute('href') || '';
    updateLangLink();
  }
  window.addEventListener('hashchange', () => {
    if (location.hash === current) return; // это мы сами записали адрес
    current = location.hash;
    updateLangLink();
    const r = parseRoute(current);
    if (r) onChange(r);
  });
  return parseRoute(current);
}

export function currentRoute(): Route | null {
  return parseRoute(current);
}

// Записать раздел в адрес. Каждый переход — новая запись в истории, чтобы работала кнопка «назад»;
// пустой или непонятный адрес при запуске просто заменяется.
export function setRoute(r: Route) {
  const h = routeHash(r);
  if (h === current) return;
  const replace = !parseRoute(current);
  current = h;
  if (replace) location.replace(h); else location.hash = h;
  updateLangLink();
}

// Ссылка на другой язык ведёт в тот же раздел.
function updateLangLink() {
  if (langLink) langLink.href = langBase + current;
}
