// The ship (Wave W-SHIP). A hero buys a ship in a port for gold, then raises it
// through ten levels. Each level unlocks six upgrades -- two in each of three
// branches: the hull (the ship itself), the guns (damage / reload / count) and
// the class guns (special guns only some hero classes can man, each with its
// own ability). Everything here is pure: the service stores the bought ship and
// the forged ranks and applies the resulting bonuses. Ability ids and gun keys
// stay latin; all player-facing text is Russian.

export const MAX_SHIP_LEVEL = 10;

export const SHIP_PRICE = 500;          // gold, bought in a port
export const LEVEL_UP_BASE = 10;        // points to raise the ship's own level
export const HOURS_BASE = 1;            // in-game hours per component level
export const MINUTES_PER_HOUR = 60;     // matches the travel clock's hour
export const DOCK_HAND_GOLD = 40;       // gold per level to hire dock hands

// Sea-battle payouts: the only source of ship points.
export const POINTS_PER_PIRATE_WIN = 5;
export const POINTS_PER_MONSTER_WIN = { min: 6, max: 10 };

export const BRANCHES = [
  { key: 'hull', name: 'Корпус', blurb: 'Сам корабль: обшивка, паруса, команда.' },
  { key: 'guns', name: 'Пушки', blurb: 'Урон, перезарядка и число орудий.' },
  { key: 'class_guns', name: 'Оружие классов', blurb: 'Особые пушки под класс отряда.' },
];

// Cost scale, shared with the party tree: the n-th level of a component costs
// base * n, so each further level costs more than the last.
export function costForLevel(base, level) { return base * level; }
export function spentOnComponent(base, level) {
  let sum = 0;
  for (let n = 1; n <= level; n += 1) sum += costForLevel(base, n);
  return sum;
}
export const totalComponentCost = (base) => spentOnComponent(base, MAX_SHIP_LEVEL);

// Dock time in game minutes: the n-th level takes HOURS_BASE * n in-game hours,
// times a `heavy` multiplier for the bulky pieces.
export function minutesForLevel(level, heavy = 1) {
  return Math.round(HOURS_BASE * level * heavy * MINUTES_PER_HOUR);
}
export function minutesForLevelUp(level) {
  return minutesForLevel(level, 2);
}
// Dock time to raise the ship from `shipLevel` to the next level.
export const levelUpMinutes = (shipLevel) => minutesForLevelUp(Math.min(MAX_SHIP_LEVEL, shipLevel + 1));
export const levelUpCost = (level) => LEVEL_UP_BASE * level;

const H = (level, key, name, blurb, effect, base = 3, heavy = 1.5) =>
  ({ branch: 'hull', level, key, name, blurb, effect, base, heavy });
const G = (level, key, name, blurb, effect, base = 3, heavy = 1.2) =>
  ({ branch: 'guns', level, key, name, blurb, effect, base, heavy });
const C = (level, key, name, classes, blurb, base = 5, heavy = 2) =>
  ({ branch: 'class_guns', level, key, name, blurb, base, heavy, classes, effect: { stat: 'classGun', add: key } });

