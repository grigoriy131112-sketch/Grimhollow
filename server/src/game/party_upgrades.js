// The party upgrade tree (Wave 12). A leader earns Очки отряда (party points)
// from battles and spends them on nodes that strengthen the whole party. The
// tree is a small set of branches, each a chain of nodes; a node can only be
// taken once its parent is maxed. Everything here is pure: the service layer
// stores the spent points and applies the resulting bonuses.

export const MAX_RANK = 3;

// Cost grows with every rank: the r-th rank of a node costs `base * r`, so
// rank 1 costs base, rank 2 costs twice base, rank 3 three times base. Maxing a
// three-rank node therefore costs base*(1+2+3) = 6*base. Bases also rise with
// branch depth, so the tree gets steeper the further it is forged.
export function costForRank(base, rank) {
  return base * rank;
}

// Points already sunk into a node at a given rank.
export function spentOnNode(base, rank) {
  let sum = 0;
  for (let r = 1; r <= rank; r += 1) sum += costForRank(base, r);
  return sum;
}

// What it costs to fully forge a node.
export const nodeTotalCost = (base) => spentOnNode(base, MAX_RANK);

export const NODES = {
  // --- Command: the leader's presence on the field ---
  command_hp: {
    branch: 'command', name: 'Стойкость знамени', parent: null, cost: 2,
    blurb: 'Предводитель и спутники впитывают удары лучше.',
    effect: { stat: 'maxHp', perRank: 0.06 },
  },
  command_attack: {
    branch: 'command', name: 'Клинок отряда', parent: 'command_hp', cost: 3,
    blurb: 'Слаженный натиск: всякий бьёт сильнее.',
    effect: { stat: 'attack', perRank: 0.05 },
  },
  command_defense: {
    branch: 'command', name: 'Стена щитов', parent: 'command_attack', cost: 5,
    blurb: 'Отряд держит строй — броня крепче.',
    effect: { stat: 'defense', perRank: 0.07 },
  },

  // --- Swiftness: turn order and landing blows ---
  swift_speed: {
    branch: 'swiftness', name: 'Лёгкий шаг', parent: null, cost: 2,
    blurb: 'Отряд движется быстрее и чаще бьёт первым.',
    effect: { stat: 'speed', perRank: 0.06 },
  },
  swift_accuracy: {
    branch: 'swiftness', name: 'Верный глаз', parent: 'swift_speed', cost: 3,
    blurb: 'Удары чаще находят цель.',
    effect: { stat: 'accuracy', perRank: 0.05 },
  },
  swift_evasion: {
    branch: 'swiftness', name: 'Тень меж стрел', parent: 'swift_accuracy', cost: 5,
    blurb: 'Отряд уходит из-под удара.',
    effect: { stat: 'evasion', perRank: 0.06 },
  },

  // --- Sorcery: mana, stamina and their regeneration ---
  sorcery_mana: {
    branch: 'sorcery', name: 'Полные жилы', parent: null, cost: 2,
    blurb: 'Запас маны и выносливости растёт.',
    effect: { stat: 'maxMana', perRank: 0.10, also: { stat: 'maxStamina', perRank: 0.10 } },
  },
  sorcery_regen: {
    branch: 'sorcery', name: 'Родник силы', parent: 'sorcery_mana', cost: 3,
    blurb: 'Мана и выносливость возвращаются быстрее.',
    effect: { regenMana: 1, regenStamina: 1 },
  },
  sorcery_focus: {
    branch: 'sorcery', name: 'Ясный ум', parent: 'sorcery_regen', cost: 5,
    blurb: 'Предводитель начинает бой с полным запасом сил.',
    effect: { startFull: true },
  },

  // --- Muster: how many companions march ---
  muster_roster: {
    branch: 'muster', name: 'Длинный обоз', parent: null, cost: 4,
    blurb: 'В отряде может быть на одного спутника больше.',
    effect: { roster: 1 },
  },
};

export const BRANCHES = [
  { key: 'command', name: 'Командование', blurb: 'Сила предводителя на поле боя.' },
  { key: 'swiftness', name: 'Быстрота', blurb: 'Скорость, точность и уклонение.' },
  { key: 'sorcery', name: 'Волшебство', blurb: 'Мана, выносливость и их возврат.' },
  { key: 'muster', name: 'Сбор', blurb: 'Размер отряда.' },
];

export const nodeInfo = (key) => NODES[key] || null;
export const nodesOfBranch = (branch) => Object.entries(NODES)
  .filter(([, n]) => n.branch === branch)
  .map(([key, n]) => ({ key, ...n }));

