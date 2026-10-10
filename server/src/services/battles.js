import { getDb } from '../db/index.js';
import {
  createBattle, takePlayerAction, previewAction, serialize, deserialize,
  activeCombatant, aliveCombatants, combatantByKey,
} from '../game/combat.js';
import { getCharacter, applyBattleRewards, getPartyBonuses } from './characters.js';
import { getMonster, getLocation } from './world.js';
import { activeMembers, getMember, markDead, grantMemberXp, reviveMember, applyRevivalRelations } from './party.js';
import { grantItem, activeModifiers } from './items.js';
import { getMeters } from './survival.js';
import { revivalDelta, WITNESS_DELTA } from '../game/revival.js';
import { needModifiersFromMeters } from '../game/survival.js';
import { RITUAL_ITEM } from '../game/items.js';
import { awardPartyPoints } from './upgrades.js';
import { applyBonusesToSource, POINTS_PER_WIN, POINTS_PER_LEVEL } from '../game/party_upgrades.js';
import { grantNames } from './clan.js';
import { NAMES_PER_RITUAL } from '../db/seed_clan.js';
import { advanceQuest } from './quests.js';
import { rollLoot, TITLED_LEVEL } from '../game/randomizer.js';

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

export function startBattle({ characterId, monsterId, locationId, kind = 'normal', reviveMember = null, opponent = null, loot = null }) {
  const character = getCharacter(characterId);
  if (!character) throw new Error('Персонаж не найден');
  if (character.fate === 'dead') throw new Error('Герой пал — им больше нельзя сражаться');
  // Sea and land do not overlap: a naval battle still running would fight the
  // same party at the same time. The captain must finish it first.
  if (getDb().prepare("SELECT id FROM naval_battles WHERE character_id = ? AND status = 'active' LIMIT 1").get(characterId)) {
    throw new Error('Сначала закончите морской бой');
  }

  let monster = opponent || (monsterId ? getMonster(monsterId) : null);
  let location = locationId ? getLocation(locationId) : null;
  if (!monster && location && location.monsters?.length) {
    monster = location.monsters[Math.floor(Math.random() * location.monsters.length)];
  }
  if (!monster) throw new Error('Для этой встречи нет доступного монстра');

  // The whole active party joins the fight; the leader is 'p1'. The party tree
  // strengthens everyone: stats scale and regeneration deepens. Equipment, active
  // buffs and survival needs also apply, so a hero fights with the sheet the
  // player reads (see getCharacterSheet/getInventory).
  const bonuses = getPartyBonuses(character.id);
  const needs = needModifiersFromMeters(getMeters(character.id));
  const selfMods = (id) => [...activeModifiers(id), ...needs];
  const boost = (src) => {
    const withMods = { ...src, modifiers: selfMods(src.id) };
    const b = applyBonusesToSource(withMods, bonuses);
    b.regenMana = bonuses.regenMana;
    b.regenStamina = bonuses.regenStamina;
    if (bonuses.startFull) { b.hp = b.stats.maxHp; b.mana = b.stats.maxMana; b.stamina = b.stats.maxStamina; }
    return b;
  };
  const allies = activeMembers(character.id).map((m) => boost(getMember(m.id)));
  const { state, events } = createBattle({
    player: boost(character),
    allies,
    opponents: [monsterSource(monster)],
  });
  const db = getDb();
  // A direct hunt carries spoils too. Road ambushes get their loot from the
  // travel plan, but a hero who hunts a monster from a location screen was getting
  // only gold and XP — the shards, moss, ash and salt the smithy needs never
  // dropped. Every normal fight now rolls the same loot table (a titled horror may
  // guard a memory fragment). The roll is stored on the battle row, so a reload
  // cannot reroll it; the wall-clock seed only keeps one hunt from always being
  // the same shard.
  if (!loot && kind === 'normal') {
    loot = rollLoot({
      level: monster.level,
      titled: (monster.level || 1) >= TITLED_LEVEL,
      classKey: monster.class_key,
      seed: `hunt:${character.id}:${monster.id}:${Date.now()}`,
      guarantee: true,
    });
  }
  const info = db.prepare(
    `INSERT INTO battles (status, character_id, monster_id, location_id, state, log, kind, revive_member, loot)
     VALUES ('active', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(character.id, monster.id, location?.id ?? null, serialize(state), JSON.stringify(events), kind, reviveMember ?? null,
    loot ? JSON.stringify(loot) : null);
  const battleId = info.lastInsertRowid;

  // An enemy faster than the whole party can act before the player's first turn
  // and finish the fight outright (createBattle runs those turns immediately). If
  // the battle is already over, settle it now — otherwise it stays 'active' with
  // no player turn, so the reward screen never appears and the party is stuck.
  if (state.over) {
    const settled = state.winner === 'player' ? 'won' : state.winner === 'enemy' ? 'lost' : 'fled';
    db.prepare("UPDATE battles SET status=?, updated_at=datetime('now') WHERE id=?").run(settled, battleId);
    settle({ id: battleId, character_id: character.id, monster_id: monster.id }, state, settled);
  }
  return getBattleView(battleId);
}

export function getBattle(id) {
  const row = getDb().prepare('SELECT * FROM battles WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    state: deserialize(row.state),
    log: deserialize(row.log),
    loot: row.loot ? JSON.parse(row.loot) : null,
    active: row.status === 'active',
  };
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
    kind: battle.kind || 'normal',
    reviveMember: battle.revive_member ?? null,
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

// Record a won raid on an island's landmark. The landmark's location is a
// hidden island place whose region is the island; the anchor is the first place
// of that region. There is no direct import of the island catalogue, so this
// finds the anchor by the region itself -- which keeps battles free of a cycle.
export function recordIslandRaid(characterId, locationId) {
  const anchor = getDb().prepare(
    `SELECT a.id AS anchor_id FROM locations lm
     JOIN regions lr ON lr.id = lm.region_id
     JOIN locations a ON a.region_id = lr.id AND a.hidden = 1
     WHERE lm.id = ? AND lm.scene LIKE 'isle_%'
     ORDER BY a.sort_order LIMIT 1`,
  ).get(locationId);
  if (!anchor) return { staked: false };
  const info = getDb().prepare(
    "UPDATE island_discoveries SET landmark_state = 'raided' WHERE character_id = ? AND island_id = ? AND landmark_state = ''",
  ).run(characterId, anchor.anchor_id);
  return { staked: info.changes > 0 };
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
    // Hardcore death: if the whole party fell with the leader, the hero dies
    // too — for good (no auto-revive). Death is only survivable when allies
    // pulled through: then the leader staggers away with 1 HP.
    const anyAllyAlive = state.combatants.some((c) => c.side === 'player' && c.kind === 'ally' && c.hp > 0);
    const partyWiped = !anyAllyAlive;
    if (partyWiped) {
      getDb().prepare("UPDATE characters SET fate = 'dead', fate_ref = ?, hp = 0, updated_at = datetime('now') WHERE id = ?")
        .run(battle.id, battle.character_id);
      leaderResult = { dead: true, goldLost: 0, ...applyBattleRewards(battle.character_id, { hp: 0, mana: 0, stamina: 0, xpGained: 0, goldGained: 0 }) };
    } else {
      // Defeat is survivable: stagger away with 1 HP. A loss also costs a
      // quarter of the gold, but if the party still won, the leader keeps rewards.
      const row = getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(battle.character_id);
      const goldLost = won ? 0 : Math.floor((row?.gold ?? 0) * DEFEAT_GOLD_PENALTY);
      leaderResult = {
        goldLost,
        ...applyBattleRewards(battle.character_id, {
          hp: 1, mana: 0, stamina: 0, xpGained: won ? xpGained : 0, goldGained: won ? goldGained : -goldLost,
        }),
      };
    }
  } else {
    leaderResult = applyBattleRewards(battle.character_id, {
      hp: player.hp, mana: player.mana, stamina: player.stamina, xpGained, goldGained,
    });
  }

  getDb().prepare('UPDATE battles SET reward_xp=?, reward_gold=?, result=? WHERE id=?')
    .run(xpGained, goldGained, JSON.stringify({ members: memberResults, fallen, goldLost: leaderResult.goldLost ?? 0, leaderDead: !!leaderResult.dead }), battle.id);

  // Очки отряда: a won fight pays, and every leader level-up pays.
  let pointsGained = 0;
  if (won) pointsGained += POINTS_PER_WIN;
  if (leaderResult.leveledUp) pointsGained += POINTS_PER_LEVEL;
  if (pointsGained) awardPartyPoints(battle.character_id, pointsGained);

  // Death realm: beating the boss calls the bound companion back from the dead.
  // Who they are decides how being pulled back lands, and the living who watched
  // the leader walk into death for a peer warm to them too. The boss drops the
  // key that opens the next gate, so the ritual is repeatable. A won ritual also
  // pays the clan in names (docs/lore/clan.md); a hero with no clan earns none.
  let revived = null;
  let revival = null;
  let namesGained = 0;
  if (won && battle.kind === 'death_realm' && battle.revive_member) {
    const member = getMember(battle.revive_member);
    if (member && member.status === 'dead') {
      const back = reviveMember(battle.revive_member);
      const traits = [...back.plus, ...back.minus].map((t) => t.key);
      revival = applyRevivalRelations(battle.revive_member, {
        revivalDelta: revivalDelta(traits),
        witnessDelta: WITNESS_DELTA,
      });
      grantItem(battle.character_id, RITUAL_ITEM, 1);
      grantNames(battle.character_id, NAMES_PER_RITUAL);
      namesGained = NAMES_PER_RITUAL;
      revived = { id: back.id, name: back.name, level: back.level, hp: back.hp, relation: revival.revived };
    }
  }

  // A road ambush carries the spoils its overland encounter rolled when the stop
  // was answered. Granted only on a win, and only once — the loot is cleared from
  // the row as it pays, so re-reading a finished battle never pays twice.
  let loot = null;
  if (won && battle.loot) {
    loot = applyBattleLoot(battle.id, battle.character_id, battle.loot);
  }

  // An island raid: a won fight over a landmark records it as raided, so the
  // island knows the natives are gone and exploring it is no longer an option.
  if (won && battle.kind === 'island_raid' && battle.location_id) {
    recordIslandRaid(battle.character_id, battle.location_id);
  }

  // Quests: a won fight reports the kill and, for a death-realm ritual, the
  // revival — the same event stream the quest objectives listen for. Wrapped so
  // a quest problem can never break settling a battle.
  const quests = [];
  if (won) {
    try {
      if (monster) quests.push(...advanceQuest(battle.character_id, { type: 'kill', target: monster.name }));
      if (battle.kind === 'death_realm' && battle.revive_member) {
        quests.push(...advanceQuest(battle.character_id, { type: 'revive', target: 'companion' }));
      }
    } catch { /* quests are best-effort */ }
  }

  return {
    xpGained, goldGained, status,
    leveledUp: leaderResult.leveledUp,
    goldLost: leaderResult.goldLost ?? 0,
    leaderDead: !!leaderResult.dead,
    pointsGained,
    members: memberResults,
    fallen,
    revived,
    revival,
    loot,
    namesGained,
    quests,
  };
}

// The spoils of a won encounter battle: gold plus any item, granted through the
// same inventory service every other item uses. The stored loot is consumed as
// it is paid, so settling the same finished battle again cannot duplicate it.
function applyBattleLoot(battleId, characterId, loot) {
  getDb().prepare('UPDATE battles SET loot = NULL WHERE id = ?').run(battleId);
  if (loot.gold) {
    getDb().prepare("UPDATE characters SET gold = gold + ?, updated_at = datetime('now') WHERE id = ?")
      .run(loot.gold, characterId);
  }
  const items = (loot.items || []).map((it) => {
    grantItem(characterId, it.key, it.qty || 1);
    // Spoils are also `collect` quest events: a quest that asks for bone shards
    // or a memory fragment advances as soon as a won fight drops one.
    try { advanceQuest(characterId, { type: 'collect', target: it.key, item: it.key, count: it.qty || 1 }); }
    catch { /* best-effort */ }
    return { key: it.key, qty: it.qty || 1, name: it.name || null };
  });
  return { gold: loot.gold || 0, items, memoryFragment: !!loot.memoryFragment };
}

export function getAbilityPreview(id, abilityId, targetKey) {
  const battle = getBattle(id);
  if (!battle) return null;
  return previewAction(battle.state, abilityId, targetKey);
}

export { combatantByKey, aliveCombatants };
