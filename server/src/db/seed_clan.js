import { getDb, transaction } from './index.js';

// The player's clan (Wave G9). The content is canon: docs/lore/clan.md. This
// file only seeds the catalogue — the four doctrines and the six building types
// — and carries the pure design data the service (services/clan.js) reads.
//
// Stable keys stay Latin (`key`, `type`, `doctrine`, effect `stat`s); everything
// a player reads (`name`, `description`, `blurb`) is Russian.

// --- the two clan resources -------------------------------------------------
//
// Gold is the leader's own purse (services/characters.js) spent as the clan's
// treasury; `names` is the memory currency, kept on the clan row. A ritual or a
// memory quest hands out names; the game lets a hero trade names for gold, which
// is what lets the clan pay for its holdings with both.
export const GOLD_PER_NAME = 25;

// --- levels and ranks -------------------------------------------------------
//
// Levels 1..5: база -> 1 здание -> 2 -> 3 -> флот (docs/lore/clan.md). A
// building's tier may never exceed its gate, so the clan level caps every
// holding: level 1 allows tier 1, level 3 tier 2, level 5 tier 3.
export const CLAN_MAX_LEVEL = 5;
export const MAX_RANK = 3;

export const LEVELS = [
  { level: 1, title: 'База', blurb: 'Одна выбранная стоянка под флагом клана.' },
  { level: 2, title: 'Первое здание', blurb: 'Первый камень поставлен, дело пошло.' },
  { level: 3, title: 'Два здания', blurb: 'Тыл крепнет: склады, кузни и казармы.' },
  { level: 4, title: 'Три здания', blurb: 'Клан стал силой, с которой считаются.' },
  { level: 5, title: 'Флот', blurb: 'Причал готов, и дорога к шпилю открыта.' },
];

// How many distinct holdings a clan of this level may maintain. The last step
// (to 5) is the fleet, so a clan at the top can hold all six types if it pays.
export const BUILDINGS_BY_LEVEL = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 6 };

// The tier a clan level unlocks (a tier may not run ahead of the level).
export const tierGateForLevel = (level) => Math.max(1, Math.min(MAX_RANK, Math.ceil(level / 2)));

// Gold + names to advance the clan itself to the next level. Level 5 is the top.
export const LEVEL_COSTS = {
  1: { gold: 200, names: 5 },
  2: { gold: 400, names: 10 },
  3: { gold: 700, names: 18 },
  4: { gold: 1000, names: 28 },
};

export const costForLevel = (level) => LEVEL_COSTS[level] || null;

// --- the four doctrines (one fork, irreversible) ----------------------------
//
// Each entry carries its idea, its bonuses and its price (docs/lore/clan.md).
// `effects` is the machine-readable part; `unlock` names a progress flag a
// doctrine grants (only the Пастухи open the dark ending).
export const DOCTRINES = [
  {
    key: 'chroniclers',
    name: 'Летописцы',
    idea: 'Записывать имена.',
    description: 'Клан, что ведёт счёт каждому имени. Пока имя записано, человек не пропадёт совсем.',
    bonuses: ['+успех ритуала', '+дипломатия', 'дешевле воскрешение'],
    price: ['медленнее копится золото'],
    effects: { ritualSuccess: 15, diplomacy: 10, reviveDiscount: 0.3, goldRate: -0.15 },
    unlock: null,
  },
  {
    key: 'thaw',
    name: 'Оттепель',
    idea: 'Возвращать воспоминания.',
    description: 'Клан, что растапливает лёд забвения и будит то, что лучше было не будить.',
    bonuses: ['+урон по забвению', 'доступ к «оттаиванию»'],
    price: ['риск безумия спутников'],
    effects: { memoryDamage: 0.2, thaw: true, madnessRisk: 0.1 },
    unlock: 'thaw_unlocked',
  },
  {
    key: 'silent',
    name: 'Молчальники',
    idea: 'Хранить тайны.',
    description: 'Клан, что прячет свои дела и чужие имена. Тишина — лучший щит и лучший товар.',
    bonuses: ['+скрытность', '+торговля', 'скидки у скупщиков'],
    price: ['−мнение храмов'],
    effects: { stealth: 15, trade: 0.1, templeOpinion: -10 },
    unlock: null,
  },
  {
    key: 'shepherds',
    name: 'Пастухи',
    idea: 'Принять забвение.',
    description: 'Клан, что склонился перед шпилем и принял забвение как силу, а не как рану.',
    bonuses: ['доступ к силе шпиля', 'дешёвая тёмная магия'],
    price: ['−мнение Леса и Хора', 'тёмный финал'],
    effects: { spirePower: true, darkMagicDiscount: 0.35, forestOpinion: -15, choirOpinion: -15 },
    unlock: 'dark_ending',
  },
];

export const doctrineByKey = (key) => DOCTRINES.find((d) => d.key === key) || null;

