// Random encounters and loot generation (Wave G10). Pure rules: no I/O and no
// database. Given a location's danger and biome (plus a seed) it picks a
// monster from the expanded bestiary and rolls the spoils, always the same way
// for the same seed, so it can be unit-tested and replayed across a reload.
//
// The content comes from docs/lore/bestiary.md: a monster is what is left of
// the erased. Levels 1-3 are household horror, 4-8 trades and titles, 9-15
// abstractions and gods.

import { hashString } from './travel.js';

// The additional bestiary (docs/lore/bestiary.md, continuation of seed.js).
// `biomes` is the affinity used to place a monster in the world, `weight` makes
// the rank and file common and the titled (level 9+) rare, and the danger band
// is derived from the level (see bandForDanger), so it cannot drift.
export const BESTIARY = [
  { name: 'Крысиный пастырь', level: 2, classKey: 'rogue', weight: 4, biomes: ['marsh', 'waste'], description: 'Человек, что пас крыс и в конце стал одной из них.' },
  { name: 'Смоляной вдовец', level: 3, classKey: 'fighter', weight: 3, biomes: ['waste', 'forest'], description: 'Муж, которого смола забрала вместо жены — и он не спорил.' },
  { name: 'Плакальщик-переписчик', level: 4, classKey: 'wizard', weight: 3, biomes: ['forest', 'coast'], description: 'Писец, что записывает чужие слёзы вместо слов.' },
  { name: 'Соляной утопленник', level: 4, classKey: 'fighter', weight: 3, biomes: ['marsh', 'coast'], description: 'Вышел из топи и так и не заметил, что уже утонул.' },
  { name: 'Костяной батрак', level: 5, classKey: 'fighter', weight: 3, biomes: ['bonefield', 'waste'], description: 'Работник, что всё ещё ждёт плату за давно конченный день.' },
  { name: 'Прядильщица жил', level: 5, classKey: 'warlock', weight: 3, biomes: ['marsh', 'forest'], description: 'Ткёт жилы в чужое тело, чтобы её полотно не остыло.' },
  { name: 'Хранитель сальных книг', level: 6, classKey: 'cleric', weight: 2, biomes: ['bonefield', 'waste'], description: 'Сторож имён: пока он держит книгу, тебя ещё можно вспомнить.' },
  { name: 'Обгоревший глашатай', level: 6, classKey: 'bard', weight: 2, biomes: ['waste', 'forest'], description: 'Кричит указ, которого больше никто не помнит.' },
  { name: 'Стеклоглазый чтец', level: 7, classKey: 'wizard', weight: 2, biomes: ['waste', 'bonefield'], description: 'Читает твою память как витраж, не спрашивая позволения.' },
  { name: 'Морозный архивариус', level: 7, classKey: 'wizard', weight: 2, biomes: ['waste', 'coast'], description: 'Вмораживает тебя в лёд — так воспоминание целее.' },
  { name: 'Ржавый дозорный', level: 8, classKey: 'fighter', weight: 2, biomes: ['bonefield', 'waste'], description: 'Доспех, что забыл, кого охранял, но пост не покинул.' },
  { name: 'Пожирательница лиц', level: 8, classKey: 'rogue', weight: 2, biomes: ['bonefield', 'forest'], description: 'Носит чужие лица как маски, чтобы её хоть кто-то узнал.' },
  { name: 'Тихий хор', level: 9, classKey: 'bard', weight: 1, biomes: ['marsh', 'bonefield'], description: 'Поёт без рта; те, кто слушает, забывают свои имена.' },
  { name: 'Ледяная невеста', level: 9, classKey: 'sorcerer', weight: 1, biomes: ['coast', 'waste'], description: 'Ждёт жениха, что давно оттаял и ушёл.' },
  { name: 'Стеклянный ростовщик', level: 10, classKey: 'warlock', weight: 1, biomes: ['waste', 'bonefield'], description: 'Берёт память в залог и никогда не отдаёт долг.' },
  { name: 'Костяной мореход', level: 10, classKey: 'ranger', weight: 1, biomes: ['coast', 'marsh'], description: 'Капитан без команды и без берега, что всё идёт и идёт.' },
  { name: 'Длань Оттепели', level: 11, classKey: 'druid', weight: 1, biomes: ['marsh', 'forest'], description: 'Выпускает воспоминания силой, как воду из прорванной плотины.' },
  { name: 'Архивариус витражей', level: 12, classKey: 'wizard', weight: 1, biomes: ['bonefield', 'waste'], description: 'Хранит историю в стекле: разбей витраж — и правда рассыплется.' },
  { name: 'Голодный пастырь', level: 13, classKey: 'cleric', weight: 1, biomes: ['waste', 'bonefield'], description: 'Пасёт не мёртвых, а живых — и стадо его всё растёт.' },
  { name: 'Венец из мух', level: 14, classKey: 'warlock', weight: 1, biomes: ['waste', 'bonefield'], description: 'То, что осталось от короны Полого короля, когда короля забыли.' },
  { name: 'Пустой король (молодой)', level: 15, classKey: 'fighter', weight: 1, biomes: ['waste', 'bonefield'], description: 'Тот же Полый король, но ещё помнит себя — и это хуже всего.' },
];

