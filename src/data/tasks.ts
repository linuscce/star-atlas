import type { TaskLevel, View } from '../core/types';

// Города для задач на видимость и для выбора широты (названия — в texts/tasks.csv: tasks.cities.<id>).
export const CITIES: { id: string; lat: number }[] = [
  { id: 'murmansk', lat: 68.97 },
  { id: 'reykjavik', lat: 64.15 },
  { id: 'spb', lat: 59.94 },
  { id: 'moscow', lat: 55.75 },
  { id: 'novosibirsk', lat: 55.03 },
  { id: 'london', lat: 51.51 },
  { id: 'sochi', lat: 43.6 },
  { id: 'vladivostok', lat: 43.12 },
  { id: 'cairo', lat: 30.04 },
  { id: 'singapore', lat: 1.29 },
  { id: 'rio', lat: -22.91 },
  { id: 'sydney', lat: -33.87 },
  { id: 'capetown', lat: -33.92 },
  { id: 'buenosaires', lat: -34.6 },
  { id: 'auckland', lat: -36.85 },
];

// Задачи с подробным решением. Тексты, варианты и решения — в texts/tasks.csv (tasks.solved.<id>.*).
// correct — номера верных вариантов с 0; для числового ответа — value ± tol.
// stars — звёзды задачи (по порядку вариантов, если варианты — звёзды); их подписывает карта после ответа,
// а npm test по ним проверяет ответ (см. tools/check.ts).
export interface SolvedTask {
  id: string;
  level: TaskLevel;
  kind: 'choice' | 'multi' | 'number';
  correct?: number[];
  value?: number;
  tol?: number;
  stars?: string[];
  focus?: string[];
  view?: View;
  ecliptic?: boolean;
}

export const SOLVED: SolvedTask[] = [
  { id: 'orion-month', level: 'mid', kind: 'choice', correct: [3], focus: ['Ori'], view: { ra: 84, dec: 5, fov: 70 } },
  { id: 'circumpolar-moscow', level: 'easy', kind: 'choice', correct: [2], stars: ['α Boo', 'α Aql', 'α Lyr', 'α Tau'], view: { ra: 250, dec: 30, fov: 130 } },
  { id: 'sochi-spb', level: 'hard', kind: 'multi', correct: [1, 2], stars: ['α CMa', 'λ Sco', 'ε Sgr', 'α Car', 'α Sco'], focus: ['Sco', 'Sgr'], view: { ra: 262, dec: -30, fov: 75 } },
  { id: 'solstice-con', level: 'hard', kind: 'choice', correct: [2], focus: ['Tau', 'Gem', 'Cnc'], view: { ra: 92, dec: 22, fov: 75 }, ecliptic: true },
  { id: 'equinox-point', level: 'mid', kind: 'choice', correct: [1], focus: ['Psc', 'Ari', 'Aqr'], view: { ra: 5, dec: 5, fov: 80 }, ecliptic: true },
  { id: 'ecliptic-four', level: 'mid', kind: 'choice', correct: [1], stars: ['α Tau', 'α Leo', 'α Vir', 'α Sco'], view: { ra: 160, dec: 0, fov: 215 }, ecliptic: true },
  { id: 'sirius-lat', level: 'mid', kind: 'number', value: 73.3, tol: 1, stars: ['α CMa'], view: { ra: 101, dec: -17, fov: 60 } },
  { id: 'brightness-order', level: 'easy', kind: 'choice', correct: [2], stars: ['α CMa', 'α Lyr', 'α Ori', 'α UMi'] },
  { id: 'ori-sco', level: 'hard', kind: 'choice', correct: [2], stars: ['α Ori', 'α Sco'], focus: ['Ori', 'Sco'] },
  { id: 'summer-triangle-season', level: 'mid', kind: 'choice', correct: [2], stars: ['α Lyr', 'α Cyg', 'α Aql'], focus: ['Lyr', 'Cyg', 'Aql'], view: { ra: 297, dec: 30, fov: 75 } },
  { id: 'zenith-moscow', level: 'mid', kind: 'choice', correct: [3], stars: ['α Lyr', 'α Aql', 'α Boo', 'α Aur'] },
  { id: 'polaris-height', level: 'easy', kind: 'number', value: 59.9, tol: 1, stars: ['α UMi'], focus: ['UMi'], view: { ra: 40, dec: 80, fov: 60 } },
  { id: 'noon-sun-height', level: 'mid', kind: 'number', value: 57.7, tol: 1 },
  { id: 'equator-all', level: 'easy', kind: 'choice', correct: [1] },
  { id: 'pole-sirius', level: 'easy', kind: 'choice', correct: [2], stars: ['α CMa'] },
  { id: 'vega-lower', level: 'hard', kind: 'number', value: 4.5, tol: 1, stars: ['α Lyr'], focus: ['Lyr'], view: { ra: 279, dec: 39, fov: 60 } },
  { id: 'sun-ophiuchus', level: 'hard', kind: 'choice', correct: [1], focus: ['Oph', 'Sco', 'Sgr'], view: { ra: 255, dec: -20, fov: 75 }, ecliptic: true },
];
