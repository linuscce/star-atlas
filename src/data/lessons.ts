import type { Lesson, SouthStep } from '../core/types';

// Уроки идут как в детской книжке: созвездие за созвездием, каждое новое — от уже знакомых.
// Здесь только устройство урока; тексты — в src/i18n/<язык>/lessons.ts под тем же id.
// pointers: {line:[a,b,t]} — линия от a через b, продолженная до t;
//           {path:[...]} — кривая через точки; {poly:[...]} — замкнутая фигура.
// Точки — обозначения звёзд ('α UMa'), id объектов из DSO или {ra, dec}.
// Подписи указателей — в текстах урока (labels), в том же порядке.

export const BLOCKS = ['start', 'north', 'dipper', 'vega', 'pegasus', 'orion', 'south', 'theory'];

export const LESSONS: Lesson[] = [
  // ───────────────────────── Начало ─────────────────────────
  {
    id: 'intro', block: 'start', cons: [], theory: true,
    view: { ra: 165, dec: 62, fov: 75 }, opts: { grid: true },
    focusLines: ['UMa'],
  },

  // ───────────────────────── Вокруг Полярной ─────────────────────────
  {
    id: 'UMa', block: 'north', cons: ['UMa'],
    stars: ['α UMa', 'β UMa', 'γ UMa', 'δ UMa', 'ε UMa', 'ζ UMa', 'g UMa', 'η UMa'],
    dso: ['M81', 'M82', 'M101'],
    view: { ra: 175, dec: 55, fov: 55 },
  },
  {
    id: 'UMi', block: 'north', cons: ['UMi'],
    stars: ['α UMi', 'β UMi', 'γ UMi'],
    pointers: [{ line: ['β UMa', 'α UMa', 'α UMi'] }],
  },
  {
    id: 'Cas', block: 'north', cons: ['Cas'],
    stars: ['β Cas', 'α Cas', 'γ Cas', 'δ Cas', 'ε Cas'],
    dso: ['M103', 'M52'],
    pointers: [{ line: ['δ UMa', 'α UMi', 'β Cas'] }],
  },
  {
    id: 'Cep', block: 'north', cons: ['Cep'],
    stars: ['α Cep', 'β Cep', 'γ Cep', 'δ Cep', 'μ Cep'],
    pointers: [{ line: ['α Cas', 'β Cas', 'α Cep'] }],
  },
  {
    id: 'Dra', block: 'north', cons: ['Dra'],
    stars: ['γ Dra', 'β Dra', 'α Dra'],
    dso: ['NGC6543', 'NEP'],
    view: { ra: 235, dec: 68, fov: 70 },
  },

  // ───────────────────────── От Ковша на юг ─────────────────────────
  {
    id: 'Boo', block: 'dipper', cons: ['Boo'],
    stars: ['α Boo', 'ε Boo', 'η Boo', 'γ Boo', 'β Boo'],
    pointers: [{ path: ['ε UMa', 'ζ UMa', 'η UMa', 'α Boo'] }],
  },
  {
    id: 'CrB', block: 'dipper', cons: ['CrB'],
    stars: ['α CrB'],
    pointers: [{ path: ['α Boo', 'α CrB'] }],
  },
  {
    id: 'Vir', block: 'dipper', cons: ['Vir'],
    stars: ['α Vir', 'γ Vir', 'ε Vir', 'β Vir'],
    dso: ['M87', 'M104'],
    pointers: [{ path: ['ε UMa', 'ζ UMa', 'η UMa', 'α Boo', 'α Vir'] }],
  },
  {
    id: 'Leo', block: 'dipper', cons: ['Leo'],
    stars: ['α Leo', 'β Leo', 'γ Leo', 'δ Leo', 'θ Leo'],
    dso: ['M65', 'M66'],
    pointers: [{ line: ['δ UMa', 'γ UMa', 'α Leo'] }],
  },
  {
    id: 'LMi_Sex', block: 'dipper', cons: ['LMi', 'Sex'],
    stars: ['HIP53229', 'β LMi', 'α Sex'],
    pointers: [{ path: ['α Leo', 'α Sex'] }],
  },
  {
    id: 'CVn_Com', block: 'dipper', cons: ['CVn', 'Com'],
    stars: ['α CVn', 'β CVn', 'β Com', 'α Com'],
    dso: ['M51', 'M3', 'M64', 'Mel111', 'NGP'],
    pointers: [
      { path: ['ε UMa', 'α CVn'] },
      { path: ['α CVn', 'Mel111', 'β Leo'] },
    ],
  },
  {
    id: 'Cnc', block: 'dipper', cons: ['Cnc'],
    stars: ['β Cnc', 'α Cnc', 'γ Cnc', 'δ Cnc'],
    dso: ['M44', 'M67'],
    pointers: [{ path: ['α Leo', 'M44'] }],
  },
  {
    id: 'Hya', block: 'dipper', cons: ['Hya'],
    stars: ['α Hya', 'ζ Hya', 'ε Hya', 'γ Hya'],
    dso: ['M83'],
    view: { ra: 165, dec: -10, fov: 120 },
    pointers: [{ line: ['γ Leo', 'α Leo', 'α Hya'] }],
  },
  {
    id: 'Crv_Crt', block: 'dipper', cons: ['Crv', 'Crt'],
    stars: ['γ Crv', 'β Crv', 'δ Crv', 'α Crv', 'α Crt'],
    pointers: [{ path: ['α Vir', 'γ Crv'] }],
  },

  // ───────────────────────── Вега, Денеб, Альтаир ─────────────────────────
  {
    id: 'Lyr', block: 'vega', cons: ['Lyr'],
    stars: ['α Lyr', 'β Lyr', 'γ Lyr', 'ε Lyr'],
    dso: ['M57'],
    pointers: [{ path: ['γ Dra', 'α Lyr'] }],
  },
  {
    id: 'Cyg', block: 'vega', cons: ['Cyg'],
    stars: ['α Cyg', 'β Cyg', 'γ Cyg', 'ε Cyg', 'δ Cyg', 'HIP104214'],
    dso: ['M39', 'NGC7000'],
    pointers: [{ path: ['α Lyr', 'α Cyg'] }],
  },
  {
    id: 'Aql', block: 'vega', cons: ['Aql'],
    stars: ['α Aql', 'γ Aql', 'β Aql', 'δ Aql', 'λ Aql'],
    pointers: [{ poly: ['α Lyr', 'α Cyg', 'α Aql'] }],
  },
  {
    id: 'Her', block: 'vega', cons: ['Her'],
    stars: ['ζ Her', 'η Her', 'ε Her', 'π Her', 'α Her', 'β Her'],
    dso: ['M13', 'M92'],
    pointers: [{ path: ['α CrB', 'ζ Her', 'α Lyr'] }],
  },
  {
    id: 'Oph_Ser', block: 'vega', cons: ['Oph', 'Ser'],
    stars: ['α Oph', 'η Oph', 'β Oph', 'ζ Oph', 'α Ser'],
    dso: ['M5', 'M16'],
    view: { ra: 255, dec: 2, fov: 85 },
    pointers: [{ path: ['α Her', 'α Oph'] }],
  },
  {
    id: 'Sco', block: 'vega', cons: ['Sco'],
    stars: ['α Sco', 'δ Sco', 'β Sco', 'λ Sco', 'θ Sco', 'υ Sco'],
    dso: ['M4', 'M6', 'M7'],
    view: { ra: 220, dec: -12, fov: 110 },
    pointers: [{ path: ['α Leo', 'α Vir', 'α Sco'] }],
  },
  {
    id: 'Lib', block: 'vega', cons: ['Lib'],
    stars: ['α Lib', 'β Lib', 'σ Lib', 'γ Lib'],
    pointers: [{ path: ['α Vir', 'α Lib', 'α Sco'] }],
  },
  {
    id: 'Sgr', block: 'vega', cons: ['Sgr'],
    stars: ['ε Sgr', 'σ Sgr', 'λ Sgr', 'δ Sgr', 'ζ Sgr', 'α Sgr'],
    dso: ['GC', 'M8', 'M20', 'M22', 'M17'],
    view: { ra: 288, dec: -10, fov: 110 },
    pointers: [{ line: ['α Cyg', 'α Aql', 'σ Sgr'] }],
  },
  {
    id: 'Del_Sge_Vul_Sct', block: 'vega', cons: ['Del', 'Sge', 'Vul', 'Sct'],
    stars: ['α Del', 'β Del', 'γ Sge', 'α Vul', 'α Sct'],
    dso: ['M27', 'M71', 'M11', 'Cr399'],
    view: { ra: 293, dec: 10, fov: 60 },
    pointers: [
      { path: ['α Aql', 'α Del'] },
      { line: ['α Aql', 'δ Aql', 'α Sct'] },
    ],
  },

  // ───────────────────────── Пегас и Андромеда ─────────────────────────
  {
    id: 'Peg', block: 'pegasus', cons: ['Peg'],
    stars: ['α Peg', 'β Peg', 'γ Peg', 'ε Peg', 'α And', 'HIP113357'],
    dso: ['M15'],
    view: { ra: 352, dec: 42, fov: 110 },
    pointers: [{ line: ['α UMi', 'β Cas', 'α And'] }],
  },
  {
    id: 'And', block: 'pegasus', cons: ['And'],
    stars: ['α And', 'β And', 'γ And', 'δ And', 'μ And', 'ν And'],
    dso: ['M31'],
    pointers: [
      { path: ['α And', 'δ And', 'β And', 'γ And'] },
      { path: ['β And', 'μ And', 'ν And', 'M31'] },
    ],
  },
  {
    id: 'Per', block: 'pegasus', cons: ['Per'],
    stars: ['α Per', 'β Per', 'ζ Per', 'ε Per', 'γ Per', 'δ Per'],
    dso: ['hχPer', 'M34'],
    pointers: [{ line: ['β And', 'γ And', 'α Per'] }],
  },
  {
    id: 'Tri_Ari', block: 'pegasus', cons: ['Tri', 'Ari'],
    stars: ['α Tri', 'β Tri', 'α Ari', 'β Ari', 'γ Ari'],
    dso: ['M33'],
    pointers: [{ path: ['β And', 'α Tri', 'α Ari'] }],
  },
  {
    id: 'Psc', block: 'pegasus', cons: ['Psc'],
    stars: ['α Psc', 'η Psc', 'γ Psc', 'ω Psc'],
    pointers: [{ path: ['α Peg', 'γ Psc'] }],
  },
  {
    id: 'Cet', block: 'pegasus', cons: ['Cet'],
    stars: ['β Cet', 'α Cet', 'ο Cet', 'τ Cet', 'γ Cet'],
    view: { ra: 22, dec: 0, fov: 85 },
    pointers: [{ path: ['α And', 'γ Peg', 'β Cet'] }],
  },
  {
    id: 'Aqr', block: 'pegasus', cons: ['Aqr'],
    stars: ['β Aqr', 'α Aqr', 'δ Aqr', 'ζ Aqr'],
    dso: ['M2', 'NGC7293'],
    pointers: [{ path: ['ε Peg', 'α Aqr'] }],
  },
  {
    id: 'Cap', block: 'pegasus', cons: ['Cap'],
    stars: ['δ Cap', 'α Cap', 'β Cap', 'γ Cap'],
    dso: ['M30'],
    view: { ra: 300, dec: 10, fov: 90 },
    pointers: [{ line: ['α Lyr', 'α Aql', 'α Cap'] }],
  },
  {
    id: 'PsA', block: 'pegasus', cons: ['PsA'],
    stars: ['α PsA', 'ε PsA'],
    view: { ra: 345, dec: 0, fov: 85 },
    pointers: [{ line: ['β Peg', 'α Peg', 'α PsA'] }],
  },
  {
    id: 'Equ_Lac', block: 'pegasus', cons: ['Equ', 'Lac'],
    stars: ['α Equ', 'α Lac'],
    view: { ra: 330, dec: 32, fov: 75 },
    pointers: [
      { path: ['ε Peg', 'α Equ'] },
      { path: ['α Cyg', 'α Lac', 'β Cas'] },
    ],
  },

  // ───────────────────────── Орион и его соседи ─────────────────────────
  {
    id: 'Ori', block: 'orion', cons: ['Ori'],
    stars: ['α Ori', 'β Ori', 'γ Ori', 'δ Ori', 'ε Ori', 'ζ Ori', 'κ Ori', 'λ Ori'],
    dso: ['M42'],
    view: { ra: 84, dec: 0, fov: 50 },
  },
  {
    id: 'Tau', block: 'orion', cons: ['Tau'],
    stars: ['α Tau', 'β Tau', 'ζ Tau', 'η Tau'],
    dso: ['M45', 'Hyades', 'M1'],
    pointers: [
      { path: ['ζ Ori', 'ε Ori', 'δ Ori', 'α Tau'] },
      { path: ['α Tau', 'M45'] },
    ],
  },
  {
    id: 'Aur', block: 'orion', cons: ['Aur'],
    stars: ['α Aur', 'β Aur', 'ε Aur', 'ι Aur', 'θ Aur'],
    dso: ['M36', 'M37', 'M38'],
    view: { ra: 105, dec: 50, fov: 105 },
    pointers: [{ line: ['δ UMa', 'α UMa', 'α Aur'] }],
  },
  {
    id: 'Gem', block: 'orion', cons: ['Gem'],
    stars: ['α Gem', 'β Gem', 'γ Gem', 'μ Gem', 'ε Gem', 'δ Gem'],
    dso: ['M35'],
    view: { ra: 125, dec: 38, fov: 110 },
    pointers: [
      { line: ['δ UMa', 'β UMa', 'α Gem'] },
      { line: ['β Ori', 'α Ori', 'α Gem'] },
    ],
  },
  {
    id: 'CMa', block: 'orion', cons: ['CMa'],
    stars: ['α CMa', 'ε CMa', 'δ CMa', 'β CMa', 'η CMa'],
    dso: ['M41'],
    pointers: [{ line: ['δ Ori', 'ζ Ori', 'α CMa'] }],
  },
  {
    id: 'CMi_Mon', block: 'orion', cons: ['CMi', 'Mon'],
    stars: ['α CMi', 'β CMi', 'β Mon', 'α Mon'],
    dso: ['NGC2244', 'M50'],
    pointers: [{ poly: ['α Ori', 'α CMa', 'α CMi'] }],
  },
  {
    id: 'Lep_Col', block: 'orion', cons: ['Lep', 'Col'],
    stars: ['α Lep', 'β Lep', 'α Col', 'β Col'],
    dso: ['M79'],
    pointers: [
      { line: ['α Ori', 'κ Ori', 'α Lep'] },
      { path: ['α Lep', 'β Lep', 'α Col'] },
    ],
  },
  {
    id: 'Eri', block: 'orion', cons: ['Eri'],
    stars: ['β Eri', 'γ Eri', 'θ Eri', 'α Eri', 'ε Eri'],
    view: { ra: 55, dec: -28, fov: 105 },
    pointers: [{ path: ['β Ori', 'β Eri'] }],
  },
  {
    id: 'Cam_Lyn', block: 'orion', cons: ['Cam', 'Lyn'],
    stars: ['β Cam', 'α Lyn'],
    dso: ['Kemble', 'NGC2403'],
    view: { ra: 105, dec: 62, fov: 80 },
    pointers: [
      { path: ['α UMi', 'α Aur'] },
      { path: ['α Aur', 'β UMa'] },
    ],
  },

  // ───────────────────────── Южное небо ─────────────────────────
  {
    id: 'Cen_Cru', block: 'south', cons: ['Cen', 'Cru', 'Mus'],
    stars: ['α Cen', 'β Cen', 'θ Cen', 'α Cru', 'β Cru', 'γ Cru', 'α Mus'],
    dso: ['omegaCen', 'Coalsack', 'NGC4755', 'CenA', 'SCP'],
    view: { ra: 200, dec: -65, fov: 75 },
    pointers: [
      { line: ['α Cen', 'β Cen', 'γ Cru'] },
      { line: ['γ Cru', 'α Cru', { ra: 0, dec: -89.99 }] },
    ],
  },
  {
    id: 'Argo', block: 'south', cons: ['Car', 'Pup', 'Vel', 'Pyx', 'Ant'],
    stars: ['α Car', 'β Car', 'ε Car', 'ζ Pup', 'λ Vel', 'γ Vel', 'α Pyx', 'α Ant'],
    dso: ['etaCar', 'IC2602'],
    view: { ra: 130, dec: -45, fov: 100 },
    pointers: [{ path: ['α CMa', 'α Car'] }],
  },
  {
    id: 'Lup_TrA', block: 'south', cons: ['Lup', 'Nor', 'Cir', 'TrA', 'Ara'],
    stars: ['α Lup', 'β Lup', 'α Cir', 'α TrA', 'β TrA', 'β Ara', 'α Ara'],
    view: { ra: 240, dec: -55, fov: 70 },
    pointers: [
      { path: ['α Cen', 'α Cir', 'α TrA'] },
      { path: ['α Sco', 'λ Sco', 'β Ara'] },
    ],
  },
  {
    id: 'CrA_Pav', block: 'south', cons: ['CrA', 'Tel', 'Ind', 'Pav', 'Mic'],
    stars: ['α CrA', 'α Tel', 'α Pav', 'α Ind', 'γ Mic'],
    view: { ra: 300, dec: -50, fov: 75 },
    pointers: [{ path: ['ε Sgr', 'α CrA', 'α Tel', 'α Pav'] }],
  },
  {
    id: 'Gru_Phe', block: 'south', cons: ['Gru', 'Phe', 'Tuc', 'Scl', 'For'],
    stars: ['α Gru', 'β Gru', 'α Phe', 'α Tuc', 'α Scl', 'α For'],
    dso: ['SMC', '47Tuc', 'NGC253', 'SGP'],
    view: { ra: 5, dec: -48, fov: 85 },
    pointers: [
      { path: ['α PsA', 'α Gru'] },
      { path: ['α Gru', 'α Phe', 'α Eri'] },
    ],
  },
  {
    id: 'LMC', block: 'south', cons: ['Dor', 'Men', 'Ret', 'Hor', 'Cae', 'Pic'],
    stars: ['α Dor', 'α Men', 'α Ret', 'α Hor', 'α Cae', 'α Pic', 'β Pic'],
    dso: ['LMC', 'Tarantula'],
    view: { ra: 70, dec: -60, fov: 70 },
    pointers: [
      { path: ['α Car', 'LMC'] },
      { path: ['α Eri', 'α Hor', 'α Cae'] },
    ],
  },
  {
    id: 'SCP', block: 'south', cons: ['Oct', 'Hyi', 'Cha', 'Vol', 'Aps'],
    stars: ['σ Oct', 'ν Oct', 'β Hyi', 'α Hyi', 'α Cha', 'γ Vol', 'α Aps'],
    dso: ['SCP', 'SMC', 'LMC'],
    view: { ra: 120, dec: -82, fov: 70 },
    pointers: [{ line: ['γ Cru', 'α Cru', { ra: 0, dec: -89.99 }] }],
  },

  // ───────────────────────── Небо как система ─────────────────────────
  {
    id: 'zodiac', block: 'theory', cons: [], theory: true,
    view: { ra: 270, dec: 66.56, fov: 215 }, opts: { ecliptic: true, months: true },
    focusLines: ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Oph', 'Sgr', 'Cap', 'Aqr', 'Psc'],
  },
  {
    id: 'milkyway', block: 'theory', cons: [], theory: true,
    dso: ['GC', 'GAC', 'NGP', 'SGP'],
    view: { ra: 192.86, dec: 27.13, fov: 215 }, opts: { mwBoost: 2.2 },
  },
  {
    id: 'coords', block: 'theory', cons: [], theory: true,
    view: { ra: 90, dec: 20, fov: 110 }, opts: { grid: true, ecliptic: true },
    focusLines: ['Ori', 'Tau', 'Gem', 'Aur', 'CMa', 'CMi'],
  },
];