// --- the six building types -------------------------------------------------
//
// `type` is the stable Latin identity; `base` is the rank-1 gold price and
// `namesBase` the rank-1 names price. Rank r costs base * r, so a fully forged
// three-rank holding costs 6 * base (docs/lore/clan.md: "улучшения стоят золото
// + имена"). `link` names the earlier wave the building ties into, `icon` an
// existing CC BY 3.0 SVG from client/public/art (no new art, no rasters).
export const BUILDINGS = [
  {
    key: 'house_of_records',
    name: 'Дом летописей',
    description: 'Хранит имена — записанное не пропадёт. Усиливает ритуал.',
    role: 'хранит имена; усиливает ритуал',
    base: 120, namesBase: 3,
    effects: { ritualSuccess: 10, namesPerRitual: 1 },
    link: 'revival',
    icon: 'ancient_columns',
  },
  {
    key: 'barracks',
    name: 'Казарма',
    description: 'Наёмники и отряды для защиты базы.',
    role: 'наёмники; отряды для защиты базы',
    base: 150, namesBase: 2,
    effects: { mercenaryCap: 2, partyDefense: 0.05 },
    link: 'party',
    icon: 'guarded_tower',
  },
  {
    key: 'warehouse',
    name: 'Склад',
    description: 'Торговые запасы: чем полнее склад, тем выгоднее сделки.',
    role: 'торговые запасы',
    base: 100, namesBase: 2,
    effects: { trade: 0.08 },
    link: 'trade',
    icon: 'camp',
  },
  {
    key: 'forge',
    name: 'Кузня',
    description: 'Снаряжение для спутников — своё железо и свой горн.',
    role: 'снаряжение для спутников',
    base: 140, namesBase: 3,
    effects: { partyAttack: 0.05 },
    link: 'items',
    icon: 'campfire',
  },
  {
    key: 'altar',
    name: 'Алтарь уклона',
    description: 'Даёт активные умения клана — те, что решает уклон.',
    role: 'активные умения клана',
    base: 180, namesBase: 5,
    effects: { activeAbilities: 1 },
    link: 'clan',
    icon: 'obelisk',
  },
  {
    key: 'pier',
    name: 'Причал',
    description: 'Флот: межконтинентальные переходы под флагом клана.',
    role: 'флот; межконтинентальные переходы',
    base: 220, namesBase: 4,
    effects: { fleet: true, crossingDiscount: 0.2 },
    link: 'continents',
    icon: 'harbor',
  },
];

export const buildingByKey = (key) => BUILDINGS.find((b) => b.key === key) || null;

// The price to raise a building to `rank` (rank 1 = first stone). Ranks scale
// with the base so each further tier costs more than the last.
export function buildingCost(type, rank = 1) {
  const b = buildingByKey(type);
  if (!b) return null;
  const r = Math.max(1, Number(rank) || 1);
  return { gold: b.base * r, names: b.namesBase * r };
}

// The price to upgrade a holding that already stands at `tier` to `tier + 1`.
export const upgradeCost = (type, tier) => buildingCost(type, Math.max(1, Number(tier) || 1) + 1);

// --- founding conditions (docs/lore/clan.md) --------------------------------
//
// Chapters 1-6 done, a fleet (a Гавани harbour or Гримхольд as the base) and an
// ally among the four powers. The base is a harbour or Гримхольд.
export const ALLY_POWERS = {
  forest: { name: 'Лес', flag: 'world_woken' },
  archives: { name: 'Архивы', flag: 'north_frozen' },
  houses: { name: 'Дома-витражи', flag: 'memory_bought' },
  captains: { name: 'капитаны', flag: 'war_truth' },
};

export const HARBOUR_BASES = ['Гримхольд', 'Сумеречная гавань', 'Ледяной причал', 'Порт Свободных Капитанов', 'Порт Солёного Стекла'];

// Cyrillic -> Latin so a clan name always yields a Latin key (stable identity).
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

// A latin slug for the clan key. Falls back to a stable prefix when a name has
// no transliterable characters, so a key is always produced.
export function clanKeyFromName(name) {
  const base = String(name || '')
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || 'clan';
}

// --- the seed ---------------------------------------------------------------

// Insert the doctrines and building types that are not in the catalogue yet.
// Safe to run on every boot: it only adds, never overwrites or duplicates.
export function seedClan() {
  const db = getDb();
  const existing = new Set(
    db.prepare('SELECT kind, key FROM clan_catalog').all().map((r) => `${r.kind}:${r.key}`),
  );
  const missing = [
    ...DOCTRINES.filter((d) => !existing.has(`doctrine:${d.key}`)),
    ...BUILDINGS.filter((b) => !existing.has(`building:${b.key}`)),
  ];
  if (!missing.length) return { skipped: true };

  transaction((d) => {
    const ins = d.prepare(
      `INSERT OR IGNORE INTO clan_catalog (kind, key, name, description, data, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    DOCTRINES.forEach((doc, i) => {
      if (existing.has(`doctrine:${doc.key}`)) return;
      ins.run('doctrine', doc.key, doc.name, doc.description, JSON.stringify(doc), i);
    });
    BUILDINGS.forEach((b, i) => {
      if (existing.has(`building:${b.key}`)) return;
      ins.run('building', b.key, b.name, b.description, JSON.stringify(b), i);
    });
  });
  return { added: missing.length };
}

// The catalogue as stored (used by tests and the view builder).
export function listCatalog(kind) {
  return getDb()
    .prepare('SELECT kind, key, name, description, data, sort_order FROM clan_catalog WHERE kind = ? ORDER BY sort_order, id')
    .all(kind)
    .map((r) => {
      let data = {};
      try { data = JSON.parse(r.data); } catch { data = {}; }
      return { kind: r.kind, key: r.key, name: r.name, description: r.description, ...data };
    });
}
