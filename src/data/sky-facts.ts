// Факты о созвездиях для шпаргалки и задач. Списки Млечного Пути проверяет npm test
// по настоящей карте Млечного Пути (доля линий созвездия внутри него).

// Самые известные созвездия — из них строятся лёгкие задачи, а сложные — из остальных.
export const FAMOUS = ['UMa', 'UMi', 'Cas', 'Cep', 'Dra', 'Cyg', 'Lyr', 'Aql', 'Her', 'Ori', 'Tau', 'Gem', 'Leo', 'Boo', 'Vir', 'Sco', 'Sgr', 'Peg', 'And', 'Per', 'Aur', 'CMa', 'CMi', 'CrB'];

// Созвездия на эклиптике — Солнце проходит их по порядку.
export const ECLIPTIC = ['Psc', 'Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Oph', 'Sgr', 'Cap', 'Aqr'];

// Классические зодиакальные (без Змееносца — в вопросах «какое лишнее» он был бы спорным).
export const ZODIAC = ['Psc', 'Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr'];

// Не зодиакальные, но рядом с эклиптикой — правдоподобные «лишние».
export const NEAR_ECLIPTIC = ['Ori', 'Cet', 'Aur', 'Peg', 'Hya', 'Crv', 'Crt', 'Sex', 'CMi', 'Aql', 'Per', 'And', 'Lup'];

// Млечный Путь проходит через них заметно (и об этом говорит урок «Млечный Путь»).
export const MILKY_WAY = ['Cas', 'Per', 'Aur', 'Mon', 'Pup', 'Vel', 'Car', 'Cru', 'Nor', 'Sco', 'Sgr', 'Sct', 'Aql', 'Vul', 'Cyg', 'Sge', 'Cep'];

// А через эти — нет: в их сторону мы смотрим из диска Галактики «вбок».
export const NOT_MILKY_WAY = ['UMa', 'UMi', 'Leo', 'Vir', 'Peg', 'Psc', 'Boo', 'Com', 'CVn', 'Ari', 'Cet', 'Aqr', 'Lib', 'Crv', 'Crt', 'Tri', 'LMi', 'CrB', 'Cap'];
