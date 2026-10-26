// Тексты сайта — в таблицах texts/*.csv (столбец на язык). tools/texts.js собирает из них
// объект Texts для каждого языка: при сборке он попадает в public/<язык>/app/text.js (window.TEXT).
// Набор надписей интерфейса TypeScript берёт из русской таблицы (src/i18n/gen/ru.json, создаёт
// npm run texts): опечатка в ключе — ошибка компиляции. Надписи с {подстановками} заполняет fill().
type Ref = typeof import('./gen/ru.json');

export interface LessonText {
  title?: string;     // если не задан — название созвездия урока
  labels?: string[];  // подписи указателей, в порядке pointers урока
  find?: string;
  look?: string;
  facts?: string[];
  html?: string;      // уроки-теории
}

export interface ConText {
  name: string;
  gen: string;        // родительный падеж для обозначений звёзд: α Лиры / α Lyrae
  meaning?: string;   // перевод латинского названия, если созвездия на этом языке зовут по-латыни
}

export interface DsoText { name: string; label?: string }

export interface Texts {
  lang: string;
  locale: string;     // для сортировки по алфавиту
  defaultLat: number; // широта, пока пользователь не ввёл свою
  decimal: string;
  hour: string;
  minute: string;
  months: string[];   // сокращённые, в форме «12 мар»
  page: Ref['page'];  // надписи в index.html приложения (подставляет tools/build.js)
  home: Ref['home'];  // главная страница
  ui: Ref['ui'];
  cons: Record<string, ConText>;
  stars: Record<string, string>;
  dso: Record<string, DsoText>;
  greek: Record<string, string>;
  asterisms: { name: string; stars: string }[];
  blocks: Record<string, string>;
  lessons: Record<string, LessonText>;
}
