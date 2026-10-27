import type { Sky } from '../core/sky';
import type { MapTab, Tab, View } from '../core/types';
import { fmtMag } from '../i18n';
import type { MapClick, SkyMap } from '../map/skymap';
import { toggles } from './state';

export interface TabController {
  enter(): void;
  click(c: MapClick): void;
  render(): void;   // перенастроить карту после смены переключателей
  home(): View;     // вид для кнопки «вернуть»
}

// Общие объекты приложения. Вкладки ссылаются друг на друга через app.setTab,
// а не через импорты — так нет циклических зависимостей между ними.
export const app = {
  sky: null as unknown as Sky,
  map: null as unknown as SkyMap,
  panel: null as unknown as HTMLElement,
  tabs: {} as Record<MapTab, TabController>,
  setTab: (_t: Tab) => { /* назначается в main */ },
  updateProgress: () => { /* назначается в main */ },
  placeChanged: () => { /* назначается в main: широта или «юг сверху» изменились */ },
};

// Прокрутить панель наверх (новый урок, новая задача). Позицию узнаём из события scroll, а не читаем
// scrollTop: чтение и запись размеров сразу после замены содержимого заставляют браузер пересчитать
// раскладку страницы посреди работы — на запуске это стоило ~0,3 с на слабом телефоне.
let panelScrolled = false;
export function trackPanelScroll() {
  app.panel.addEventListener('scroll', () => { panelScrolled = app.panel.scrollTop > 0; });
}
export function panelToTop() {
  if (panelScrolled) { app.panel.scrollTop = 0; panelScrolled = false; }
}

export function applyToggles(tab: MapTab) {
  const t = toggles[tab], o = app.map.opt;
  o.grid = t.grid; o.ecliptic = t.ecliptic; o.mw = t.mw; o.bounds = t.bounds; o.dso = t.dso;
  o.conLabels = t.names; o.starLabels = t.names;
}

// Имя звезды для людей: «Арктур», а если имени нет — «ε Волопаса».
export function starTitle(i: number): string {
  return app.sky.curatedName(i) || app.sky.starDesig(i);
}

export function starShortInfo(i: number): string {
  const sky = app.sky, name = sky.curatedName(i);
  return `<b>${name || sky.starDesig(i)}</b>${name ? ` · ${sky.starDesig(i)}` : ''} · ${fmtMag(sky.mag[i], 2)}`;
}
