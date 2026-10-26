import type { Sky } from '../core/sky';
import type { Lesson, MapTab, Tab, View } from '../core/types';
import { T, fmtMag } from '../i18n';
import type { LessonText } from '../i18n/types';
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
};

export function applyToggles(tab: MapTab) {
  const t = toggles[tab], o = app.map.opt;
  o.grid = t.grid; o.ecliptic = t.ecliptic; o.mw = t.mw; o.bounds = t.bounds; o.dso = t.dso;
  o.conLabels = t.names; o.starLabels = t.names;
}

export function lessonText(L: Lesson): LessonText {
  return T.lessons[L.id] || {};
}

export function lessonTitle(L: Lesson): string {
  return lessonText(L).title || app.sky.conName(L.cons[0]);
}

// Имя звезды для людей: «Арктур», а если имени нет — «ε Волопаса».
export function starTitle(i: number): string {
  return app.sky.curatedName(i) || app.sky.starDesig(i);
}

export function starShortInfo(i: number): string {
  const sky = app.sky, name = sky.curatedName(i);
  return `<b>${name || sky.starDesig(i)}</b>${name ? ` · ${sky.starDesig(i)}` : ''} · ${fmtMag(sky.mag[i], 2)}`;
}
