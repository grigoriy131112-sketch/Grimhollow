import { getDb } from '../db/index.js';
import {
  createBattle, takePlayerAction, previewAction, serialize, deserialize,
  activeCombatant, aliveCombatants, combatantByKey,
} from '../game/combat.js';
import { getCharacter, applyBattleRewards } from './characters.js';
import { getMonster, getLocation } from './world.js';
import { activeMembers, getMember, markDead, grantMemberXp } from './party.js';

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
  if (!character) throw new Error('Персонаж не найден');

  let monster = monsterId ? getMonster(monsterId) : null;
  let location = locationId ? getLocation(locationId) : null;
  if (!monster && location && location.monsters?.length) {
    monster = location.monsters[Math.floor(Math.random() * location.monsters.length)];
  }
  if (!monster) throw new Error('Для этой встречи нет доступного монстра');

  // The whole active party joins the fight; the leader is 'p1'.
  const allies = activeMembers(character.id).map((m) => getMember(m.id));
  const { state, events } = createBattle({
    player: character,
    allies,
    opponents: [monsterSource(monster)],
  });
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
  const location = battle.location_id ? getLocation(battle.location_id) : null;
  return {
    id: battle.id,
    status: battle.status,
    active: battle.active,
    characterId: battle.character_id,
    locationId: battle.location_id,
    location: location ? { id: location.id, name: location.name, scene: location.scene, biome: location.biome, danger: location.danger } : null,
    round: state.round,
    turnIndex: state.turnIndex,
    activeKey: activeCombatant(state)?.key,
    isPlayerTurn: !state.over && activeCombatant(state)?.side === 'player',
    rewardXp: battle.reward_xp,
    rewardGold: battle.reward_gold,
    result: battle.result ? JSON.parse(battle.result) : null,
    log: battle.log,
    combatants: state.combatants,
  };
}

export function takeTurn(id, action) {
  const db = getDb();
  const battle = getBattle(id);
  if (!battle) throw new Error('Бой не найден');
  if (battle.status !== 'active') throw new Error('Этот бой уже завершён');

  const { state, events } = takePlayerAction(battle.state, action);
  const log = [...battle.log, ...events];

  let status = 'active';
  if (state.over) status = state.winner === 'player' ? 'won' : state.winner === 'enemy' ? 'lost' : 'fled';

  db.prepare("UPDATE battles SET state=?, log=?, status=?, updated_at=datetime('now') WHERE id=?")
    .run(serialize(state), JSON.stringify(log), status, id);

  let rewards = null;
  if (status !== 'active') rewards = settle(battle, state, status);

  return { ...getBattleView(id), events, rewards };
}

// Persist everything that happened in the fight: the leader's resources and XP,
// each companion's HP and XP, and permanent death for anyone who fell.
function settle(battle, state, status) {
  const player = state.combatants.find((c) => c.side === 'player');
  const monster = battle.monster_id ? getMonster(battle.monster_id) : null;
  const won = status === 'won';
  const xpGained = won ? (monster?.xp_reward ?? 20) : 0;
  const goldGained = won ? (monster?.gold_reward ?? 0) : 0;

  const fallen = state.combatants
    .filter((c) => c.side === 'player' && c.hp <= 0 && c.kind === 'ally')
    .map((c) => ({ memberId: c.refId, name: c.name }));
  const fallenLeader = state.combatants.some((c) => c.kind === 'leader' && c.hp <= 0);

  // Companions: update HP/XP, mark the fallen as dead for good.
  const memberResults = [];
  for (const c of state.combatants.filter((x) => x.side === 'player' && x.kind === 'ally')) {
    if (c.hp <= 0) {
      markDead(c.refId);
      memberResults.push({ id: c.refId, name: c.name, hp: 0, dead: true, xpGained });
      continue;
    }
    const result = grantMemberXp(c.refId, { xpGained, hp: c.hp, mana: c.mana, stamina: c.stamina });
    memberResults.push({ id: c.refId, name: c.name, hp: c.hp, dead: false, xpGained, ...result });
  }

  let leaderResult;
  if (fallenLeader) {
    // Defeat is survivable: stagger away with 1 HP. A loss also costs a quarter
    // of the gold, but if the party still won, the leader keeps the rewards.
    const row = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(battle.character_id);
    const goldLost = won ? 0 : Math.floor((row?.gold ?? 0) * DEFEAT_GOLD_PENALTY);
    leaderResult = {
      goldLost,
      ...applyBattleRewards(battle.character_id, {
        hp: 1, mana: 0, stamina: 0, xpGained: won ? xpGained : 0, goldGained: won ? goldGained : -goldLost,
      }),
    };
  } else {
    leaderResult = applyBattleRewards(battle.character_id, {
      hp: player.hp, mana: player.mana, stamina: player.stamina, xpGained, goldGained,
    });
  }

  getDb().prepare('UPDATE battles SET reward_xp=?, reward_gold=?, result=? WHERE id=?')
    .run(xpGained, goldGained, JSON.stringify({ members: memberResults, fallen, goldLost: leaderResult.goldLost ?? 0 }), battle.id);

  return {
    xpGained, goldGained, status,
    leveledUp: leaderResult.leveledUp,
    goldLost: leaderResult.goldLost ?? 0,
    members: memberResults,
    fallen,
  };
}

export function getAbilityPreview(id, abilityId, targetKey) {
  const battle = getBattle(id);
  if (!battle) return null;
  return previewAction(battle.state, abilityId, targetKey);
}

export { combatantByKey, aliveCombatants };