// Южный маршрут — для южного полушария: те же уроки в другом порядке, от Южного Креста.
// Тексты «Как найти» и подписи указателей — в texts/south.csv (south.js загружается, только когда маршрут нужен).
// Указатели заданы там, где северные опираются на созвездия, которых в южном маршруте ещё не было;
// расстояния и «во сколько раз» в текстах — по расчёту (как и для северных).
export const SOUTH_BLOCKS = ['s-start', 's-cross', 's-canopus', 's-orion', 's-scorpius', 's-autumn', 's-leo', 's-north', 'theory'];

export const SOUTH_ROUTE: SouthStep[] = [
  { id: 'intro', block: 's-start' },

  { id: 'Cen_Cru', block: 's-cross' },
  { id: 'SCP', block: 's-cross' },
  { id: 'Lup_TrA', block: 's-cross', pointers: [{ path: ['α Cen', 'α Cir', 'α TrA'] }, { path: ['α TrA', 'β Ara'] }] },

  { id: 'Argo', block: 's-canopus', pointers: [{ path: ['β Cru', 'ε Car', 'α Car'] }] },
  // Ахернар понадобится дальше (Феникс, Журавль, Эридан): к нему — от Креста через полюс.
  { id: 'LMC', block: 's-canopus', pointers: [{ path: ['α Car', 'LMC'] }, { path: ['α Cru', { ra: 0, dec: -89.99 }, 'α Eri'] }, { path: ['α Eri', 'α Hor', 'α Cae'] }] },
  { id: 'Gru_Phe', block: 's-canopus', pointers: [{ path: ['α Eri', 'α Phe', 'α Gru'] }] },

  { id: 'Ori', block: 's-orion' },
  { id: 'CMa', block: 's-orion' },
  { id: 'CMi_Mon', block: 's-orion' },
  { id: 'Lep_Col', block: 's-orion' },
  { id: 'Eri', block: 's-orion' },
  { id: 'Tau', block: 's-orion' },
  { id: 'Gem', block: 's-orion', pointers: [{ line: ['β Ori', 'α Ori', 'α Gem'] }] },
  { id: 'Aur', block: 's-orion', pointers: [{ line: ['ζ Ori', 'β Tau', 'α Aur'] }] },

  { id: 'Sco', block: 's-scorpius', pointers: [{ path: ['α Cen', 'α Sco'] }] },
  { id: 'Sgr', block: 's-scorpius', pointers: [{ path: ['λ Sco', 'ε Sgr'] }] },
  { id: 'CrA_Pav', block: 's-scorpius' },
  { id: 'Lib', block: 's-scorpius', pointers: [{ path: ['α Sco', 'α Lib'] }] },
  { id: 'Oph_Ser', block: 's-scorpius', pointers: [{ path: ['α Sco', 'η Oph', 'α Oph'] }] },
  { id: 'Aql', block: 's-scorpius', pointers: [{ path: ['σ Sgr', 'α Aql'] }] },
  { id: 'Del_Sge_Vul_Sct', block: 's-scorpius' },
  { id: 'Cap', block: 's-scorpius', pointers: [{ path: ['α Aql', 'α Cap'] }] },
  { id: 'Aqr', block: 's-scorpius', pointers: [{ path: ['δ Cap', 'α Aqr'] }] },
  { id: 'PsA', block: 's-scorpius', pointers: [{ path: ['α Gru', 'α PsA'] }] },

  { id: 'Cet', block: 's-autumn', pointers: [{ path: ['α PsA', 'β Cet'] }] },
  { id: 'Peg', block: 's-autumn', pointers: [{ path: ['β Cet', 'γ Peg'] }] },
  { id: 'And', block: 's-autumn' },
  { id: 'Tri_Ari', block: 's-autumn' },
  { id: 'Psc', block: 's-autumn' },
  { id: 'Per', block: 's-autumn' },

  { id: 'Vir', block: 's-leo', pointers: [{ path: ['α Cen', 'θ Cen', 'α Vir'] }] },
  { id: 'Crv_Crt', block: 's-leo' },
  { id: 'Leo', block: 's-leo', pointers: [{ path: ['α Vir', 'β Leo', 'α Leo'] }] },
  { id: 'Hya', block: 's-leo' },
  { id: 'LMi_Sex', block: 's-leo' },
  { id: 'Cnc', block: 's-leo' },
  { id: 'Boo', block: 's-leo', pointers: [{ path: ['α Vir', 'α Boo'] }] },
  { id: 'CrB', block: 's-leo' },
  { id: 'Her', block: 's-leo', pointers: [{ path: ['α CrB', 'ζ Her'] }] },
  { id: 'CVn_Com', block: 's-leo', pointers: [{ path: ['β Leo', 'Mel111', 'α CVn'] }] },

  { id: 'Lyr', block: 's-north', pointers: [{ path: ['α Aql', 'α Lyr'] }] },
  { id: 'Cyg', block: 's-north' },
  { id: 'UMa', block: 's-north', pointers: [{ path: ['α Boo', 'η UMa'] }] },
  { id: 'UMi', block: 's-north' },
  { id: 'Cas', block: 's-north' },
  { id: 'Cep', block: 's-north' },
  { id: 'Dra', block: 's-north' },
  { id: 'Cam_Lyn', block: 's-north' },
  { id: 'Equ_Lac', block: 's-north' },

  { id: 'zodiac', block: 'theory' },
  { id: 'milkyway', block: 'theory' },
  { id: 'coords', block: 'theory' },
];
