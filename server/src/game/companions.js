// Party (отряд) rules — pure, deterministic, no I/O.
//
// A companion is a full character (class + level + abilities) that travels with
// the player's leader. This module owns the *design data and math*: personality
// traits, the ways a companion can be found, ready-made companion templates,
// and the relationship/acceptance rules. Persistence lives in services/party.js.

// ---------------------------------------------------------------------------
// Traits: personality pluses and minuses. `effects` feed the relationship math,
// `likes`/`dislikes` seed how two companions feel about each other.
// ---------------------------------------------------------------------------

export const TRAITS = {
  brave: { name: 'Храбрый', kind: 'plus', blurb: 'Не отступает перед сильным врагом.', effects: { accept: 10, loyalty: 4 }, likes: ['fierce', 'hardy'], dislikes: ['coward'] },
  loyal: { name: 'Верный', kind: 'plus', blurb: 'Слово держит крепче стали.', effects: { loyalty: 10 }, likes: ['honest', 'kind'], dislikes: ['liar'] },
  kind: { name: 'Добрый', kind: 'plus', blurb: 'Чужую боль чувствует как свою.', effects: { loyalty: 5, bond: 6 }, likes: ['pious', 'cheerful'], dislikes: ['cruel'] },
  clever: { name: 'Смекалистый', kind: 'plus', blurb: 'Выход найдёт там, где его нет.', effects: { accept: 5, bond: 3 }, likes: ['studious', 'calm'], dislikes: ['stubborn'] },
  calm: { name: 'Хладнокровный', kind: 'plus', blurb: 'Под огнём дышит ровно.', effects: { loyalty: 4 }, likes: ['clever', 'honest'], dislikes: ['hotheaded'] },
  honest: { name: 'Честный', kind: 'plus', blurb: 'Кривит душой разве что перед смертью.', effects: { loyalty: 6 }, likes: ['loyal', 'calm'], dislikes: ['liar'] },
  hardy: { name: 'Закалённый', kind: 'plus', blurb: 'Голод и холод ему нипочём.', effects: { loyalty: 3, accept: 4 }, likes: ['brave', 'loyal'], dislikes: ['lazy'] },
  swift: { name: 'Стремительный', kind: 'plus', blurb: 'Быстрее, чем успеешь моргнуть.', effects: { accept: 3 }, likes: ['brave'], dislikes: ['lazy'] },
  pious: { name: 'Набожный', kind: 'plus', blurb: 'Верит — и эта вера держит его.', effects: { loyalty: 5 }, likes: ['kind', 'honest'], dislikes: ['heretic'] },
  cheerful: { name: 'Жизнерадостный', kind: 'plus', blurb: 'Даже в аду найдёт повод улыбнуться.', effects: { bond: 6 }, likes: ['kind', 'clever'], dislikes: ['gloomy'] },
  studious: { name: 'Учёный', kind: 'plus', blurb: 'Книга для него — оружие.', effects: { accept: 4 }, likes: ['clever'], dislikes: ['drunkard'] },
  fierce: { name: 'Свирепый', kind: 'plus', blurb: 'В бою страшен, в миру — нет.', effects: { accept: 6 }, likes: ['brave'], dislikes: ['coward'] },

  stubborn: { name: 'Упрямый', kind: 'minus', blurb: 'Своего не уступит и под пыткой.', effects: { accept: -6 }, likes: ['hardy'], dislikes: ['clever'] },
  greedy: { name: 'Жадный', kind: 'minus', blurb: 'Золото любит больше людей.', effects: { accept: 5, loyalty: -8 }, likes: ['vain'], dislikes: ['kind'] },
  coward: { name: 'Трусливый', kind: 'minus', blurb: 'Бежит первым, оглядывается вторым.', effects: { accept: -4, loyalty: -6 }, likes: [], dislikes: ['brave', 'fierce'] },
  cruel: { name: 'Жестокий', kind: 'minus', blurb: 'Милосердие считает слабостью.', effects: { bond: -8 }, likes: ['fierce'], dislikes: ['kind', 'pious'] },
  drunkard: { name: 'Пьяница', kind: 'minus', blurb: 'Трезвым его никто не видел.', effects: { loyalty: -5 }, likes: ['cheerful'], dislikes: ['studious'] },
  hotheaded: { name: 'Вспыльчивый', kind: 'minus', blurb: 'Сначала кулак, потом голова.', effects: { accept: 3, loyalty: -4 }, likes: ['fierce'], dislikes: ['calm'] },
  gloomy: { name: 'Мрачный', kind: 'minus', blurb: 'Видит конец раньше начала.', effects: { bond: -5 }, likes: [], dislikes: ['cheerful'] },
  liar: { name: 'Лживый', kind: 'minus', blurb: 'Правда для него — крайний случай.', effects: { loyalty: -7 }, likes: ['greedy'], dislikes: ['honest', 'loyal'] },
  lazy: { name: 'Ленивый', kind: 'minus', blurb: 'Работа подождёт, он тоже.', effects: { accept: -5 }, likes: [], dislikes: ['hardy', 'swift'] },
  heretic: { name: 'Отступник', kind: 'minus', blurb: 'Богов меняет, как перчатки.', effects: { loyalty: -3 }, likes: ['clever'], dislikes: ['pious'] },
  vain: { name: 'Тщеславный', kind: 'minus', blurb: 'Любуется собой в любой луже.', effects: { bond: -4 }, likes: ['greedy'], dislikes: ['gloomy'] },
  paranoid: { name: 'Подозрительный', kind: 'minus', blurb: 'В каждом друге видит нож.', effects: { bond: -6 }, likes: [], dislikes: ['cheerful', 'kind'] },
};

