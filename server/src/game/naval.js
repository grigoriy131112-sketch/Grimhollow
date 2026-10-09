// The sea battle (Wave W-SEA). A separate, pure system from the land combat in
// game/combat.js: a fight is between ships (hull + guns) and, in the pirate case,
// the crews aboard them. The hero's ship is bought and upgraded in W-SHIP; the
// bonuses live in game/ship.js and are folded in here. Enemies scale with the
// ship's tier (= its level), so a maxed ship still meets a real fight.
//
// Two kinds:
//   - `pirates`     — boarding: the party fights the crew while the guns pound
//                     the pirate hull. The fight is won by clearing the deck or
//                     sinking the hull.
//   - `sea_monster` — the ship fights alone: only hull and guns, the party is not
//                     in play.
//
// Everything here is pure and diceless: an action shows an honest hit chance and
// a damage estimate, exactly like the land engine. No I/O, so it unit-tests
// directly.

import { hashString } from './travel.js';
import { upgradesByKey, POINTS_PER_PIRATE_WIN, POINTS_PER_MONSTER_WIN } from './ship.js';

export const MIN_HIT = 5;
export const MAX_HIT = 95;
export const SEA_KINDS = ['pirates', 'sea_monster'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v) => Math.round(v);

function rngFrom(seed) {
  let a = hashString(String(seed)) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const between = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// --- hero ship stats ---------------------------------------------------------

// A fresh sloop's bare numbers, before any upgrade. The W-SHIP bonuses are
// fractions (0.06 = +6%) for multiplicative stats and flat adds for HP/crew.
export const BASE_SHIP = {
  hullHp: 200, armour: 0, gunDamage: 12, reload: 3, accuracy: 60, evade: 5,
  speed: 10, crewPower: 0, ram: 0,
};

// Fold the ship tree's bonuses and the party's fighting strength into one side.
// `party` is a compact summary ({ attack, defense, members }) the service builds
// from the leader + active companions, so a bigger party boards better.
export function heroShipSide({ level = 1, bonuses = {}, party = { attack: 0, defense: 0, members: 0 }, name = 'Ваш корабль' } = {}) {
  const gunSlots = 1 + (bonuses.gunSlots || 0);
  const hullHp = BASE_SHIP.hullHp + (bonuses.hullHp || 0);
  const crewHp = 40 + round(party.defense * 0.5) + round((bonuses.crew || 0) * 6);
  const crewAttack = round(party.attack * 0.6 + (bonuses.crew || 0) * 2 + 6);
  return {
    key: 'p1', side: 'player', kind: 'player', name,
    hull: { hp: hullHp, maxHp: hullHp },
    armour: clamp((bonuses.armour || 0), 0, 0.8),
    guns: {
      count: gunSlots,
      damage: round(BASE_SHIP.gunDamage * (1 + (bonuses.cannonDamage || 0))),
      cooldown: Math.max(1, BASE_SHIP.reload - Math.floor((bonuses.reload || 0) * BASE_SHIP.reload)),
      accuracy: clamp(BASE_SHIP.accuracy + (bonuses.accuracy || 0) * 100, 10, 100),
    },
    evade: clamp(BASE_SHIP.evade + (bonuses.evade || 0) * 100, 0, 60),
    speed: BASE_SHIP.speed * (1 + (bonuses.speed || 0)),
    grapeshot: bonuses.grapeshot || 0,
    ram: bonuses.ram || 0,
    ramDamage: bonuses.ramDamage || 0,
    // The crew is only in play for a boarding fight (pirates). `members` is how
    // many bodies the party fields; a bigger party soaks and deals more.
    crew: {
      hp: crewHp, maxHp: crewHp, count: Math.max(1, party.members || 0),
      attack: crewAttack, defense: party.defense || 0,
    },
    cooldowns: {},
    buffs: [],
    defending: false,
  };
}

// --- enemies scale with the tier (= the ship's level) ------------------------

const PIRATE_NAMES = ['Чёрный спрут', 'Ржавый якорь', 'Кровавый шкипер', 'Соль и пепел', 'Вдова шторма', 'Три ворона'];
const MONSTER_NAMES = ['Кракен', 'Левиафан', 'Морской змей', 'Утопленный кит', 'Химера глубин', 'Стеклянный моллюск'];

// Pirate tier: a crew to board with and a hull whose guns answer back.
export function pirateTier(tier = 1) {
  const t = clamp(tier, 1, 10);
  return {
    tier: t,
    name: 'Пираты',
    crewCount: 3 + t,
    crewHp: 26 + t * 12,
    crewAttack: 7 + t * 3,
    crewDefense: 4 + t * 2,
    hullHp: 120 + t * 42,
    gunDamage: 8 + t * 3,
    gunCount: 2 + Math.floor(t / 3),
    accuracy: 55 + t * 2,
    evade: 4 + t,
    speed: 9 + t,
  };
}

// Sea-monster tier: no crew, just a hull and a heavy bite.
export function monsterTier(tier = 1) {
  const t = clamp(tier, 1, 10);
  return {
    tier: t,
    name: 'Морское чудовище',
    hullHp: 180 + t * 56,
    attack: 12 + t * 4,
    defense: 4 + t * 2,
    accuracy: 60 + t * 2,
    evade: 5 + t,
    speed: 8 + t,
    // Every few turns the beast does something worse than a bite.
    abilityEvery: 4,
    abilityName: 'Сокрушающий удар',
  };
}

// The enemy ship/beast as a combat side, given the kind and the tier.
export function enemySide(kind, tier = 1, seed = 'sea') {
  const rng = rngFrom(`${kind}:${tier}:${seed}`);
  if (kind === 'pirates') {
    const p = pirateTier(tier);
    const crewHpEach = p.crewHp;
    const total = crewHpEach * p.crewCount;
    return {
      key: 'e1', side: 'enemy', kind: 'pirate', name: `${p.name} «${pick(rng, PIRATE_NAMES)}»`,
      tier: p.tier,
      hull: { hp: p.hullHp, maxHp: p.hullHp },
      armour: 0,
      guns: { count: p.gunCount, damage: p.gunDamage, cooldown: 3, accuracy: p.accuracy },
      evade: p.evade,
      speed: p.speed,
      crew: { hp: total, maxHp: total, count: p.crewCount, attack: p.crewAttack, defense: p.crewDefense },
      cooldowns: {}, buffs: [], defending: false,
    };
  }
  const m = monsterTier(tier);
  return {
    key: 'e1', side: 'enemy', kind: 'monster', name: `${m.name} «${pick(rng, MONSTER_NAMES)}»`,
    tier: m.tier,
    hull: { hp: m.hullHp, maxHp: m.hullHp },
    armour: 0,
    guns: { count: 0, damage: 0, cooldown: 0, accuracy: 0 },
    attack: m.attack,
    accuracy: m.accuracy,
    evade: m.evade,
    speed: m.speed,
    crew: null,
    abilityEvery: m.abilityEvery,
    abilityName: m.abilityName,
    cooldowns: {}, buffs: [], defending: false,
  };
}

// How many points a won sea battle pays. Pirates are flat (the spec's number);
// a monster pays inside its 6..10 band, scaled by the tier so a deeper beast is
// worth more. The user's flat figures are the tier-1 baseline.
export function seaPoints(kind, tier = 1) {
  if (kind === 'pirates') return POINTS_PER_PIRATE_WIN;
  const { min, max } = POINTS_PER_MONSTER_WIN;
  const t = clamp(tier, 1, 10);
  return min + Math.round(((max - min) * (t - 1)) / 9);
}

// --- the fight ---------------------------------------------------------------

export function sideOf(state, key) { return state.sides.find((s) => s.key === key) || null; }
export function playerSide(state) { return state.sides.find((s) => s.side === 'player'); }
export function enemySideOf(state) { return state.sides.find((s) => s.side === 'enemy'); }

function hullAlive(s) { return s.hull.hp > 0; }
function crewAlive(s) { return !!s.crew && s.crew.hp > 0; }

// A side is out when its hull is wrecked; a boarding fight is also lost when its
// crew is wiped (the deck is taken).
function sideOut(s) {
  if (!hullAlive(s)) return true;
  if (s.kind === 'pirate' && !crewAlive(s)) return true;
  return false;
}

export function seaBattleOver(state) {
  const p = playerSide(state);
  const e = enemySideOf(state);
  if (sideOut(e)) return { over: true, winner: 'player' };
  if (sideOut(p)) return { over: true, winner: 'enemy' };
  return { over: false, winner: null };
}

export function createSeaBattle({ kind, tier = 1, ship, seed = 'sea' } = {}) {
  const safeKind = SEA_KINDS.includes(kind) ? kind : 'pirates';
  const hero = heroShipSide(ship);
  const foe = enemySide(safeKind, tier, seed);
  const sides = [hero, foe];
  const order = [...sides]
    .sort((a, b) => (b.speed - a.speed) || (a.side === 'player' ? -1 : 1))
    .map((s) => s.key);
  const state = { kind: safeKind, tier, sides, order, turnIndex: 0, round: 1, over: false, winner: null, log: [] };
  // A faster enemy opens the fight before the player can act, exactly like the
  // land engine. Resolve those turns now so the returned state either awaits the
  // player or is already decided -- never "active but not the player's turn".
  runUntilPlayer(state, Math.random);
  return state;
}

// Run enemy turns until it is the player's turn again or the fight is over.
function runUntilPlayer(state, rng) {
  let guard = 0;
  while (!state.over && activeSideKey(state) !== playerSide(state).key && guard < 20) {
    const actor = sideOf(state, activeSideKey(state));
    const target = actor.side === 'enemy' ? playerSide(state) : enemySideOf(state);
    const events = [];
    applyAction(state, actor, target, enemyAction(state, actor, target), rng, events);
    advanceTurn(state, events);
    guard += 1;
    const done = seaBattleOver(state);
    if (done.over) { state.over = true; state.winner = done.winner; }
  }
}

// Honest hit chance, same shape as the land engine.
export function seaHitChance(attacker, defender, bonus = 0) {
  const acc = attacker.guns?.accuracy ?? attacker.accuracy ?? 50;
  return clamp(round(50 + (acc - 50) + (defender.evade || 0) * -1 + bonus), MIN_HIT, MAX_HIT);
}

function seaStatOf(s) {
  return { attack: s.guns?.damage || s.attack || 0 };
}

export function previewAction(state, action) {
  const p = playerSide(state);
  const e = enemySideOf(state);
  if (state.over) return null;
  if (action.type === 'broadside') {
    const chance = seaHitChance(p, e);
    const per = Math.max(1, round(seaStatOf(p).attack * (1 - e.armour)));
    return { type: 'broadside', hitChance: chance, damage: per * p.guns.count, target: e.name };
  }
  if (action.type === 'board') {
    if (!crewAlive(p) || !crewAlive(e)) return { type: 'board', hitChance: 0, damage: 0, disabled: true, reason: 'Врага не с кем взять на абордаж.' };
    const chance = clamp(round(50 + (p.crew.attack - e.crew.defense) * 2), MIN_HIT, MAX_HIT);
    const dmg = Math.max(1, round((p.crew.count * (p.crew.attack - e.crew.defense)) / 2 + 4));
    return { type: 'board', hitChance: chance, damage: dmg, target: 'команда' };
  }
  if (action.type === 'ram') {
    if (!p.ram) return { type: 'ram', hitChance: 0, damage: 0, disabled: true, reason: 'Таран не установлен.' };
    return { type: 'ram', hitChance: seaHitChance(p, e, 10), damage: round(p.ram * (1 + p.ramDamage)), target: e.name };
  }
  if (action.type === 'ability') {
    const gun = upgradesByKey[action.abilityId];
    if (!gun || gun.branch !== 'class_guns') return { type: 'ability', hitChance: 0, damage: 0, disabled: true, reason: 'Нет такого орудия.' };
    const mult = gunAbilityMultiplier(gun.key);
    return {
      type: 'ability', abilityId: gun.key, name: gun.name,
      hitChance: seaHitChance(p, e, gunAbilityAccuracy(gun.key)),
      damage: Math.max(1, round((seaStatOf(p).attack + 4) * mult * p.guns.count)),
      target: e.name,
    };
  }
  return null;
}

// Class guns differ in punch and accuracy rather than in special code paths, so
// the twenty abilities stay honest and balanced without bespoke logic for each.
const GUN_ABILITY = {
  culverin: { mult: 1.4, acc: 10 }, falconet: { mult: 0.9, acc: 15 },
  carronade: { mult: 1.6, acc: 0 }, musketoon: { mult: 1.1, acc: 5 },
  mortar: { mult: 1.3, acc: -5 }, bombard: { mult: 1.7, acc: -10 },
  harpoon: { mult: 1.2, acc: 5 }, whaler: { mult: 1.5, acc: 0 },
  arcane_rod: { mult: 1.4, acc: 5 }, runic_ballista: { mult: 1.5, acc: 0 },
  holy_cannon: { mult: 1.4, acc: 5 }, reliquary_gun: { mult: 1.2, acc: 5 },
  chant_mortar: { mult: 1.1, acc: 10 }, sonnet_swivel: { mult: 1.0, acc: 15 },
  bone_trebuchet: { mult: 1.5, acc: -5 }, plague_caster: { mult: 1.3, acc: 0 },
  beast_harpoon: { mult: 1.5, acc: 5 }, thorn_volley: { mult: 1.2, acc: 10 },
  dragon_lance: { mult: 2.0, acc: 5 }, leviathan_gun: { mult: 2.3, acc: 0 },
};
export function gunAbilityMultiplier(key) { return GUN_ABILITY[key]?.mult ?? 1.2; }
export function gunAbilityAccuracy(key) { return GUN_ABILITY[key]?.acc ?? 5; }

// Apply one player action, then let the enemy answer. Returns the next state and
// the events of the whole exchange (player action + enemy reply).
export function takeSeaAction(state, action, rng = Math.random) {
  if (state.over) throw new Error('Бой уже кончился');
  const p = playerSide(state);
  const e = enemySideOf(state);
  if (p.key !== activeSideKey(state)) throw new Error('Сейчас не ваш ход');

  const events = [];
  applyAction(state, p, e, action, rng, events);
  advanceTurn(state, events);
  // The enemy answers until it is the player's turn again (or the fight ends).
  runUntilPlayer(state, rng);
  return { state, events };
}

function activeSideKey(state) {
  return state.order[state.turnIndex % state.order.length];
}

function advanceTurn(state, events) {
  state.turnIndex += 1;
  if (state.turnIndex % state.order.length === 0) {
    state.round += 1;
    events.push({ type: 'round', round: state.round });
  }
}

function cooldownTick(s) {
  for (const k of Object.keys(s.cooldowns)) s.cooldowns[k] = Math.max(0, s.cooldowns[k] - 1);
}

function applyAction(state, actor, target, action, rng, events) {
  cooldownTick(actor);
  if (!target || sideOut(target)) return;
  const type = action.type;

  // A sea monster has no guns and no ram: every attack is a bite (its `ram` action
  // is the occasional heavier strike).
  if (actor.kind === 'monster') {
    const heavy = action.type === 'ram' && actor.abilityEvery && state.round % actor.abilityEvery === 0;
    applyMonsterBite(state, actor, target, rng, events, heavy);
    return;
  }

  if (type === 'broadside' || type === 'ability') {
    const gun = type === 'ability' ? upgradesByKey[action.abilityId] : null;
    const cdKey = 'broadside';
    if ((actor.cooldowns[cdKey] || 0) > 0) { events.push({ type: 'wait', side: actor.key, text: 'Орудия перезаряжаются.' }); return; }
    const mult = gun ? gunAbilityMultiplier(gun.key) : 1;
    const accBonus = gun ? gunAbilityAccuracy(gun.key) : 0;
    const chance = seaHitChance(actor, target, accBonus);
    const per = Math.max(1, round(((actor.guns?.damage || actor.attack || 0) * mult) * (1 - target.armour)));
    const total = per * (actor.guns?.count || 1);
    if (rng() * 100 < chance) {
      target.hull.hp = Math.max(0, target.hull.hp - total);
      events.push({ type: 'hit', side: actor.key, target: target.key, amount: total, gun: gun?.key || null, text: gun ? `${gun.name}: залп на ${total}.` : `Залп на ${total}.` });
    } else {
      events.push({ type: 'miss', side: actor.key, target: target.key, text: 'Залп ушёл в воду.' });
    }
    actor.cooldowns[cdKey] = actor.guns?.cooldown || 2;
    return;
  }

  if (type === 'board') {
    if (!crewAlive(actor) || !crewAlive(target)) { events.push({ type: 'wait', side: actor.key, text: 'Абордаж невозможен.' }); return; }
    const chance = clamp(round(50 + (actor.crew.attack - target.crew.defense) * 2), MIN_HIT, MAX_HIT);
    const dmg = Math.max(1, round((actor.crew.count * (actor.crew.attack - target.crew.defense)) / 2 + 4));
    if (rng() * 100 < chance) {
      target.crew.hp = Math.max(0, target.crew.hp - dmg);
      events.push({ type: 'hit', side: actor.key, target: target.key, amount: dmg, crew: true, text: `Абордаж: команда теряет ${dmg}.` });
    } else {
      events.push({ type: 'miss', side: actor.key, target: target.key, text: 'Абордаж отбит.' });
    }
    return;
  }

  if (type === 'ram') {
    if (!actor.ram) { events.push({ type: 'wait', side: actor.key, text: 'Нет тарана.' }); return; }
    const chance = seaHitChance(actor, target, 10);
    const dmg = round(actor.ram * (1 + actor.ramDamage));
    if (rng() * 100 < chance) {
      target.hull.hp = Math.max(0, target.hull.hp - dmg);
      events.push({ type: 'hit', side: actor.key, target: target.key, amount: dmg, ram: true, text: `Таран на ${dmg}.` });
    } else {
      events.push({ type: 'miss', side: actor.key, target: target.key, text: 'Таран не достал.' });
    }
    return;
  }

  if (type === 'repel') {
    actor.defending = true;
    events.push({ type: 'defend', side: actor.key, text: 'Команда готовится отбить абордаж.' });
    return;
  }
}

// The enemy's simple AI: board when its crew is strong, otherwise fire; the
// monster just bites (a heavy hit on the hull) and occasionally uses its ability.
function enemyAction(state, foe, hero) {
  if (foe.kind === 'monster') {
    const useAbility = foe.abilityEvery && state.round % foe.abilityEvery === 0;
    return { type: useAbility ? 'ram' : 'broadside', _monster: true };
  }
  if (crewAlive(foe) && crewAlive(hero) && (foe.crew.attack > (foe.guns?.damage || 0))) {
    return { type: 'board' };
  }
  return { type: 'broadside' };
}

// A monster "broadside" is a bite on the hero's hull, not a cannonade. The
// occasional heavy strike does more and can shake the crew.
function applyMonsterBite(state, foe, hero, rng, events, heavy = false) {
  const chance = clamp(round(50 + (foe.accuracy - 50) - (hero.evade || 0)), MIN_HIT, MAX_HIT);
  const mult = heavy ? 1.8 : 1;
  const dmg = Math.max(1, round(foe.attack * mult * (1 - hero.armour)));
  if (rng() * 100 < chance) {
    hero.hull.hp = Math.max(0, hero.hull.hp - dmg);
    events.push({
      type: 'hit', side: foe.key, target: hero.key, amount: dmg, heavy,
      text: heavy ? `${foe.name}: ${foe.abilityName} — корпус теряет ${dmg}!` : `${foe.name} бьёт корпус на ${dmg}.`,
    });
  } else {
    events.push({ type: 'miss', side: foe.key, target: hero.key, text: 'Чудовище промахнулось.' });
  }
}

// --- Fortune islands ---------------------------------------------------------

// A huge, non-repeating pool built from three word lists, so a voyage's islands
// are stable for its seed and never repeat within it.
export const ISLAND_ADJ = [
  'Ржавый', 'Стеклянный', 'Костяной', 'Туманный', 'Солёный', 'Гнилой',
  'Кровавый', 'Молчаливый', 'Утопший', 'Пепельный', 'Ледяной', 'Зелёный',
];
export const ISLAND_NOUN = [
  'берег', 'мыс', 'атолл', 'утес', 'остров', 'клык',
  'череп', 'перст', 'сад', 'маяк', 'трон', 'гроб',
];
export const ISLAND_FEATURES = [
  'где поют утопленники', 'где растёт чёрный тростник', 'где спят обломки флота',
  'где ходят безглазые птицы', 'где земля тёплая от крови', 'где туман не рассеивается',
  'где соль выбелила кости', 'где горит вечный костёр',
];

export const ISLAND_POOL_SIZE = ISLAND_ADJ.length * ISLAND_NOUN.length * ISLAND_FEATURES.length;

// Deterministically draw `count` distinct islands from the pool. A voyage's seed
// fixes both which and how many, and the walk never revisits an index, so no two
// islands on one voyage are the same.
export function rollIslands(seed = 'voyage', count = between(rngFrom(seed), 0, 2)) {
  const total = ISLAND_POOL_SIZE;
  const rng = rngFrom(`isles:${seed}`);
  const chosen = [];
  const seen = new Set();
  let guard = 0;
  while (chosen.length < count && guard < total) {
    const i = Math.floor(rng() * total);
    guard += 1;
    if (seen.has(i)) continue;
    seen.add(i);
    const adj = ISLAND_ADJ[i % ISLAND_ADJ.length];
    const noun = ISLAND_NOUN[Math.floor(i / ISLAND_ADJ.length) % ISLAND_NOUN.length];
    const feat = ISLAND_FEATURES[Math.floor(i / (ISLAND_ADJ.length * ISLAND_NOUN.length)) % ISLAND_FEATURES.length];
    chosen.push({
      id: `isle_${i}`,
      name: `${adj} ${noun}`,
      description: `Остров, ${feat}.`,
    });
  }
  return chosen;
}

// --- papers: the ship's journal (event log + auto lore notes) ----------------

// A detail, once learned, writes itself into the papers. Keyed by the unlock
// flag a quest or event grants (services/quests.js `addUnlock`).
export const LORE_NOTES = {
  drowned_road: 'Утонувшая дорога: под водой лежит старый тракт, и по нему ещё ходят.',
  chapel_gate: 'Врата часовни отпирает Ключ Пастыря — но только из самой Затонувшей часовни.',
  ash_war_truth: 'Пепельная война: пепел помнит всё, что здесь сожгли.',
  spire_approach: 'Чёрный шпиль открывается лишь тому, кто узнал правду о войне.',
};
export function loreNotesFrom(unlocks = []) {
  return unlocks.map((u) => LORE_NOTES[u.flag] || LORE_NOTES[u] || null).filter(Boolean);
}

// --- voyage roll -------------------------------------------------------------

// What a voyage meets, derived from the seed so a reload cannot reroll it. Zero
// to two stops; a sharing of pirates / a sea monster / a Fortune island.
export function rollVoyage({ seed = 'voyage', tier = 1, danger = 1 } = {}) {
  const rng = rngFrom(`voyage:${seed}`);
  const stops = [];
  const rolls = between(rng, 0, 2);
  for (let i = 0; i < rolls; i += 1) {
    const r = rng();
    if (r < 0.4) stops.push({ kind: 'pirates', tier, title: 'Пираты на горизонте' });
    else if (r < 0.7) stops.push({ kind: 'sea_monster', tier, title: 'Из глубины поднимается тень' });
    else stops.push({ kind: 'island', island: rollIslands(`${seed}:${i}`, 1)[0], title: 'Неизвестный остров' });
  }
  return { seed, tier, stops };
}
