// Resurrection: a mini-quest through the death realm.
//
// A fallen companion is dead for good — unless the leader walks to the flooded
// chapel, spends the shepherd's key, and beats the realm's boss with a living
// party at their back. There is no animal sacrifice and no fee: the price is
// the journey, the key, and the fight. The boss is stored off-map, so a ritual
// is the only way to reach it.

import { getDb } from '../db/index.js';
import { getCharacter } from './characters.js';
import { activeMembers, fallenMembers, getMember, applyRevivalRelations } from './party.js';
import { hasItem, grantItem, takeItem } from './items.js';
import { getMonsterByName, OFF_MAP_BOSS } from './world.js';
import { RITUAL_ITEM, itemInfo } from '../game/items.js';
import { RITUAL_SITE } from '../game/revival.js';
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

function siteState(leaderId) {
  const db = getDb();
  const site = db.prepare('SELECT id, name FROM locations WHERE name = ?').get(RITUAL_SITE);
  if (!site) return { name: RITUAL_SITE, id: null, visited: false, current: false };
  const visited = !!db.prepare('SELECT 1 FROM character_visits WHERE character_id = ? AND location_id = ?')
    .get(leaderId, site.id);
  const current = !!db.prepare('SELECT 1 FROM characters WHERE id = ? AND location_id = ?')
    .get(leaderId, site.id);
  return { name: site.name, id: site.id, visited, current };
}

// What the ritual screen needs: who has fallen, whether a gate already stands
// open, and which requirements are met.
export function getRitual(leaderId) {
  const leader = requireLeader(leaderId);
  const fallen = fallenMembers(leaderId);
  const gate = activeGate(leaderId);
  const partySize = activeMembers(leaderId).length;
  const site = siteState(leaderId);
  const key = { key: RITUAL_ITEM, ...itemInfo(RITUAL_ITEM), have: hasItem(leaderId, RITUAL_ITEM) };
  const boss = getMonsterByName(OFF_MAP_BOSS);

  const requirements = [
    { key: 'fallen', label: 'В отряде есть павший', met: fallen.length > 0 },
    { key: 'site', label: `Стоять в ${RITUAL_SITE}`, met: site.current },
    { key: 'item', label: `Иметь «${key.name}»`, met: key.have },
    { key: 'party', label: 'В строю есть живой спутник', met: partySize > 0 },
    { key: 'gate', label: 'Врата ещё не открыты', met: !gate },
  ];

  return {
    leader: { id: leader.id, name: leader.name, level: leader.level, gold: leader.gold },
    fallen,
    partySize,
    site,
    item: key,
    requirements,
    canOpen: requirements.every((r) => r.met),
    gate: gate ? { battleId: gate.id, reviveMember: gate.revive_member } : null,
    realm: {
      name: 'Царство мёртвых',
      description: 'Серое поле под небом без звёзд. Павшие идут вереницей, и пастух гонит их прочь от света.',
      boss: boss ? { id: boss.id, name: boss.name, description: boss.description, level: boss.level, maxHp: boss.max_hp, attack: boss.attack } : null,
    },
  };
}

// Open the gate and begin the boss fight. One ritual binds to one fallen
// companion; the key is spent and the journey is the price of bringing them back.
export function startResurrection(leaderId, memberId) {
  requireLeader(leaderId);
  if (activeGate(leaderId)) throw new Error('Врата в царство мёртвых уже открыты — завершите начатый бой');

  const site = siteState(leaderId);
  if (!site.current) throw new Error(`Ритуал вершится только в ${RITUAL_SITE}`);

  const member = getMember(Number(memberId));
  if (!member) throw new Error('Спутник не найден');
  if (member.leaderId !== leaderId) throw new Error('Этот спутник не из вашего отряда');
  if (member.status !== 'dead') throw new Error('Этот спутник ещё жив — воскрешать некого');
  if (activeMembers(leaderId).length === 0) throw new Error('Некому прикрывать спину: в строю нет живых спутников');
  if (!hasItem(leaderId, RITUAL_ITEM)) throw new Error(`Нужен «${itemInfo(RITUAL_ITEM).name}»`);

  const boss = getMonsterByName(OFF_MAP_BOSS);
  if (!boss) throw new Error('Владыка царства мёртвых недоступен');

  takeItem(leaderId, RITUAL_ITEM, 1);
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
export { OFF_MAP_BOSS, applyRevivalRelations, grantItem, RITUAL_ITEM };