// Danger bands, straight from docs/lore/bestiary.md: danger 1-2 gives levels
// 1-3, 3-4 gives 4-8, 5+ gives 9-15.
export const DANGER_BANDS = [
  { min: 1, max: 2, levelMin: 1, levelMax: 3, label: 'бытовой ужас' },
  { min: 3, max: 4, levelMin: 4, levelMax: 8, label: 'профессии и титулы' },
  { min: 5, max: 99, levelMin: 9, levelMax: 15, label: 'абстракции и боги' },
];

// A titled monster (level 9+) is a named horror, not part of the retinue, and
// no more than one may appear at a time. Within a pool that mixes ranks, a
// titled monster is made this much rarer than the retinue.
export const TITLED_LEVEL = 9;
export const MAX_TITLED = 1;
export const TITLED_WEIGHT = 0.25;

// The resource a rank-and-file corpse leaves behind, plus the shard of memory a
// titled one may guard (a quest resource for G8/G11).
export const LOOT_RESOURCES = [
  { key: 'bone_shard', name: 'Костяной обломок', weight: 3 },
  { key: 'salt_lump', name: 'Соляной ком', weight: 3 },
  { key: 'ash_flake', name: 'Хлопья пепла', weight: 2 },
  { key: 'grave_moss', name: 'Могильный мох', weight: 2 },
];
export const MEMORY_FRAGMENT = 'memory_fragment';
export const MEMORY_FRAGMENT_NAME = 'Фрагмент памяти';
const MEMORY_FRAGMENT_CHANCE = 0.35;

// A small bump for the classes that live by the purse or the ledger.
const LOOT_CLASS_BONUS = { rogue: 0.2, ranger: 0.15, bard: 0.1, warlock: 0.1 };

// Per-class multipliers over the level curve: a fighter is tougher and slower,
// a rogue is quicker and more evasive, a wizard carries mana, and so on. Kept
// here (not in the seed) so the whole bestiary is retuned in one pure place.
const ROLE_STATS = {
  fighter: { hp: 1.1, atk: 1.05, def: 1.15, acc: 1.0, ev: 0.85, spd: 0.9, stamina: 12 },
  wizard: { hp: 0.8, atk: 0.9, def: 0.85, acc: 1.1, ev: 1.0, spd: 1.0, mana: 16 },
  rogue: { hp: 0.85, atk: 1.0, def: 0.8, acc: 1.15, ev: 1.3, spd: 1.2, stamina: 10 },
  cleric: { hp: 0.95, atk: 0.9, def: 1.1, acc: 1.05, ev: 0.9, spd: 0.95, mana: 13 },
  barbarian: { hp: 1.2, atk: 1.15, def: 0.9, acc: 0.95, ev: 0.85, spd: 1.0, stamina: 14 },
  bard: { hp: 0.85, atk: 0.9, def: 0.85, acc: 1.1, ev: 1.15, spd: 1.15, mana: 12 },
  druid: { hp: 0.9, atk: 0.95, def: 1.0, acc: 1.05, ev: 1.0, spd: 1.0, mana: 14 },
  monk: { hp: 0.95, atk: 1.1, def: 0.9, acc: 1.15, ev: 1.25, spd: 1.2, stamina: 12 },
  paladin: { hp: 1.1, atk: 1.0, def: 1.2, acc: 1.0, ev: 0.85, spd: 0.9, mana: 10 },
  ranger: { hp: 0.9, atk: 1.05, def: 0.85, acc: 1.2, ev: 1.15, spd: 1.15, stamina: 10 },
  sorcerer: { hp: 0.8, atk: 1.15, def: 0.8, acc: 1.1, ev: 1.05, spd: 1.05, mana: 17 },
  warlock: { hp: 0.85, atk: 1.0, def: 0.9, acc: 1.1, ev: 1.05, spd: 1.0, mana: 15 },
};

// A monster's combat row, derived from its level and class profile. Combat math
// is untouched: this only fills the same stats every monster already has.
export function monsterStats(level, classKey) {
  const l = Math.max(1, Math.min(15, Number(level) || 1));
  const r = ROLE_STATS[classKey] || ROLE_STATS.fighter;
  const n = (v) => Math.max(1, Math.round(v));
  return {
    max_hp: n((18 + l * l * 3.1) * r.hp),
    attack: n((6 + l * 4.6) * r.atk),
    defense: n((2 + l * 2.4) * r.def),
    accuracy: n((20 + l * 2.6) * r.acc),
    evasion: n((5 + l * 1.3) * r.ev),
    speed: n((6 + l * 0.75) * r.spd),
    mana: r.mana ? n(l * r.mana) : 0,
    stamina: r.stamina ? n(l * r.stamina) : 0,
  };
}