export const traitInfo = (key) => TRAITS[key] || { name: key, kind: 'plus', blurb: '', effects: {}, likes: [], dislikes: [] };

// Compatibility of two people from their traits: -1 (clash) .. +1 (kinship).
export function traitCompat(traitKeysA = [], traitKeysB = []) {
  const denom = Math.max(1, traitKeysA.length + traitKeysB.length);
  let score = 0;
  for (const aKey of traitKeysA) {
    const A = traitInfo(aKey);
    for (const bKey of traitKeysB) {
      const B = traitInfo(bKey);
      if (aKey === bKey) score += 0.5;            // kindred spirits: shared traits
      if (A.likes.includes(bKey)) score += 1;
      if (B.likes.includes(aKey)) score += 1;
      if (A.dislikes.includes(bKey)) score -= 1;
      if (B.dislikes.includes(aKey)) score -= 1;
    }
  }
  return Math.max(-1, Math.min(1, score / denom));
}

// ---------------------------------------------------------------------------
// The fourteen ways a companion can be found.
//   method: how the recruit is resolved — free | gold | trial | quest | tame |
//           raise | persuade | favor
// ---------------------------------------------------------------------------

export const RECRUIT_SOURCES = {
  tavern: { name: 'Таверна', icon: '🍺', method: 'gold', baseChance: 70, goldRange: [30, 120], blurb: 'Нанять за кружкой эля: у каждого своя цена.' },
  road: { name: 'Встреча в пути', icon: '🚶', method: 'free', baseChance: 55, goldRange: [0, 20], blurb: 'Путник на дороге — быть может, он ищет компанию.' },
  rescue: { name: 'Спасение пленника', icon: '⛓️', method: 'free', baseChance: 90, goldRange: [0, 0], blurb: 'Освободить того, кто томится в клетке.' },
  quest: { name: 'Награда за квест', icon: '🎁', method: 'quest', baseChance: 95, goldRange: [0, 0], blurb: 'Кто-то приходит сам, отплатить добром.' },
  arena: { name: 'Арена', icon: '🏟️', method: 'trial', baseChance: 80, goldRange: [0, 0], blurb: 'Победи его в честном бою — и он твой.' },
  mercy: { name: 'Пощада побеждённого', icon: '⚔️', method: 'free', baseChance: 60, goldRange: [0, 0], blurb: 'Даровать жизнь вместо казни.' },
  ransom: { name: 'Выкуп долга', icon: '🪙', method: 'gold', baseChance: 85, goldRange: [50, 200], blurb: 'Заплатить кредитору и забрать его с собой.' },
  necromancy: { name: 'Некромантия', icon: '💀', method: 'raise', baseChance: 100, goldRange: [0, 0], blurb: 'Поднять павшего — он вернётся, но изменится.' },
  guild: { name: 'Гильдия наёмников', icon: '📜', method: 'gold', baseChance: 100, goldRange: [150, 400], blurb: 'Купить контракт опытного бойца.' },
  beast: { name: 'Приручить зверя', icon: '🐺', method: 'tame', baseChance: 65, goldRange: [0, 30], blurb: 'Прикормить дикого зверя и сделать другом.' },
  sermon: { name: 'Проповедь', icon: '🙏', method: 'persuade', baseChance: 45, goldRange: [0, 0], blurb: 'Словом обратить к себе чужое сердце.' },
  deed: { name: 'Спасти в беде', icon: '🌫️', method: 'free', baseChance: 95, goldRange: [0, 0], blurb: 'Вытащить из огня, засады или обвала.' },
  favor: { name: 'Личная просьба', icon: '👑', method: 'favor', baseChance: 75, goldRange: [0, 40], blurb: 'Исполнить его маленькое дело — он пойдёт за тобой.' },
  orphan: { name: 'Приют', icon: '🏚️', method: 'free', baseChance: 88, goldRange: [0, 0], blurb: 'Взять под опеку сироту или беглеца.' },
};

