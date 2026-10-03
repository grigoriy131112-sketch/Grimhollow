import { BASIC_ATTACK, findAbility, CLASSES } from './classes.js';

// ---------------------------------------------------------------------------
// Grimhollow combat. No dice: hit chance is an honest percentage derived from
// accuracy vs evasion, damage is attack scaled by the ability minus defense.
// A single d100-style roll only decides hit/miss and is never surfaced as dice.
// ---------------------------------------------------------------------------

export const MIN_HIT_CHANCE = 5;
export const MAX_HIT_CHANCE = 95;
export const MANA_REGEN = 3;      // per own turn
export const STAMINA_REGEN = 4;   // per own turn
export const DEFENDING_DEFENSE = 4;

function statOf(c, stat) {
  return c.base ? c.base[stat] : (c.stats?.[stat] ?? c[stat] ?? 0);
}

export function hitChance(attacker, defender, accuracyBonus = 0) {
  const raw = 50 + (statOf(attacker, 'accuracy') + accuracyBonus) - statOf(defender, 'evasion');
  return Math.max(MIN_HIT_CHANCE, Math.min(MAX_HIT_CHANCE, Math.round(raw)));
}

// Total defense including active buffs and a defending stance.
export function effectiveDefense(c) {
  let defense = c.base.defense;
  for (const b of c.buffs) if (b.stat === 'defense') defense += b.amount;
  if (c.defending) defense += DEFENDING_DEFENSE;
  return defense;
}

export function effectiveStat(c, stat) {
  let value = c.base[stat] ?? 0;
  for (const b of c.buffs) if (b.stat === stat) value += b.amount;
  return value;
}

export function damageOf(attacker, defender, power) {
  const raw = effectiveStat(attacker, 'attack') * power;
  return Math.max(1, Math.round(raw - effectiveDefense(defender)));
}

// --- combatant construction -------------------------------------------------

function makeCombatant(source, side, key) {
  return {
    key,
    side,
    refId: source.id ?? null,
    name: source.name,
    portrait: source.portrait ?? null,
    classKey: source.class ?? null,
    level: source.level ?? 1,
    base: {
      attack: source.stats?.attack ?? source.attack ?? 10,
      defense: source.stats?.defense ?? source.defense ?? 5,
      accuracy: source.stats?.accuracy ?? source.accuracy ?? 30,
      evasion: source.stats?.evasion ?? source.evasion ?? 10,
      speed: source.stats?.speed ?? source.speed ?? 8,
    },
    maxHp: source.stats?.maxHp ?? source.maxHp,
    hp: source.hp ?? source.stats?.maxHp ?? source.maxHp,
    maxMana: source.stats?.maxMana ?? source.maxMana ?? 0,
    mana: source.mana ?? source.stats?.maxMana ?? 0,
    maxStamina: source.stats?.maxStamina ?? source.maxStamina ?? 0,
    stamina: source.stamina ?? source.stats?.maxStamina ?? 0,
    abilities: (source.abilities || []).map((a) => a.id),
    ai: source.ai || null,
    cooldowns: {},
    buffs: [],
    dots: [],
    defending: false,
  };
}

export function createBattle({ player, opponents }, rng = Math.random) {
  if (!player) throw new Error('player combatant is required');
  if (!Array.isArray(opponents) || opponents.length === 0) throw new Error('at least one opponent is required');

  const combatants = [makeCombatant(player, 'player', 'p1')];
  opponents.forEach((o, i) => combatants.push(makeCombatant(o, 'enemy', `e${i + 1}`)));

  // Order by speed, descending; ties broken by side (player first), then key.
  const order = [...combatants]
    .sort((a, b) => (b.base.speed - a.base.speed) || (a.side === 'player' ? -1 : 1) || a.key.localeCompare(b.key))
    .map((c) => c.key);

  const state = {
    round: 1, turnIndex: 0, order, combatants, over: false, winner: null, rngSeed: null,
  };
  const events = [{ type: 'info', text: 'Battle begins! Round 1.' }];
  // If an enemy is faster, it acts before the player so control always returns to the player.
  if (activeCombatant(state).side === 'enemy') events.push(...runEnemyTurns(state, rng));
  return { state, events };
}

export function combatantByKey(state, key) {
  return state.combatants.find((c) => c.key === key);
}

export function activeCombatant(state) {
  return combatantByKey(state, state.order[state.turnIndex]);
}

export function aliveCombatants(state, side) {
  return state.combatants.filter((c) => c.hp > 0 && (!side || c.side === side));
}

export function isPlayerTurn(state) {
  return !state.over && activeCombatant(state)?.side === 'player';
}

// --- damage / effects -------------------------------------------------------

function applyDamage(target, amount, events, source) {
  target.hp = Math.max(0, target.hp - amount);
  return target.hp === 0;
}

function checkOver(state) {
  if (aliveCombatants(state, 'player').length === 0) { state.over = true; state.winner = 'enemy'; }
  else if (aliveCombatants(state, 'enemy').length === 0) { state.over = true; state.winner = 'player'; }
  return state.over;
}