// Reward curve for the new bestiary, close to the existing rows' pacing.
export function monsterRewards(level) {
  const l = Math.max(1, Math.min(15, Number(level) || 1));
  return {
    xp_reward: Math.round(13 * l * l),
    gold_reward: Math.max(3, Math.round(1.8 * l ** 2.5)),
  };
}

// The complete DB row for one bestiary entry, so the seed and the encounter
// service build monsters exactly the same way.
export function monsterRow(entry) {
  return {
    name: entry.name,
    description: entry.description,
    level: entry.level,
    class_key: entry.classKey,
    ...monsterStats(entry.level, entry.classKey),
    ...monsterRewards(entry.level),
  };
}

// The danger band a location's rating falls into. Unknown ratings are treated
// as the calmest band so a missing value never spawns a god.
export function bandForDanger(danger = 1) {
  const d = Math.max(1, Number(danger) || 1);
  return DANGER_BANDS.find((b) => d >= b.min && d <= b.max) || DANGER_BANDS[DANGER_BANDS.length - 1];
}

export function isTitled(monster) {
  return !!monster && monster.level >= TITLED_LEVEL;
}

// The pool an encounter is drawn from: the band's monsters that haunt this
// biome. A biome with nothing in the band falls back to the whole band, so a
// dangerous place always has something to meet rather than an empty road.
export function poolFor({ danger = 1, biome = null, bestiary = BESTIARY } = {}) {
  const band = bandForDanger(danger);
  const inBand = bestiary.filter((m) => m.level >= band.levelMin && m.level <= band.levelMax);
  const byBiome = biome ? inBand.filter((m) => (m.biomes || []).includes(biome)) : inBand;
  return byBiome.length ? byBiome : inBand;
}

// Pick one encounter from the pool, deterministically from the seed. Titled
// monsters carry a low weight, so they stay rare; a single pick can never
// exceed MAX_TITLED.
export function rollEncounter({ danger = 1, biome = null, seed = '', bestiary = BESTIARY } = {}) {
  const pool = poolFor({ danger, biome, bestiary });
  if (!pool.length) return null;
  const rng = rngFrom((hashString(`encounter:${seed}:${danger}:${biome || '-'}`) ^ 0x9e3779b9) >>> 0);
  const monster = weightedPick(pool, rng);
  return { monster: { ...monster }, titled: isTitled(monster), band: { ...bandForDanger(danger) } };
}

// A monster's spawn weight: its bestiary weight, halved for a titled horror so
// the retinue is what a party meets most of the time.
export function encounterWeight(monster) {
  return isTitled(monster) ? Math.max(1, Math.round(monster.weight * TITLED_WEIGHT)) : monster.weight;
}

// --- loot ------------------------------------------------------------------

// Gold a corpse of this level yields before variance, class and title bonuses.
export function goldForLevel(level = 1) {
  const l = Math.max(1, Math.min(15, Number(level) || 1));
  return Math.round(4 + l * l * 1.6);
}

// Roll the spoils: gold by level plus, sometimes, a resource. A titled monster
// has a chance to guard a fragment of memory. Deterministic from the seed.
export function rollLoot({ level = 1, titled = false, classKey = null, seed = '' } = {}) {
  const l = Math.max(1, Math.min(15, Number(level) || 1));
  const rng = rngFrom((hashString(`loot:${seed}:${l}:${titled ? 't' : 'r'}:${classKey || '-'}`) ^ 0x9e3779b9) >>> 0);
  const variance = 0.85 + rng() * 0.3;
  const classBonus = 1 + (LOOT_CLASS_BONUS[classKey] || 0);
  const titledBonus = titled ? 1.5 : 1;
  const gold = Math.max(1, Math.round(goldForLevel(l) * variance * classBonus * titledBonus));

  const items = [];
  const resourceChance = titled ? 0.9 : 0.5;
  if (rng() < resourceChance) {
    if (titled && rng() < MEMORY_FRAGMENT_CHANCE) {
      items.push({ key: MEMORY_FRAGMENT, qty: 1, name: MEMORY_FRAGMENT_NAME });
    } else {
      const res = weightedPick(LOOT_RESOURCES, rng);
      items.push({ key: res.key, qty: 1, name: res.name });
    }
  }
  return { gold, items, memoryFragment: items.some((i) => i.key === MEMORY_FRAGMENT) };
}

// --- helpers ----------------------------------------------------------------

function weightedPick(list, rng) {
  const total = list.reduce((s, e) => s + encounterWeight(e), 0);
  let roll = rng() * total;
  for (const e of list) {
    roll -= encounterWeight(e);
    if (roll <= 0) return e;
  }
  return list[list.length - 1];
}

// Same tiny PRNG the road and the crossings use, kept local so this module
// stays free of I/O.
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