export const listSources = () => Object.entries(RECRUIT_SOURCES).map(([key, s]) => ({ key, ...s }));
export const sourceInfo = (key) => RECRUIT_SOURCES[key] || null;

// ---------------------------------------------------------------------------
// Companion templates — the actual people you can meet. Each is a full
// character with a history, two pluses, two minuses, a starting opinion of the
// leader, a portrait slug and the sources they can appear from.
// ---------------------------------------------------------------------------

export const COMPANIONS = [
  {
    key: 'marta_veil', name: 'Марта Вейл', class: 'fighter', level: 3,
    portrait: 'marta_veil',
    history: 'Двенадцать лет держала северные ворота, пока гарнизон не сожгли вместе с городом. С тех пор ищет, за что умереть не зря.',
    plus: ['brave', 'loyal'], minus: ['stubborn', 'gloomy'],
    opinion: 45, sources: ['tavern', 'guild', 'road'],
  },
  {
    key: 'rayven', name: 'Рэйвен', class: 'rogue', level: 2,
    portrait: 'rayven',
    history: 'Выросла в Сумеречной гавани среди воров и тумана. Улыбается редко, зато всегда знает, где выход.',
    plus: ['clever', 'swift'], minus: ['paranoid', 'greedy'],
    opinion: 35, sources: ['road', 'mercy', 'ransom'],
  },
  {
    key: 'dorin_stone', name: 'Дорин Камень', class: 'cleric', level: 4,
    portrait: 'dorin_stone',
    history: 'Последний жрец утонувшей часовни. Ходит по миру, отпевая всех, кого не успел спасти.',
    plus: ['pious', 'kind'], minus: ['gloomy', 'stubborn'],
    opinion: 55, sources: ['quest', 'rescue', 'sermon'],
  },
  {
    key: 'kael_vane', name: 'Каэль Вейн', class: 'wizard', level: 3,
    portrait: 'kael_vane',
    history: 'Учёный из сгоревшей библиотеки. Полжизни собирает по обрывкам то, что сгорело, и не заметил, как стал мёртвым.',
    plus: ['studious', 'clever'], minus: ['coward', 'greedy'],
    opinion: 40, sources: ['tavern', 'quest', 'road'],
  },
  {
    key: 'gorr', name: 'Горр', class: 'barbarian', level: 2,
    portrait: 'gorr',
    history: 'Был вожаком клана, пока не перебил его в приступе бешенства. Теперь бьётся за других, чтобы забыть.',
    plus: ['fierce', 'hardy'], minus: ['hotheaded', 'drunkard'],
    opinion: 30, sources: ['arena', 'mercy', 'road'],
  },
  {
    key: 'lute', name: 'Лютня', class: 'bard', level: 2,
    portrait: 'lute',
    history: 'Никто не помнит её настоящего имени — только песни, что она поёт в тавернах. В каждой песне спрятана правда.',
    plus: ['cheerful', 'clever'], minus: ['liar', 'vain'],
    opinion: 50, sources: ['tavern', 'favor', 'road'],
  },
  {
    key: 'yara_thorn', name: 'Яра Тернь', class: 'druid', level: 4,
    portrait: 'yara_thorn',
    history: 'Живёт на границе Пепельного леса. Деревья говорят с ней, и она им отвечает — это тревожит и её саму.',
    plus: ['kind', 'calm'], minus: ['heretic', 'paranoid'],
    opinion: 48, sources: ['rescue', 'deed', 'beast'],
  },
  {
    key: 'bo', name: 'Бо', class: 'monk', level: 3,
    portrait: 'bo',
    history: 'Молчаливый послушник разрушенного монастыря. Своё имя отдал настоятелю и с тех пор носит чужое.',
    plus: ['calm', 'hardy'], minus: ['gloomy', 'stubborn'],
    opinion: 52, sources: ['favor', 'quest', 'deed'],
  },
  {
    key: 'sera_dawn', name: 'Сера Рассвет', class: 'paladin', level: 5,
    portrait: 'sera_dawn',
    history: 'Рыцарь павшего ордена. Клятву не нарушила ни разу, даже когда это стоило ей всего.',
    plus: ['pious', 'brave'], minus: ['stubborn', 'vain'],
    opinion: 60, sources: ['guild', 'quest', 'arena'],
  },
  {
    key: 'fin', name: 'Финн', class: 'ranger', level: 2,
    portrait: 'fin',
    history: 'Охотник с Костяного берега. Говорит, что звери честнее людей — и, похоже, не шутит.',
    plus: ['swift', 'hardy'], minus: ['paranoid', 'lazy'],
    opinion: 42, sources: ['beast', 'road', 'deed'],
  },
  {
    key: 'ember', name: 'Эмбер', class: 'sorcerer', level: 3,
    portrait: 'ember',
    history: 'В её крови спит дракон. Она не помнит, откуда пришла, зато помнит каждый пожар, что устроила.',
    plus: ['fierce', 'cheerful'], minus: ['hotheaded', 'vain'],
    opinion: 38, sources: ['arena', 'road', 'favor'],
  },
  {
    key: 'vashek', name: 'Вашек', class: 'warlock', level: 4,
    portrait: 'vashek',
    history: 'Продал тень за знание и с тех пор не видит солнца. Шутит, что оно всё равно его не любит.',
    plus: ['clever', 'calm'], minus: ['heretic', 'liar'],
    opinion: 33, sources: ['ransom', 'mercy', 'quest'],
  },
  {
    key: 'old_pell', name: 'Старый Пелл', class: 'fighter', level: 1,
    portrait: 'old_pell',
    history: 'Отставной солдат, который больше не может держать строй, но всё ещё может держать слово.',
    plus: ['loyal', 'honest'], minus: ['drunkard', 'lazy'],
    opinion: 65, sources: ['tavern', 'orphan', 'rescue'],
  },
  {
    key: 'nyla', name: 'Нила', class: 'rogue', level: 1,
    portrait: 'nyla',
    history: 'Сирота из гавани. Ворует с семи лет, но ни разу не обокрала того, кто беднее её.',
    plus: ['swift', 'kind'], minus: ['liar', 'coward'],
    opinion: 70, sources: ['orphan', 'rescue', 'deed'],
  },
  {
    key: 'brann', name: 'Бранн', class: 'cleric', level: 2,
    portrait: 'brann',
    history: 'Проповедник, что ходит по пепелищам и хоронит всех, кого находит. Веру свою несёт, как щит.',
    plus: ['pious', 'honest'], minus: ['stubborn', 'gloomy'],
    opinion: 58, sources: ['sermon', 'quest', 'rescue'],
  },
  {
    key: 'ash', name: 'Эш', class: 'ranger', level: 3,
    portrait: 'ash',
    history: 'Следопыт, что выжил там, где погиб его отряд. Идёт вперёд, потому что не умеет иначе.',
    plus: ['hardy', 'brave'], minus: ['gloomy', 'paranoid'],
    opinion: 44, sources: ['road', 'deed', 'beast'],
  },
  {
    key: 'morrigan', name: 'Морриган', class: 'warlock', level: 5,
    portrait: 'morrigan',
    history: 'Повелительница долгов, что стрижёт души по контрактам. Улыбается так, что хочется проверить кошелёк.',
    plus: ['clever', 'calm'], minus: ['cruel', 'greedy'],
    opinion: 28, sources: ['ransom', 'arena', 'guild'],
  },
  {
    key: 'tob', name: 'Тоб', class: 'monk', level: 1,
    portrait: 'tob',
    history: 'Беглый послушник, что сбежал из монастыря, не выучив ни единой молитвы, зато выучив всё остальное.',
    plus: ['cheerful', 'swift'], minus: ['lazy', 'liar'],
    opinion: 62, sources: ['orphan', 'road', 'favor'],
  },
  {
    key: 'iris', name: 'Ирис', class: 'druid', level: 3,
    portrait: 'iris',
    history: 'Травница, что лечит и людей, и зверей, не спрашивая, кто перед ней. Одинаково не доверяет и тем, и другим.',
    plus: ['kind', 'studious'], minus: ['paranoid', 'heretic'],
    opinion: 46, sources: ['beast', 'deed', 'sermon'],
  },
  {
    key: 'cass', name: 'Касс', class: 'barbarian', level: 4,
    portrait: 'cass',
    history: 'Наёмница с арены, что не проиграла ни одного боя и устала от этого до тошноты.',
    plus: ['fierce', 'brave'], minus: ['cruel', 'hotheaded'],
    opinion: 36, sources: ['arena', 'guild', 'mercy'],
  },
  {
    key: 'hale', name: 'Хейл', class: 'wizard', level: 2,
    portrait: 'hale',
    history: 'Ученик, чей наставник исчез в Чёрном шпиле. Ищет его и боится найти.',
    plus: ['studious', 'honest'], minus: ['coward', 'gloomy'],
    opinion: 54, sources: ['quest', 'road', 'rescue'],
  },
  {
    key: 'sable', name: 'Сэйбл', class: 'rogue', level: 4,
    portrait: 'sable',
    history: 'Тень гильдии воров, что ушла на покой — и покой её не принял.',
    plus: ['clever', 'calm'], minus: ['greedy', 'cruel'],
    opinion: 32, sources: ['ransom', 'guild', 'mercy'],
  },
  {
    key: 'pious_odo', name: 'Одо', class: 'paladin', level: 2,
    portrait: 'pious_odo',
    history: 'Молодой паладин, что верит громче всех, потому что боится тишины внутри.',
    plus: ['pious', 'brave'], minus: ['vain', 'stubborn'],
    opinion: 57, sources: ['sermon', 'rescue', 'quest'],
  },
  {
    key: 'wolf', name: 'Клык', class: 'ranger', level: 2,
    portrait: 'wolf',
    history: 'Волк, что принял человека в свою стаю. Или человек, что принял волчью. Уже и не разобрать.',
    plus: ['fierce', 'loyal'], minus: ['paranoid', 'lazy'],
    opinion: 50, sources: ['beast', 'deed', 'road'],
  },
];

