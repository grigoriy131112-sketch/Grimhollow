import { getDb } from '../db/index.js';
import {
  createBattle, takePlayerAction, previewAction, serialize, deserialize,
  activeCombatant, aliveCombatants, combatantByKey,
} from '../game/combat.js';
import { getCharacter, applyBattleRewards } from './characters.js';
import { getMonster, getLocation } from './world.js';

// Share of gold dropped when a hero is defeated (they survive with 1 HP).
const DEFEAT_GOLD_PENALTY = 0.25;

// Monsters are statted like characters so they flow through the same engine.
function monsterSource(monster) {
  return {
    id: monster.id,
    name: monster.name,
    portrait: monster.portrait,
    class: monster.class_key,
    level: monster.level,
    stats: {
      maxHp: monster.max_hp,
      maxMana: monster.mana,
      maxStamina: monster.stamina,
      attack: monster.attack,
      defense: monster.defense,
      accuracy: monster.accuracy,
      evasion: monster.evasion,
      speed: monster.speed,
    },
    abilities: [],
    ai: true,
  };
}

export function startBattle({ characterId, monsterId, locationId }) {
  const character = getCharacter(characterId);
  if (!character) throw new Error('Character not found');

  let monster = monsterId ? getMonster(monsterId) : null;
  let location = locationId ? getLocation(locationId) : null;
  if (!monster && location && location.monsters?.length) {
    monster = location.monsters[Math.floor(Math.random() * location.monsters.length)];
  }
  if (!monster) throw new Error('No monster available for this encounter');

  const { state, events } = createBattle({ player: character, opponents: [monsterSource(monster)] });
  const db = getDb();
  const info = db.prepare(
    `INSERT INTO battles (status, character_id, monster_id, location_id, state, log)
     VALUES ('active', ?, ?, ?, ?, ?)`,
  ).run(character.id, monster.id, location?.id ?? null, serialize(state), JSON.stringify(events));
  return getBattleView(info.lastInsertRowid);
}

export function getBattle(id) {
  const row = getDb().prepare('SELECT * FROM battles WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, state: deserialize(row.state), log: deserialize(row.log), active: row.status === 'active' };
}

export function getBattleView(id) {
  const battle = getBattle(id);
  if (!battle) return null;
  const state = battle.state;
  return {
    id: battle.id,
    status: battle.status,
    active: battle.active,
    round: state.round,
    turnIndex: state.turnIndex,
    activeKey: activeCombatant(state)?.key,
    isPlayerTurn: !state.over && activeCombatant(state)?.side === 'player',
    rewardXp: battle.reward_xp,
    rewardGold: battle.reward_gold,
    log: battle.log,
    combatants: state.combatants,
  };
}

export function takeTurn(id, action) {
  const db = getDb();
  const battle = getBattle(id);
  if (!battle) throw new Error('Battle not found');
  if (battle.status !== 'active') throw new Error('This battle has already ended');

  const { state, events } = takePlayerAction(battle.state, action);
  const log = [...battle.log, ...events];

  let status = 'active';
  if (state.over) status = state.winner === 'player' ? 'won' : 'lost';

  db.prepare("UPDATE battles SET state=?, log=?, status=?, updated_at=datetime('now') WHERE id=?")
    .run(serialize(state), JSON.stringify(log), status, id);

  let rewards = null;
  if (status === 'won') rewards = settleVictory(battle, state);
  if (status === 'lost') rewards = settleDefeat(battle, state);

  return { ...getBattleView(id), events, rewards };
}

function settleVictory(battle, state) {
  const player = state.combatants.find((c) => c.side === 'player');
  const monster = battle.monster_id ? getMonster(battle.monster_id) : null;
  const xpGained = monster?.xp_reward ?? 20;
  const goldGained = monster?.gold_reward ?? 0;
  const result = applyBattleRewards(battle.character_id, {
    hp: player.hp, mana: player.mana, stamina: player.stamina, xpGained, goldGained,
  });
  getDb().prepare('UPDATE battles SET reward_xp=?, reward_gold=? WHERE id=?').run(xpGained, goldGained, battle.id);
  return { xpGained, goldGained, ...result };
}

// Defeat is survivable: you stagger away with 1 HP and lose a quarter of your gold.
function settleDefeat(battle, state) {
  const row = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(battle.character_id);
  const goldLost = Math.floor((row?.gold ?? 0) * DEFEAT_GOLD_PENALTY);
  applyBattleRewards(battle.character_id, { hp: 1, mana: 0, stamina: 0, xpGained: 0, goldGained: -goldLost });
  return { goldLost };
}

export function getAbilityPreview(id, abilityId, targetKey) {
  const battle = getBattle(id);
  if (!battle) return null;
  return previewAction(battle.state, abilityId, targetKey);
}

export { combatantByKey, aliveCombatants };