// Total points a maxed tree would cost; handy for sanity checks and the UI.
export const TOTAL_POINTS = Object.values(NODES).reduce((sum, n) => sum + nodeTotalCost(n.cost), 0);

// The default roster size the game has shipped with (Wave 3C).
export const BASE_ROSTER = 4;

// Every leader level-up awards this many Очки отряда. Battles also pay a point
// on a win (see services/battles.js), so the tree fills without grinding.
export const POINTS_PER_LEVEL = 1;
export const POINTS_PER_WIN = 1;

// --- spending -----------------------------------------------------------------

// Whether `spent` (a map of node -> rank) permits taking the next rank of `key`.
// Parent must be maxed; the node itself must not already be maxed.
export function canSpend(spent, key) {
  const node = NODES[key];
  if (!node) return { ok: false, reason: 'Такого узла нет.' };
  const rank = spent[key] || 0;
  if (rank >= MAX_RANK) return { ok: false, reason: 'Этот узел уже выкован до конца.' };
  if (node.parent && (spent[node.parent] || 0) < MAX_RANK) {
    return { ok: false, reason: `Сначала выкуйте «${NODES[node.parent].name}».` };
  }
  return { ok: true };
}

// Spend one rank on a node. Returns the new spent map and the remaining points.
// The rank being bought is (current rank + 1), and its price grows with it.
export function spendPoint(spent, points, key) {
  const check = canSpend(spent, key);
  if (!check.ok) throw new Error(check.reason);
  const node = NODES[key];
  const nextRank = (spent[key] || 0) + 1;
  const cost = costForRank(node.cost, nextRank);
  if (points < cost) throw new Error('Не хватает Очков отряда.');
  const next = { ...spent, [key]: nextRank };
  return { spent: next, points: points - cost, cost };
}

// --- bonuses ------------------------------------------------------------------

// Fold the whole tree into flat bonuses applied to every party member.
// Multiplicative stats are stored as fractions (0.06 = +6%); additive ones as
// whole numbers. Regeneration and roster size are flat adds.
export function bonusesFrom(spent = {}) {
  const mult = {};
  let regenMana = 0;
  let regenStamina = 0;
  let roster = BASE_ROSTER;
  let startFull = false;

  for (const [key, rank] of Object.entries(spent)) {
    const node = NODES[key];
    if (!node || rank <= 0) continue;
    const r = Math.min(rank, MAX_RANK);
    const e = node.effect;
    if (e.stat) {
      mult[e.stat] = (mult[e.stat] || 0) + e.perRank * r;
      if (e.also) mult[e.also.stat] = (mult[e.also.stat] || 0) + e.also.perRank * r;
    }
    if (e.regenMana) regenMana += e.regenMana * r;
    if (e.regenStamina) regenStamina += e.regenStamina * r;
    if (e.roster) roster += e.roster * r;
    if (e.startFull) startFull = true;
  }

  return { mult, regenMana, regenStamina, roster, startFull };
}

// Apply the tree to one combatant source, returning a new source whose stats
// carry the bonuses. Max resources scale too, and are topped up by the same
// amount when the tree raises them (a stronger hero, not a wounded one).
export function applyBonusesToSource(source, bonuses) {
  const { mult = {} } = bonuses || {};
  const stats = source.stats || {};
  const scaled = (field, value) => {
    const m = mult[field];
    if (!m || value == null) return value;
    return Math.round(value * (1 + m));
  };
  const nextStats = {
    ...stats,
    maxHp: scaled('maxHp', stats.maxHp),
    maxMana: scaled('maxMana', stats.maxMana),
    maxStamina: scaled('maxStamina', stats.maxStamina),
    attack: scaled('attack', stats.attack),
    defense: scaled('defense', stats.defense),
    accuracy: scaled('accuracy', stats.accuracy),
    evasion: scaled('evasion', stats.evasion),
    speed: scaled('speed', stats.speed),
  };
  return {
    ...source,
    stats: nextStats,
    hp: refill(source.hp, stats.maxHp, nextStats.maxHp),
    mana: refill(source.mana, stats.maxMana, nextStats.maxMana),
    stamina: refill(source.stamina, stats.maxStamina, nextStats.maxStamina),
  };
}

// If a maximum grew, top the resource up by the same amount; otherwise keep it.
function refill(current, oldMax, newMax) {
  if (current == null) return newMax;
  if (oldMax == null || newMax <= oldMax) return Math.min(current, newMax);
  return Math.min(newMax, current + (newMax - oldMax));
}