export const companionTemplate = (key) => COMPANIONS.find((c) => c.key === key) || null;

// Deterministic asking price for a companion, drawn from their first source's
// gold range. No randomness so the same companion always quotes the same price.
export const templatePrice = (t) => {
  const src = sourceInfo(t.sources?.[0]);
  const [lo, hi] = src?.goldRange || [0, 0];
  if (hi <= lo) return lo;
  const h = [...t.key].reduce((a, c) => a + c.charCodeAt(0), 0);
  return lo + (h % (hi - lo + 1));
};

// Portrait slug -> game-icons.net source (author/name). Kept here so the icon
// fetch script and the CREDITS manifest can both read it.
export const PORTRAITS = {
  marta_veil: 'lorc/visored-helm', rayven: 'darkzaitzev/hooded-figure', dorin_stone: 'cathelineau/nun-face',
  kael_vane: 'delapouite/wizard-face', gorr: 'delapouite/orc-head', lute: 'delapouite/portrait',
  yara_thorn: 'cathelineau/witch-face', bo: 'delapouite/monk-face', sera_dawn: 'delapouite/black-knight-helm',
  fin: 'delapouite/eagle-head', ember: 'delapouite/woman-elf-face', vashek: 'delapouite/warlock-hood',
  old_pell: 'lorc/beard', nyla: 'darkzaitzev/ninja-head', brann: 'delapouite/sun-priest',
  ash: 'delapouite/kenku-head', morrigan: 'delapouite/executioner-hood', tob: 'delapouite/hoodie',
  iris: 'delapouite/oak-leaf', cass: 'delapouite/viking-head', hale: 'delapouite/person',
  sable: 'darkzaitzev/hooded-assassin', pious_odo: 'delapouite/spartan-helmet', wolf: 'lorc/wolf-head',
};

