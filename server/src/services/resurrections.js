// Resurrection: a mini-quest through the death realm.
//
// When a companion falls in battle they are dead for good — unless the leader
// opens the gate to the death realm, beats its boss, and calls them back. There
// is no animal sacrifice and no fee: the price is the fight. The boss is stored
// off-map, so this is the only way to reach it.

import { getDb } from '../db/index.js';
import { getCharacter } from './characters.js';
import { activeMembers, fallenMembers, getMember } from './party.js';
import { getMonsterByName, OFF_MAP_BOSS } from './world.js';
import { startBattle } from './battles.js';

function requireLeader(leaderId) {
  const leader = getCharacter(leaderId);
  if (!leader) throw new Error('Персонаж не найден');
  return leader;
}

function activeGate(leaderId) {
  return getDb().prepare(
    "SELECT * FROM battles WHERE character_id = ? AND kind = 'death_realm' AND status = 'active' ORDER BY id DESC LIMIT 1",
  ).get(leaderId) || null;
}

// What the ritual screen needs: who has fallen, whether a gate already stands
// open, and what the death realm holds.
export function getRitual(leaderId) {
  const leader = requireLeader(leaderId);
  const fallen = fallenMembers(leaderId);
  const gate = activeGate(leaderId);
  const boss = getMonsterByName(OFF_MAP_BOSS);
  return {
    leader: { id: leader.id, name: leader.name, level: leader.level, gold: leader.gold },
    fallen,
    partySize: activeMembers(leaderId).length,
    canOpen: fallen.length > 0 && !gate,
    gate: gate ? { battleId: gate.id, reviveMember: gate.revive_member } : null,
    realm: {
      name: 'Царство мёртвых',
      description: 'Серое поле под небом без звёзд. Павшие идут вереницей, и пастух гонит их прочь от света.',
      boss: boss ? { id: boss.id, name: boss.name, description: boss.description, level: boss.level, maxHp: boss.max_hp, attack: boss.attack } : null,
    },
  };
}

// Open the gate and begin the boss fight. One ritual binds to one fallen
// companion; the fight is the price of bringing them back.
export function startResurrection(leaderId, memberId) {
  requireLeader(leaderId);
  if (activeGate(leaderId)) throw new Error('Врата в царство мёртвых уже открыты — завершите начатый бой');

  const member = getMember(Number(memberId));
  if (!member) throw new Error('Спутник не найден');
  if (member.leaderId !== leaderId) throw new Error('Этот спутник не из вашего отряда');
  if (member.status !== 'dead') throw new Error('Этот спутник ещё жив — воскрешать некого');

  const boss = getMonsterByName(OFF_MAP_BOSS);
  if (!boss) throw new Error('Владыка царства мёртвых недоступен');

  const battle = startBattle({
    characterId: leaderId,
    kind: 'death_realm',
    reviveMember: member.id,
    opponent: boss,
  });
  return { battleId: battle.id, member: { id: member.id, name: member.name }, boss: { id: boss.id, name: boss.name, level: boss.level } };
}

// The gate is walked by the battle settlement in services/battles.js, which
// revives the bound companion on a win (kept there to avoid a circular import).
export { OFF_MAP_BOSS };
