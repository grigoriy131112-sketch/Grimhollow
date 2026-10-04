import { CLASSES, BASIC_ATTACK, abilitiesForClass, findAbility } from './classes.js';

export const MAX_LEVEL = 15;

// XP needed to reach the next level (index = current level).
export const XP_THRESHOLDS = [
  0, 0, 120, 320, 640, 1100,
  1800, 2800, 4200, 6000, 8300,
  11200, 14800, 19200, 24500, 31000,
];

export function levelFromXp(xp) {
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l += 1) {
    if (xp >= XP_THRESHOLDS[l]) level = l;
  }
  return level;
}

export function xpToNext(xp) {
  const level = levelFromXp(xp);
  return level >= MAX_LEVEL ? null : XP_THRESHOLDS[level + 1] - xp;
}

// Raw class stats grown to the given level (no passives yet).
function grownStats(classKey, level) {
  const klass = CLASSES[classKey];
  if (!klass) throw new Error(`Unknown class: ${classKey}`);
  const lvl = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));
  const steps = lvl - 1;
  const stats = {};
  for (const key of Object.keys(klass.base)) {
    stats[key] = klass.base[key] + klass.growth[key] * steps;
  }
  return stats;
}

// Fold passive ability modifiers into the stats for the character's level.
function applyPassives(classKey, level, stats) {
  const unlocked = abilitiesForClass(classKey, level);
  let hpMul = 1;
  let manaMul = 1;
  let evasionAdd = 0;
  let attackAdd = 0;
  let defenseAdd = 0;
  for (const a of unlocked) {
    if (!a.passive || !a.mods) continue;
    if (a.mods.hpMul) hpMul *= a.mods.hpMul;
    if (a.mods.manaMul) manaMul *= a.mods.manaMul;
    if (a.mods.evasionAdd) evasionAdd += a.mods.evasionAdd;
    if (a.mods.attackAdd) attackAdd += a.mods.attackAdd;
    if (a.mods.defenseAdd) defenseAdd += a.mods.defenseAdd;
  }
  return {
    ...stats,
    hp: Math.round(stats.hp * hpMul),
    mana: Math.round(stats.mana * manaMul),
    evasion: stats.evasion + evasionAdd,
    attack: stats.attack + attackAdd,
    defense: stats.defense + defenseAdd,
  };
}

// Derive everything a battle needs from a stored character row.
export function deriveCharacter(row) {
  if (!row) throw new Error('character is required');
  const level = Math.max(1, Math.min(MAX_LEVEL, Number(row.level) || 1));
  const stats = applyPassives(row.class, level, grownStats(row.class, level));
  const abilities = abilitiesForClass(row.class, level);

  const maxHp = stats.hp;
  const maxMana = stats.mana;
  const maxStamina = stats.stamina;

  return {
    id: row.id,
    name: row.name,
    class: row.class,
    className: CLASSES[row.class].label,
    level,
    xp: Number(row.xp) || 0,
    xpToNext: xpToNext(Number(row.xp) || 0),
    stats: {
      maxHp, maxMana, maxStamina,
      attack: stats.attack,
      defense: stats.defense,
      accuracy: stats.accuracy,
      evasion: stats.evasion,
      speed: stats.speed,
    },
    hp: clampResource(row.hp, maxHp),
    mana: clampResource(row.mana, maxMana),
    stamina: clampResource(row.stamina, maxStamina),
    gold: Number(row.gold) || 0,
    locationId: row.location_id ?? null,
    abilities: abilities.map((a) => ({ ...a })),
    portrait: row.portrait || null,
  };
}

function clampResource(value, max) {
  if (value === null || value === undefined) return max;
  const n = Number(value);
  if (!Number.isFinite(n)) return max;
  return Math.max(0, Math.min(n, max));
}

export function validateCharacterInput(input) {
  const name = String(input?.name || '').trim();
  if (name.length < 2 || name.length > 24) throw new Error('Имя должно быть от 2 до 24 символов');
  if (!CLASSES[input?.class]) throw new Error(`Неизвестный класс: ${input?.class}`);
  return { name, class: input.class, portrait: input.portrait ? String(input.portrait).slice(0, 120) : null };
}

export { BASIC_ATTACK, findAbility, CLASSES };