// ---------------------------------------------------------------------------
// Relationship rules.
// ---------------------------------------------------------------------------

export const RELATION_MIN = 0;
export const RELATION_MAX = 100;
export const LEAVE_THRESHOLD = 25; // below this, with anyone, the companion walks.

export const clampRelation = (v, min = RELATION_MIN, max = RELATION_MAX) =>
  Math.max(min, Math.min(max, Math.round(v)));

// How a companion feels about the leader when first met.
export function seedOpinionToPlayer(template, { source, goldPaid = 0 } = {}) {
  let value = template.opinion ?? 50;
  if (source === 'rescue' || source === 'deed') value += 20;
  if (source === 'mercy') value += 12;
  if (source === 'raise') value -= 25;
  if (source === 'tavern' || source === 'guild' || source === 'ransom') value += Math.min(15, Math.floor(goldPaid / 40));
  for (const t of template.plus || []) value += (traitInfo(t).effects.bond || 0) / 2;
  for (const t of template.minus || []) value += (traitInfo(t).effects.bond || 0) / 2;
  return clampRelation(value);
}

// How two companions feel about each other when they meet. Kept in 30..90 so a
// fresh recruit never walks out the door on day one, but can still fall out.
export function seedBondBetween(a, b) {
  const compat = traitCompat([...(a.plus || []), ...(a.minus || [])], [...(b.plus || []), ...(b.minus || [])]);
  return clampRelation(50 + compat * 40, 30, 90);
}