function tickBuffs(c) {
  c.buffs = c.buffs.filter((b) => { b.turns -= 1; return b.turns > 0; });
}

function tickDots(state, c, events) {
  const remaining = [];
  for (const dot of c.dots) {
    applyDamage(c, dot.damage, events, null);
    events.push({ type: 'status', text: `${c.name} suffers ${dot.damage} ${dot.name} damage.`, target: c.key });
    dot.turns -= 1;
    if (dot.turns > 0) remaining.push(dot);
  }
  c.dots = remaining;
  if (c.hp === 0) events.push({ type: 'down', text: `${c.name} is defeated!`, target: c.key });
}

function regenResources(c) {
  c.mana = Math.min(c.maxMana, c.mana + MANA_REGEN);
  c.stamina = Math.min(c.maxStamina, c.stamina + STAMINA_REGEN);
}

// --- performing an action ---------------------------------------------------

export function performAction(state, actor, action, rng = Math.random) {
  const events = [];
  if (action?.type === 'flee') {
    state.over = true;
    state.winner = null;
    state.fled = true;
    events.push({ type: 'info', text: `${actor.name} flees the battle.`, actor: actor.key });
    return events;
  }
  const target = combatantByKey(state, action?.targetKey)
    || aliveCombatants(state, actor.side === 'player' ? 'enemy' : 'player')[0];

  const ability = action?.abilityId
    ? findAbility(actor.classKey, action.abilityId) || BASIC_ATTACK
    : BASIC_ATTACK;

  if (ability.id !== 'basic') {
    const cd = actor.cooldowns[ability.id] || 0;
    if (cd > 0) return [{ type: 'info', text: `${ability.name} is on cooldown (${cd}).` }];
    if (ability.resource === 'mana' && actor.mana < ability.cost) return [{ type: 'info', text: 'Not enough mana.' }];
    if (ability.resource === 'stamina' && actor.stamina < ability.cost) return [{ type: 'info', text: 'Not enough stamina.' }];
  }

  actor.defending = false;

  if (ability.kind === 'attack') {
    if (!target || target.hp <= 0) return [{ type: 'info', text: 'No valid target.' }];
    return resolveAttackAction(state, actor, target, ability, rng);
  }
  if (ability.kind === 'heal') {
    const heal = Math.round(actor.maxHp * ability.power);
    actor.hp = Math.min(actor.maxHp, actor.hp + heal);
    events.push({ type: 'heal', text: `${actor.name} uses ${ability.name} and recovers ${heal} HP.`, actor: actor.key });
    if (ability.effect?.type === 'cleanse') { actor.dots = []; events.push({ type: 'info', text: `${actor.name} is cleansed of all afflictions.` }); }
  } else if (ability.kind === 'defend') {
    actor.defending = true;
    events.push({ type: 'info', text: `${actor.name} braces (${ability.name}).`, actor: actor.key });
  } else if (ability.kind === 'buff') {
    applyAbilityEffect(state, actor, actor, ability, events);
  } else {
    events.push({ type: 'info', text: `${actor.name} hesitates.` });
  }

  spendAndCool(state, actor, ability);
  return events;
}

function resolveAttackAction(state, actor, target, ability, rng) {
  const events = [];
  const chance = hitChance(actor, target, ability.accuracyBonus || 0);
  const roll = rng() * 100;
  if (roll >= chance) {
    events.push({ type: 'miss', text: `${actor.name} uses ${ability.name} on ${target.name} and misses (${chance}% chance).`, actor: actor.key, target: target.key });
    spendAndCool(state, actor, ability);
    return events;
  }

  const damage = damageOf(actor, target, ability.power ?? 1);
  const down = applyDamage(target, damage, events, actor);
  events.push({ type: 'hit', text: `${actor.name} uses ${ability.name} on ${target.name} for ${damage} damage.`, actor: actor.key, target: target.key, damage });

  if (ability.effect) {
    if (ability.effect.type === 'leech') {
      const heal = Math.round(damage * ability.effect.ratio);
      actor.hp = Math.min(actor.maxHp, actor.hp + heal);
      events.push({ type: 'heal', text: `${actor.name} drains ${heal} HP.`, actor: actor.key });
    } else if (ability.effect.type === 'dot') {
      target.dots.push({ name: ability.effect.name, damage: ability.effect.damage, turns: ability.effect.turns });
      events.push({ type: 'status', text: `${target.name} is afflicted with ${ability.effect.name}.`, target: target.key });
    } else {
      applyAbilityEffect(state, actor, target, ability, events);
    }
  }

  if (down) events.push({ type: 'down', text: `${target.name} is defeated!`, target: target.key });
  spendAndCool(state, actor, ability);
  return events;
}

