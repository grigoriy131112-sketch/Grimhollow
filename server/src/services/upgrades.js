import { getDb, transaction } from '../db/index.js';
import {
  NODES, BRANCHES, MAX_RANK, TOTAL_POINTS,
  bonusesFrom, canSpend, spendPoint, nodeInfo,
} from '../game/party_upgrades.js';

// A leader's unspent Очки отряда live on `characters.party_points`; the ranks
// they have already forged live in `party_upgrades` (leader_id, node, points).

function requireLeader(leaderId) {
  const row = getDb().prepare('SELECT id, party_points FROM characters WHERE id = ?').get(leaderId);
  if (!row) throw new Error('Персонаж не найден');
  return row;
}

// node -> rank for one leader.
export function spentMap(leaderId) {
  const rows = getDb().prepare('SELECT node, points FROM party_upgrades WHERE leader_id = ?').all(leaderId);
  const spent = {};
  for (const r of rows) if (r.points > 0) spent[r.node] = r.points;
  return spent;
}

export function getBonuses(leaderId) {
  return bonusesFrom(spentMap(leaderId));
}

export function getPoints(leaderId) {
  return requireLeader(leaderId).party_points || 0;
}

// Add points (a level-up or a won battle). Returns the new balance.
export function awardPartyPoints(leaderId, amount = 0) {
  const n = Math.max(0, Math.floor(amount));
  if (!n) return getPoints(leaderId);
  getDb().prepare("UPDATE characters SET party_points = party_points + ?, updated_at = datetime('now') WHERE id = ?")
    .run(n, leaderId);
  return getPoints(leaderId);
}

// The full tree as the client draws it: every node with its rank, cost and
// whether it can be taken right now, plus the points and totals.
export function getTree(leaderId) {
  const leader = requireLeader(leaderId);
  const spent = spentMap(leaderId);
  const bonuses = bonusesFrom(spent);

  const nodes = Object.entries(NODES).map(([key, node]) => {
    const rank = spent[key] || 0;
    const check = canSpend(spent, key);
    const affordable = (leader.party_points || 0) >= node.cost;
    return {
      key,
      branch: node.branch,
      name: node.name,
      blurb: node.blurb,
      icon: node.icon,
      parent: node.parent,
      cost: node.cost,
      maxRank: MAX_RANK,
      rank,
      maxed: rank >= MAX_RANK,
      canTake: check.ok && affordable,
      locked: !check.ok && !node.parent,
      reason: check.ok ? (affordable ? null : 'Не хватает Очков отряда.') : check.reason,
    };
  });

  const spentPoints = Object.entries(spent)
    .reduce((sum, [key, rank]) => sum + (NODES[key]?.cost || 0) * rank, 0);

  return {
    leader: { id: leader.id, points: leader.party_points || 0 },
    points: leader.party_points || 0,
    spentPoints,
    totalPoints: TOTAL_POINTS,
    branches: BRANCHES.map((b) => ({ ...b, nodes: nodes.filter((n) => n.branch === b.key) })),
    nodes,
    bonuses: {
      roster: bonuses.roster,
      regenMana: bonuses.regenMana,
      regenStamina: bonuses.regenStamina,
      startFull: bonuses.startFull,
      percents: Object.fromEntries(Object.entries(bonuses.mult).map(([k, v]) => [k, Math.round(v * 100)])),
    },
  };
}

// Forge one rank of a node, spending the leader's points. Returns the fresh tree.
export function spendUpgrade(leaderId, key) {
  const node = nodeInfo(key);
  if (!node) throw new Error('Такого узла нет.');

  transaction((d) => {
    const leader = d.prepare('SELECT party_points FROM characters WHERE id = ?').get(leaderId);
    if (!leader) throw new Error('Персонаж не найден');
    const rows = d.prepare('SELECT node, points FROM party_upgrades WHERE leader_id = ?').all(leaderId);
    const spent = {};
    for (const r of rows) if (r.points > 0) spent[r.node] = r.points;

    const result = spendPoint(spent, leader.party_points || 0, key);
    d.prepare(
      `INSERT INTO party_upgrades (leader_id, node, points) VALUES (?, ?, ?)
       ON CONFLICT (leader_id, node) DO UPDATE SET points = excluded.points`,
    ).run(leaderId, key, result.spent[key]);
    d.prepare("UPDATE characters SET party_points = ?, updated_at = datetime('now') WHERE id = ?")
      .run(result.points, leaderId);
  });

  return getTree(leaderId);
}