// Chance (0..1) that a companion accepts an invitation.
export function acceptanceChance(template, { source, relationToPlayer = 50, charisma = 50, goldOffered = 0 } = {}) {
  const src = sourceInfo(source);
  const method = src?.method || 'free';
  let chance = (src?.baseChance ?? 50) / 100;

  chance += ((relationToPlayer - 50) / 100) * 0.6;
  chance += ((charisma - 50) / 100) * 0.4;
  for (const t of template.plus || []) chance += (traitInfo(t).effects.accept || 0) / 100;
  for (const t of template.minus || []) chance += (traitInfo(t).effects.accept || 0) / 100;

  if (method === 'gold') {
    const price = templatePrice(template);
    if (goldOffered >= price) chance += Math.min(0.25, ((goldOffered - price) / Math.max(1, price)) * 0.3);
    else chance -= 0.5;
  }
  if (method === 'trial') chance = Math.max(chance, 0.8); // winning the trial earns respect
  if (method === 'raise') chance = 1;                     // the dead do not refuse

  return Math.max(0.05, Math.min(0.95, chance));
}

// Does this companion leave? Only if a bond (to the leader or a peer) is low.
export function shouldLeave({ relationToPlayer = 50, bonds = [] } = {}) {
  if (relationToPlayer < LEAVE_THRESHOLD) return { leave: true, reason: 'leader' };
  const worst = bonds.find((b) => b.value < LEAVE_THRESHOLD);
  if (worst) return { leave: true, reason: 'peer', peerKey: worst.key, value: worst.value };
  return { leave: false };
}

// Roll an acceptance (kept separate so callers can pass a deterministic rng).
export function rollAcceptance(template, opts, rng = Math.random) {
  const chance = acceptanceChance(template, opts);
  return { accepted: rng() < chance, chance };
}