export const UPGRADES = [
  // --- Branch A: the hull ---
  H(1, 'hull_planking', 'Обшивка', 'Доски корпуса держат больше ударов.', { stat: 'hullHp', add: 40 }),
  H(1, 'hull_frame', 'Набор корпуса', 'Крепкий набор гасит часть урона.', { stat: 'armour', add: 0.03 }),
  H(2, 'hull_sails', 'Паруса', 'Корабль идёт быстрее.', { stat: 'speed', add: 0.05 }),
  H(2, 'hull_rigging', 'Такелаж', 'Снасти помогают уходить от залпа.', { stat: 'evade', add: 0.04 }),
  H(3, 'hull_hold', 'Трюм', 'Больше груза для дальних переходов.', { stat: 'cargo', add: 2 }),
  H(3, 'hull_lockers', 'Кладовые', 'Ещё место под припасы.', { stat: 'cargo', add: 1 }),
  H(4, 'hull_crew', 'Команда', 'Больше людей на борту и в абордаже.', { stat: 'crew', add: 2 }),
  H(4, 'hull_galley', 'Камбуз', 'Сытая команда крепче держится.', { stat: 'crewHeal', add: 0.05 }),
  H(5, 'hull_reinforced', 'Укреплённый корпус', 'Двойная обшивка держит ядра.', { stat: 'hullHp', add: 60 }),
  H(5, 'hull_oakbelt', 'Дубовый пояс', 'Пояс из дуба гасит бортовой залп.', { stat: 'armour', add: 0.04 }),
  H(6, 'hull_keel', 'Киль', 'Глубокий киль не даёт взять на абордаж.', { stat: 'boardResist', add: 0.05 }),
  H(6, 'hull_stem', 'Форштевень', 'Нос крепче встречает удар.', { stat: 'hullHp', add: 50 }),
  H(7, 'hull_pumps', 'Насосы', 'Откачивают воду из трюма.', { stat: 'floodRecover', add: 0.10 }),
  H(7, 'hull_bulkheads', 'Переборки', 'Переборки не дают воде разлиться.', { stat: 'floodLimit', add: 1 }),
  H(8, 'hull_rudder', 'Руль', 'Легче разорвать бой и уйти.', { stat: 'escape', add: 0.05 }),
  H(8, 'hull_helm', 'Штурвал', 'Точнее держишь курс в бою.', { stat: 'helm', add: 0.05 }),
  H(9, 'hull_ram', 'Таран', 'Нос окован для таранного удара.', { stat: 'ram', add: 4 }),
  H(9, 'hull_spur', 'Бивень', 'Таран бьёт сильнее.', { stat: 'ramDamage', add: 0.10 }),
  H(10, 'hull_flagship', 'Флагман', 'Флагманский корпус: всем потолкам +1.', { stat: 'capAll', add: 1 }, 5, 2),
  H(10, 'hull_admiral', 'Адмиральский флаг', 'Флаг поднимает дух отряда в море.', { stat: 'partyAura', add: 0.03 }, 5, 2),

  // --- Branch B: the guns ---
  G(1, 'gun_charge', 'Заряд', 'Увеличенный заряд бьёт сильнее.', { stat: 'cannonDamage', add: 0.06 }),
  G(1, 'gun_match', 'Фитиль', 'Надёжный фитиль реже подводит.', { stat: 'reliability', add: 0.05 }),
  G(2, 'gun_reload', 'Перезарядка', 'Орудия перезаряжаются быстрее.', { stat: 'reload', add: 0.06 }),
  G(2, 'gun_powder', 'Пороховая камора', 'Камора держит больше пороха.', { stat: 'cannonDamage', add: 0.04 }),
  G(3, 'gun_second_broad', 'Второй борт', 'Открывает второй борт орудий.', { stat: 'gunSlots', add: 1 }),
  G(3, 'gun_magazine', 'Ядровый погреб', 'Больше ядер под рукой.', { stat: 'magazine', add: 1 }),
  G(4, 'gun_grapeshot', 'Картечь', 'Картечь косит команду врага.', { stat: 'grapeshot', add: 0.05 }),
  G(4, 'gun_scatter', 'Дробь', 'Дробь бьёт по площади.', { stat: 'grapeshot', add: 0.04 }),
  G(5, 'gun_heavy', 'Тяжёлые ядра', 'Тяжёлые ядра ломают борт.', { stat: 'cannonDamage', add: 0.07 }),
  G(5, 'gun_stone', 'Каменные ядра', 'Каменные ядра рвут снасти.', { stat: 'riggingDamage', add: 0.06 }),
  G(6, 'gun_third_broad', 'Третий борт', 'Открывает третий борт орудий.', { stat: 'gunSlots', add: 1 }),
  G(6, 'gun_bombracks', 'Бомбовые лотки', 'Лотки для зажигательных бомб.', { stat: 'bombs', add: 1 }),
  G(7, 'gun_aim', 'Наводка', 'Наводчики бьют точнее.', { stat: 'accuracy', add: 0.06 }),
  G(7, 'gun_rangefinder', 'Дальномер', 'Дальномер пристреливает цель.', { stat: 'accuracy', add: 0.04 }),
  G(8, 'gun_fourth_broad', 'Четвёртый борт', 'Открывает четвёртый борт орудий.', { stat: 'gunSlots', add: 1 }),
  G(8, 'gun_quickmounts', 'Скорострельные салазки', 'Салазки ускоряют откат.', { stat: 'reload', add: 0.05 }),
  G(9, 'gun_range', 'Дальность', 'Достаёшь врага раньше.', { stat: 'range', add: 0.08 }),
  G(9, 'gun_barrels', 'Удлинённые стволы', 'Длинные стволы бьют дальше.', { stat: 'range', add: 0.05 }),
  G(10, 'gun_battery', 'Батарея', 'Батарея: всем потолкам пушек +1.', { stat: 'capAll', add: 1 }, 5, 2),
  G(10, 'gun_barrage', 'Шквал огня', 'Слаженный шквал залпов.', { stat: 'barrage', add: 0.08 }, 5, 2),

  // --- Branch C: class guns (one ability each) ---
  C(1, 'culverin', 'Кулеврина', ['ranger', 'rogue'], 'Прицельный залп — дальний и точный.'),
  C(1, 'falconet', 'Фальконет', ['rogue', 'bard'], 'Лёгкий залп — дешёвый и быстрый.'),
  C(2, 'carronade', 'Карронада', ['fighter', 'barbarian'], 'Бортовой залп — тяжёлый, в упор.'),
  C(2, 'musketoon', 'Мушкетон', ['fighter', 'paladin'], 'Залп дробью — по команде врага.'),
  C(3, 'mortar', 'Мортира', ['wizard', 'sorcerer'], 'Навесный огонь — по площади.'),
  C(3, 'bombard', 'Бомбарда', ['wizard', 'warlock'], 'Бомбарда — осадный урон.'),
  C(4, 'harpoon', 'Гарпун', ['ranger', 'druid'], 'Гарпунный трос — тянет и тормозит монстра.'),
  C(4, 'whaler', 'Китобой', ['barbarian', 'ranger'], 'Китобойный гарпун — тяжёлая тяга.'),
  C(5, 'arcane_rod', 'Мистический жезл', ['wizard', 'warlock', 'sorcerer'], 'Разряд — бьёт цепью.'),
  C(5, 'runic_ballista', 'Рунический болт', ['wizard', 'paladin'], 'Рунический болт — пробивает борт.'),
  C(6, 'holy_cannon', 'Святая пушка', ['cleric', 'paladin'], 'Кара — карает корабль врага.'),
  C(6, 'reliquary_gun', 'Реликварий', ['cleric', 'monk'], 'Залп мощей — оберегает отряд.'),
  C(7, 'chant_mortar', 'Певчая мортира', ['bard'], 'Вдохновляющий залп — бафф отряда.'),
  C(7, 'sonnet_swivel', 'Певчий вертлюг', ['bard', 'rogue'], 'Быстрый вертлюг — держит темп.'),
  C(8, 'bone_trebuchet', 'Костяной требушет', ['warlock'], 'Залп костей — вселяет страх.'),
  C(8, 'plague_caster', 'Чумной залп', ['warlock', 'druid'], 'Чума — урон со временем.'),
  C(9, 'beast_harpoon', 'Звериный гарпун', ['druid', 'barbarian'], 'Рывок зверя — таранный рывок.'),
  C(9, 'thorn_volley', 'Залп шипов', ['druid', 'ranger'], 'Шипы — вызывают кровотечение.'),
  C(10, 'dragon_lance', 'Драконий огнемёт', ['*'], 'Драконье пламя — флагманское орудие.'),
  C(10, 'leviathan_gun', 'Левиафанов залп', ['*'], 'Левиафан — мощнейший залп.'),
];

