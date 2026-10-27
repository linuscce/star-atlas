import { CITIES } from '../data/tasks';
import { T, fmtNum } from '../i18n';
import { app } from './app';
import { each } from './dom';
import { save, state } from './state';

// Широта наблюдателя — поле и быстрый выбор города (атлас, шпаргалка, задачи).
// От широты зависят видимость звёзд, наборы вопросов и задач, а её знак — поворот карты («юг сверху»).
const PLACES = ['moscow', 'spb', 'novosibirsk', 'london', 'sochi', 'sydney', 'capetown', 'buenosaires'];

export function placeHtml(id: string): string {
  return `<div class="place"><label class="lat">${T.ui.myLat} <input id="${id}" type="number" step="0.1" min="-90" max="90" value="${state.lat}"> °</label>` +
    `<div class="cities"><span class="muted small">${T.ui.placeHint}</span> ` + PLACES.map((id) => {
      const c = CITIES.filter((x) => x.id === id)[0];
      return `<button class="city" data-lat="${c.lat}">${T.tasks.cities[id]} <span>${fmtNum(c.lat, 1)}</span></button>`;
    }).join('') + '</div></div>';
}

// onChange — перерисовать то, что зависит от широты.
export function bindPlace(root: HTMLElement, id: string, onChange: () => void) {
  const input = root.querySelector('#' + id) as HTMLInputElement;
  const apply = (v: number) => { setLat(v); input.value = String(v); onChange(); };
  input.addEventListener('change', () => {
    const v = parseFloat(input.value.replace(',', '.').replace('−', '-'));
    if (!isNaN(v) && v >= -90 && v <= 90) apply(v);
  });
  each(root.querySelectorAll('.city'), (b) => b.addEventListener('click', () => apply(+b.dataset.lat!)));
}

// Перешли через экватор — карта поворачивается: в южном полушарии юг сверху.
export function setLat(v: number) {
  const crossed = (v < 0) !== (state.lat < 0);
  state.lat = v;
  save();
  if (crossed) setSouthUp(v < 0);
  else app.placeChanged();
}

export function setSouthUp(on: boolean) {
  state.southUp = on;
  app.map.opt.southUp = on;
  save();
  app.map.redraw();
  app.placeChanged();
}
