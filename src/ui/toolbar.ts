import type { MapTab, Toggle } from '../core/types';
import { T } from '../i18n';
import { app } from './app';
import { $, each } from './dom';
import { toggles } from './state';

// Какие переключатели карты есть на каждой вкладке.
const TOOLBAR: Record<MapTab, Toggle[]> = {
  learn: ['lines', 'names', 'bounds', 'grid', 'ecliptic', 'mw', 'dso'],
  quiz: ['lines', 'grid', 'ecliptic', 'mw'],
  atlas: ['lines', 'names', 'bounds', 'grid', 'ecliptic', 'mw', 'dso'],
};

export function renderToolbar(tab: MapTab) {
  const t = toggles[tab], el = $('tools');
  el.innerHTML = TOOLBAR[tab].map((k) =>
    `<button class="tg${t[k] ? ' on' : ''}" data-t="${k}">${k === 'lines' ? T.ui.toggleLines[tab] : T.ui.toggle[k]}</button>`).join('');
  each(el.querySelectorAll('.tg'), (b) => b.addEventListener('click', () => {
    const k = b.dataset.t as Toggle;
    t[k] = !t[k];
    b.classList.toggle('on', t[k]);
    app.tabs[tab].render();
  }));
}