export const upgradesByKey = Object.fromEntries(UPGRADES.map((u) => [u.key, u]));
export const upgradesForLevel = (level) => UPGRADES.filter((u) => u.level === level);
export const upgradesForBranch = (branch) => UPGRADES.filter((u) => u.branch === branch);

// The six upgrades a level unlocks (two per branch).
export const UPGRADES_PER_LEVEL = upgradesForLevel(1).length;

// A component may be raised up to the ship's own level; the flagship and battery
// each raise every cap by one.
export function componentCap(shipLevel, forged = {}) {
  let cap = Math.min(MAX_SHIP_LEVEL, shipLevel);
  if ((forged.hull_flagship || 0) > 0) cap += 1;
  if ((forged.gun_battery || 0) > 0) cap += 1;
  return Math.min(MAX_SHIP_LEVEL + 2, cap);
}

export function nextLevelInfo(upgrade, rank) {
  const level = rank + 1;
  if (level > MAX_SHIP_LEVEL) return null;
  return { level, cost: costForLevel(upgrade.base, level), minutes: minutesForLevel(level, upgrade.heavy) };
}

// A component is available once its unlock level is reached, and may then be
// forged up to the shared `componentCap`. This builds the reference "fully
// built for its level" ship, so game/naval.js can size enemies against the ship
// a player actually has at each level (and their power curve tracks the tiers).
export function forgedForLevel(shipLevel = 1) {
  const forged = {};
  for (const [key, u] of Object.entries(upgradesByKey)) {
    forged[key] = u.level <= shipLevel ? componentCap(shipLevel, forged) : 0;
  }
  return forged;
}

// A level is complete once all six of its upgrades are forged (rank >= 1); the
// ship may then be raised to the next level.
export function levelComplete(forged = {}, level) {
  return upgradesForLevel(level).every((u) => (forged[u.key] || 0) >= 1);
}