function applyAbilityEffect(state, actor, target, ability, events) {
  const eff = ability.effect;
  if (!eff) return;
  if (eff.type === 'restore') {
    const field = eff.resource === 'mana' ? 'mana' : 'stamina';
    const max = field === 'mana' ? actor.maxMana : actor.maxStamina;
    actor[field] = Math.min(max, actor[field] + eff.amount);
    events.push({ type: 'info', text: `${actor.name} restores ${eff.amount} ${field}.`, actor: actor.key });
  } else if (eff.type === 'buff' || eff.type === 'debuff') {
    target.buffs.push({ stat: eff.stat, amount: eff.amount, turns: eff.turns });
    events.push({ type: 'status', text: `${target.name}: ${eff.amount >= 0 ? '+' : ''}${eff.amount} ${eff.stat} for ${eff.turns} turns.`, target: target.key });
  }
}

function spendAndCool(state, actor, ability) {
  if (ability.id === 'basic') return;
  if (ability.resource === 'mana') actor.mana = Math.max(0, actor.mana - ability.cost);
  if (ability.resource === 'stamina') actor.stamina = Math.max(0, actor.stamina - ability.cost);
  if (ability.cooldown > 0) actor.cooldowns[ability.id] = ability.cooldown;
}

// --- turn flow --------------------------------------------------------------

function startTurn(c, events) {
  tickBuffs(c);
  tickDots(null, c, events);
}

function endTurn(c) {
  regenResources(c);
  for (const id of Object.keys(c.cooldowns)) {
    c.cooldowns[id] -= 1;
    if (c.cooldowns[id] <= 0) delete c.cooldowns[id];
  }
}

function advancePointer(state) {
  const size = state.order.length;
  for (let i = 0; i < size; i += 1) {
    state.turnIndex = (state.turnIndex + 1) % size;
    if (state.turnIndex === 0) state.round += 1;
    if (activeCombatant(state).hp > 0) return;
  }
}

export function takePlayerAction(state, action, rng = Math.random) {
  if (state.over) return { state, events: [{ type: 'info', text: 'The battle is already over.' }] };
  if (!isPlayerTurn(state)) return { state, events: [{ type: 'info', text: 'It is not your turn.' }] };

  const actor = activeCombatant(state);
  const events = [];
  startTurn(actor, events);
  if (checkOver(state)) return { state, events };

  events.push(...performAction(state, actor, action, rng));
  endTurn(actor);
  if (checkOver(state)) return { state, events };

  advancePointer(state);
  events.push(...runEnemyTurns(state, rng));
  return { state, events };
}

// Simple AI: heal when hurt, use the strongest affordable ability, else basic attack.
function chooseEnemyAction(state, enemy) {
  const players = aliveCombatants(state, 'player');
  const target = players.sort((a, b) => a.hp - b.hp)[0];
  if (!target) return { targetKey: null };

  const usable = enemy.abilities
    .map((id) => findAbility(enemy.classKey, id))
    .filter(Boolean)
    .filter((a) => !a.passive && (enemy.cooldowns[a.id] || 0) <= 0)
    .filter((a) => (a.resource === 'mana' ? enemy.mana >= a.cost : a.resource === 'stamina' ? enemy.stamina >= a.cost : true));

  const hurt = enemy.hp / enemy.maxHp < 0.4;
  const heal = usable.find((a) => a.kind === 'heal');
  if (hurt && heal) return { abilityId: heal.id, targetKey: enemy.key };

  const attacks = usable.filter((a) => a.kind === 'attack').sort((a, b) => b.power - a.power);
  if (attacks.length && (enemy.mana > enemy.maxMana * 0.3 || enemy.stamina > enemy.maxStamina * 0.3)) {
    return { abilityId: attacks[0].id, targetKey: target.key };
  }
  return { targetKey: target.key };
}

function runEnemyTurns(state, rng) {
  const events = [];
  let guard = 0;
  while (!state.over && activeCombatant(state).side === 'enemy' && guard < 60) {
    guard += 1;
    const enemy = activeCombatant(state);
    startTurn(enemy, events);
    if (checkOver(state)) break;

    events.push(...performAction(state, enemy, chooseEnemyAction(state, enemy), rng));
    endTurn(enemy);
    if (checkOver(state)) break;
    advancePointer(state);
  }
  return events;
}

// Preview the hit chance the player would get against a target.
export function previewAction(state, abilityId, targetKey) {
  const actor = activeCombatant(state);
  const target = combatantByKey(state, targetKey);
  if (!actor || !target) return null;
  const ability = abilityId ? findAbility(actor.classKey, abilityId) || BASIC_ATTACK : BASIC_ATTACK;
  if (ability.kind !== 'attack') return { kind: ability.kind, ability };
  return {
    kind: ability.kind,
    ability,
    chance: hitChance(actor, target, ability.accuracyBonus || 0),
    damage: damageOf(actor, target, ability.power ?? 1),
  };
}

export function serialize(state) { return JSON.stringify(state); }
export function deserialize(json) { return typeof json === 'string' ? JSON.parse(json) : json; }