export function canLevelUp(shipLevel, forged = {}) {
  if (shipLevel < 1) return { ok: false, reason: 'Сначала купите корабль.' };
  if (shipLevel >= MAX_SHIP_LEVEL) return { ok: false, reason: 'Корабль уже флагман.' };
  if (!levelComplete(forged, shipLevel)) {
    return { ok: false, reason: `Сначала укрепите все шесть узлов уровня ${shipLevel}.` };
  }
  return { ok: true };
}

// Fold the forged map into flat bonuses. Every effect is additive per rank.
export function bonusesFrom(forged = {}) {
  const b = {
    hullHp: 0, armour: 0, speed: 0, evade: 0, cargo: 0, crew: 0, crewHeal: 0,
    boardResist: 0, floodRecover: 0, floodLimit: 0, escape: 0, helm: 0,
    ram: 0, ramDamage: 0, capAll: 0, partyAura: 0,
    cannonDamage: 0, reliability: 0, reload: 0, magazine: 0, grapeshot: 0,
    riggingDamage: 0, bombs: 0, accuracy: 0, range: 0, barrage: 0, gunSlots: 0,
  };
  for (const [key, rank] of Object.entries(forged)) {
    const u = upgradesByKey[key];
    if (!u || !rank) continue;
    const { stat, add } = u.effect;
    if (stat !== 'classGun' && typeof add === 'number' && stat in b) b[stat] += add * rank;
  }
  b.gunSlots += b.capAll;
  return b;
}

// Which class guns the party can man, given the classes present.
export function mannableGuns(classKeys = []) {
  const set = new Set(classKeys);
  return UPGRADES.filter(
    (u) => u.branch === 'class_guns' && (u.classes.includes('*') || u.classes.some((c) => set.has(c))),
  );
}

// The whole tree as the client draws it, given the stored ship and forged ranks.
export function buildShipTree({ ship, forged = {}, points = 0, classKeys = [], atPort = false, inPortName = null } = {}) {
  const shipLevel = ship?.level || 0;
  const cap = componentCap(shipLevel, forged);
  const bonuses = bonusesFrom(forged);

  const nodes = UPGRADES.map((u) => {
    const rank = forged[u.key] || 0;
    const unlocked = shipLevel >= u.level;
    const next = nextLevelInfo(u, rank);
    const nextCost = next && rank < cap ? next.cost : 0;
    const maxed = rank >= MAX_SHIP_LEVEL;
    const affordable = points >= nextCost;
    const mannable = u.branch !== 'class_guns'
      || u.classes.includes('*')
      || u.classes.some((c) => classKeys.includes(c));
    let reason = null;
    if (!unlocked) reason = `Откроется на уровне корабля ${u.level}.`;
    else if (maxed) reason = 'Полностью улучшено.';
    else if (rank >= cap) reason = 'Нужен более высокий уровень корабля.';
    else if (!affordable) reason = 'Не хватает очков корабля.';
    else if (!atPort) reason = 'Улучшать можно только в порту.';
    else if (!mannable) reason = 'В отряде нет класса для этой пушки.';
    return {
      key: u.key, branch: u.branch, level: u.level, name: u.name, blurb: u.blurb,
      base: u.base, effect: u.effect, classes: u.classes || null,
      rank, maxRank: MAX_SHIP_LEVEL, cap, maxed, unlocked, mannable,
      nextLevel: next ? next.level : null,
      nextCost, nextMinutes: next && rank < cap ? next.minutes : 0,
      canForge: unlocked && !maxed && rank < cap && affordable && atPort && mannable,
      reason,
    };
  });

  const spentPoints = Object.entries(forged)
    .reduce((sum, [key, rank]) => sum + spentOnComponent(upgradesByKey[key]?.base || 0, rank), 0);

  return {
    owned: !!ship,
    atPort,
    inPortName,
    ship: ship ? { level: shipLevel, classKey: ship.class_key, homePortId: ship.home_port_id } : null,
    level: shipLevel,
    maxLevel: MAX_SHIP_LEVEL,
    points,
    spentPoints,
    cap,
    gunSlots: 1 + bonuses.gunSlots,
    price: SHIP_PRICE,
    levelUpCost: shipLevel >= 1 && shipLevel < MAX_SHIP_LEVEL ? levelUpCost(shipLevel) : 0,
    levelUpMinutes: shipLevel >= 1 && shipLevel < MAX_SHIP_LEVEL ? levelUpMinutes(shipLevel) : 0,
    canLevelUp: canLevelUp(shipLevel, forged),
    branches: BRANCHES.map((br) => ({ ...br, nodes: nodes.filter((n) => n.branch === br.key) })),
    nodes,
    bonuses,
  };
}
