// The player's own clan (Wave G9). The content is db/seed_clan.js; this service
// is the I/O layer: founding, the irreversible doctrine, clan levels, holdings,
// the two resources (gold + names) and mercenaries.
//
// It reuses what already exists rather than duplicating it:
//   - the four powers' flags -> character_unlocks (G8 quests)
//   - a fallen mercenary    -> the ritual's place + key + `names` price
//                              (the same pieces the death realm uses, G1/G3F)
//   - companion templates   -> game/companions.js (the same people, same traits)
//   - gold                  -> the leader's purse (services/characters.js)
//   - base/roads            -> locations (G1/G5/G6)

import { getDb, transaction } from '../db/index.js';
import { getCharacter } from './characters.js';
import { addUnlock, hasUnlock } from './quests.js';
import { hasItem, takeItem } from './items.js';
import { CLASSES } from '../game/classes.js';
import { itemInfo, RITUAL_ITEM } from '../game/items.js';
import { RITUAL_SITE } from '../game/revival.js';
import {
  companionTemplate, templatePrice, traitInfo, COMPANIONS,
} from '../game/companions.js';
import {
  DOCTRINES, BUILDINGS, doctrineByKey, buildingByKey, buildingCost, upgradeCost,
  costForLevel, tierGateForLevel, clanKeyFromName, ALLY_POWERS, HARBOUR_BASES,
  CLAN_MAX_LEVEL, MAX_RANK, GOLD_PER_NAME, BUILDINGS_BY_LEVEL, LEVELS,
} from '../db/seed_clan.js';

const parseJson = (v, fallback) => {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

// --- labels (everything a player reads is Russian) --------------------------

const CH = (n) => `Глава ${n}`;

// The chapter flags a clan must hold before it can be founded. Every chapter is
// itself a flag, granted by the campaign (G11) or, in tests, directly.
const CHAPTER_FLAGS = [1, 2, 3, 4, 5, 6].map((n) => ({ n, flag: `chapter_${n}` }));

const RITUAL_NAME = itemInfo(RITUAL_ITEM).name;

// --- rows -------------------------------------------------------------------

function requireLeader(leaderId) {
  const leader = getCharacter(leaderId);
  if (!leader) throw new Error('Персонаж не найден');
  return leader;
}

function clanRowByLeader(leaderId) {
  return getDb().prepare('SELECT * FROM clans WHERE leader_id = ?').get(leaderId) || null;
}

function requireClanByLeader(leaderId) {
  const row = clanRowByLeader(leaderId);
  if (!row) throw new Error('У этого героя ещё нет клана');
  return row;
}

function buildingRows(clanId) {
  return getDb().prepare('SELECT * FROM clan_buildings WHERE clan_id = ? ORDER BY id').all(clanId);
}

function mercenaryRows(clanId) {
  return getDb().prepare('SELECT * FROM clan_mercenaries WHERE clan_id = ? ORDER BY hired_at, id').all(clanId);
}

// --- doctrine and holding bonuses -------------------------------------------

// Fold the chosen doctrine plus every raised holding into one flat effect map.
// Multiplicative values are fractions (0.15 = +15%); booleans are capability
// flags. The service exposes this so the UI can show what the clan grants.
export function doctrineEffects(doctrineKey) {
  const doc = doctrineByKey(doctrineKey);
  return doc ? { ...doc.effects } : {};
}

export function clanEffects(clan) {
  const out = { ...doctrineEffects(clan?.doctrine) };
  if (!clan) return out;
  for (const b of buildingRows(clan.id)) {
    const def = buildingByKey(b.type);
    if (!def) continue;
    for (const [k, v] of Object.entries(def.effects)) {
      out[k] = typeof v === 'boolean' ? (out[k] || v) : (out[k] || 0) + v * b.tier;
    }
  }
  return out;
}

// --- the view ---------------------------------------------------------------

function buildingView(row) {
  const def = buildingByKey(row.type);
  const next = row.tier < MAX_RANK ? upgradeCost(row.type, row.tier) : null;
  return {
    type: row.type,
    name: def?.name || row.type,
    description: def?.description || '',
    role: def?.role || '',
    icon: def?.icon || null,
    link: def?.link || null,
    tier: row.tier,
    maxRank: MAX_RANK,
    maxed: row.tier >= MAX_RANK,
    nextCost: next,
  };
}

function mercenaryView(row) {
  return {
    id: row.id,
    templateKey: row.template_key,
    name: row.name,
    class: row.class,
    className: CLASSES[row.class]?.label || row.class,
    level: row.level,
    portrait: row.portrait ? `/art/portraits/${row.portrait}.svg` : null,
    history: row.history,
    plus: parseJson(row.pluses, []).map(traitInfo),
    minus: parseJson(row.minuses, []).map(traitInfo),
    status: row.status,
    dead: row.status === 'dead',
    hiredAt: row.hired_at,
  };
}

// What a candidate mercenary costs to hire (the template's deterministic price).
function hireCost(template) {
  return Math.max(40, templatePrice(template));
}

function leaderSummary(leader) {
  return { id: leader.id, name: leader.name, level: leader.level, gold: leader.gold };
}

function buildingCatalogue() {
  return BUILDINGS.map((b) => ({
    type: b.key, name: b.name, description: b.description, role: b.role,
    icon: b.icon, link: b.link, cost: buildingCost(b.key, 1), maxRank: MAX_RANK,
  }));
}

function doctrineCatalogue() {
  return DOCTRINES.map((d) => ({
    key: d.key, name: d.name, idea: d.idea, description: d.description,
    bonuses: d.bonuses, price: d.price, unlock: d.unlock,
  }));
}

// The whole clan screen: identity, doctrine, resources, holdings, mercenaries.
export function getClan(leaderId) {
  const leader = requireLeader(leaderId);
  const row = clanRowByLeader(leaderId);
  if (!row) {
    const requirements = foundingRequirements(leaderId);
    return {
      leader: leaderSummary(leader),
      clan: null,
      holdings: [],
      mercenaries: [],
      allBuildings: buildingCatalogue(),
      doctrines: doctrineCatalogue(),
      canFound: requirements.met,
      requirements,
    };
  }
  const doctrine = doctrineByKey(row.doctrine);
  const base = row.base_id
    ? getDb().prepare('SELECT id, name FROM locations WHERE id = ?').get(row.base_id)
    : null;
  const levelDef = LEVELS.find((l) => l.level === row.level) || LEVELS[0];
  const buildings = buildingRows(row.id).map(buildingView);
  const mercs = mercenaryRows(row.id).map(mercenaryView);
  const nextLevel = row.level < CLAN_MAX_LEVEL ? costForLevel(row.level) : null;
  const mercCap = 2 + (buildings.find((b) => b.type === 'barracks')?.tier || 0);

  return {
    leader: leaderSummary(leader),
    clan: {
      id: row.id,
      key: row.key,
      name: row.name,
      doctrine: row.doctrine,
      doctrineName: doctrine?.name || row.doctrine,
      doctrineIdea: doctrine?.idea || '',
      doctrineDescription: doctrine?.description || '',
      doctrineBonuses: doctrine?.bonuses || [],
      doctrinePrice: doctrine?.price || [],
      effects: clanEffects(row),
      base: base ? { id: base.id, name: base.name } : null,
      level: row.level,
      levelTitle: levelDef.title,
      levelBlurb: levelDef.blurb,
      maxLevel: CLAN_MAX_LEVEL,
      tierGate: tierGateForLevel(row.level),
      buildingsAllowed: BUILDINGS_BY_LEVEL[row.level] ?? 0,
      names: row.names,
      gold: leader.gold,             // the treasury is the leader's purse
      goldPerName: GOLD_PER_NAME,
      nextLevel,
      foundedAt: row.founded_at,
      mercenaryCap: mercCap,
      mercenaryCount: mercs.length,
    },
    holdings: buildings,
    mercenaries: mercs,
    allBuildings: buildingCatalogue(),
    doctrines: doctrineCatalogue(),
    canFound: false,
    requirements: foundingRequirements(leaderId),
  };
}

// --- founding requirements --------------------------------------------------

function chapterProgress(leaderId) {
  return CHAPTER_FLAGS.map(({ n, flag }) => ({ key: flag, label: CH(n), met: hasUnlock(leaderId, flag) }));
}

function allyState(leaderId) {
  const powers = Object.entries(ALLY_POWERS).map(([key, p]) => ({
    key, name: p.name, flag: p.flag, met: hasUnlock(leaderId, p.flag),
  }));
  return { met: powers.some((p) => p.met), powers };
}

function baseOptions() {
  const db = getDb();
  return HARBOUR_BASES
    .map((name) => {
      const row = db.prepare('SELECT id, name FROM locations WHERE name = ?').get(name);
      return { id: row?.id ?? null, name, available: !!row };
    })
    .filter((b) => b.available);
}

// Every condition the spec names: chapters 1-6, a fleet (a harbour base), an
// ally, and a name that yields a latin key.
export function foundingRequirements(leaderId) {
  const leader = requireLeader(leaderId);
  const chapters = chapterProgress(leaderId);
  const ally = allyState(leaderId);
  const bases = baseOptions();
  const requirements = [
    { key: 'chapters', label: 'Пройдены главы 1–6', met: chapters.every((c) => c.met), chapters },
    { key: 'fleet', label: 'Есть флот (гавань или Гримхольд)', met: bases.length > 0, bases },
    { key: 'ally', label: 'Есть союз хотя бы с одной силой', met: ally.met, powers: ally.powers },
  ];
  return { leader: leaderSummary(leader), met: requirements.every((r) => r.met), requirements };
}

// --- founding ---------------------------------------------------------------

// Found the clan. Refused until every condition holds. The doctrine is chosen
// here, once and for all; the base must be a harbour or Гримхольд.
export function foundClan(leaderId, { name, doctrine, base } = {}) {
  requireLeader(leaderId);
  if (clanRowByLeader(leaderId)) throw new Error('У этого героя уже есть клан');

  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) throw new Error('Нужно имя клана (не короче двух знаков)');

  const reqs = foundingRequirements(leaderId);
  const failed = reqs.requirements.filter((r) => !r.met);
  if (failed.length) throw new Error(`Клан пока не основать: ${failed.map((r) => r.label).join('; ')}`);

  const doc = doctrineByKey(doctrine);
  if (!doc) throw new Error('Неизвестный уклон клана');

  const baseName = base || 'Гримхольд';
  if (!HARBOUR_BASES.includes(baseName)) throw new Error('Базой клана может быть только гавань или Гримхольд');
  const baseRow = getDb().prepare('SELECT id, name FROM locations WHERE name = ?').get(baseName);
  if (!baseRow) throw new Error('Такой стоянки нет на карте');

  const key = uniqueKey(clanKeyFromName(cleanName));

  transaction((d) => {
    d.prepare(
      'INSERT INTO clans (leader_id, key, name, doctrine, base_id, level, names) VALUES (?, ?, ?, ?, ?, 1, 0)',
    ).run(leaderId, key, cleanName, doc.key, baseRow.id);
  });

  if (doc.unlock) addUnlock(leaderId, doc.unlock, 'clan_founded');
  addUnlock(leaderId, 'clan_founded', 'clan_founded');
  return getClan(leaderId);
}

// A clan key is unique: append a counter when the slug is already taken.
function uniqueKey(base) {
  const db = getDb();
  let candidate = base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM clans WHERE key = ?').get(candidate)) {
    candidate = `${base}_${n}`;
    n += 1;
  }
  return candidate;
}

// --- choosing the doctrine (irreversible) -----------------------------------

// A clan founded without a doctrine (an older row, or a hesitant founder) may
// still choose one — but only once, and never again. An already chosen doctrine
// can never be changed.
export function chooseDoctrine(leaderId, doctrine) {
  const row = requireClanByLeader(leaderId);
  if (row.doctrine) throw new Error('Уклон уже выбран — сменить его можно лишь через сюжетную ересь');
  const doc = doctrineByKey(doctrine);
  if (!doc) throw new Error('Неизвестный уклон клана');

  getDb().prepare("UPDATE clans SET doctrine = ?, updated_at = datetime('now') WHERE id = ?").run(doc.key, row.id);
  if (doc.unlock) addUnlock(leaderId, doc.unlock, 'clan_founded');
  return getClan(leaderId);
}

// --- levels -----------------------------------------------------------------

// Advance the clan one level (1..5), paying gold + names. The last step is the
// fleet, so it also needs a Причал (docs/lore/clan.md).
export function levelUpClan(leaderId) {
  const leader = requireLeader(leaderId);
  const row = requireClanByLeader(leaderId);
  if (row.level >= CLAN_MAX_LEVEL) throw new Error('Клан уже на высшем уровне');
  const cost = costForLevel(row.level);
  if (!cost) throw new Error('Для этого уровня цена не задана');
  if (leader.gold < cost.gold) throw new Error('Не хватает золота в казне клана');
  if (row.names < cost.names) throw new Error('Не хватает имён для улучшения клана');

  if (row.level + 1 === CLAN_MAX_LEVEL && !buildingRows(row.id).some((b) => b.type === 'pier')) {
    throw new Error('Флот не поднять без Причала');
  }

  transaction((d) => {
    d.prepare("UPDATE characters SET gold = gold - ?, updated_at = datetime('now') WHERE id = ?").run(cost.gold, leaderId);
    d.prepare("UPDATE clans SET level = level + 1, names = names - ?, updated_at = datetime('now') WHERE id = ?").run(cost.names, row.id);
  });
  return getClan(leaderId);
}

// --- holdings ---------------------------------------------------------------

// Raise a building or upgrade one that already stands. Tier may never run ahead
// of the clan level, and the number of distinct holdings is capped by the level.
export function buildStructure(leaderId, type) {
  const leader = requireLeader(leaderId);
  const row = requireClanByLeader(leaderId);
  const def = buildingByKey(type);
  if (!def) throw new Error('Такого здания у клана нет');

  const existing = getDb().prepare('SELECT * FROM clan_buildings WHERE clan_id = ? AND type = ?').get(row.id, def.key);
  if (existing && existing.tier >= MAX_RANK) throw new Error('Это здание уже выковано до предела');

  if (!existing) {
    const allowed = BUILDINGS_BY_LEVEL[row.level] ?? 0;
    if (buildingRows(row.id).length >= allowed) {
      throw new Error('Клан этого уровня не держит столько зданий — поднимите уровень');
    }
  }

  const targetTier = existing ? existing.tier + 1 : 1;
  const gate = tierGateForLevel(row.level);
  if (targetTier > gate) {
    throw new Error('Этот ярус здания открыт лишь с более высокого уровня клана');
  }
  const cost = buildingCost(def.key, targetTier);
  if (leader.gold < cost.gold) throw new Error('Не хватает золота на постройку');
  if (row.names < cost.names) throw new Error('Не хватает имён на постройку');

  transaction((d) => {
    d.prepare("UPDATE characters SET gold = gold - ?, updated_at = datetime('now') WHERE id = ?").run(cost.gold, leaderId);
    d.prepare("UPDATE clans SET names = names - ?, updated_at = datetime('now') WHERE id = ?").run(cost.names, row.id);
    if (existing) {
      d.prepare("UPDATE clan_buildings SET tier = ?, updated_at = datetime('now') WHERE id = ?").run(targetTier, existing.id);
    } else {
      d.prepare('INSERT INTO clan_buildings (clan_id, type, tier) VALUES (?, ?, 1)').run(row.id, def.key);
    }
  });
  return getClan(leaderId);
}

// --- resources --------------------------------------------------------------

// The clan earns names from rituals and memory quests (another system calls
// this); it may also trade gold for names, which is what lets a clan pay a
// holding's names price with coin.
export function grantNames(leaderId, amount) {
  const row = requireClanByLeader(leaderId);
  const n = Math.max(1, Math.floor(Number(amount) || 0));
  getDb().prepare("UPDATE clans SET names = names + ?, updated_at = datetime('now') WHERE id = ?").run(n, row.id);
  return getClan(leaderId);
}

export function buyNames(leaderId, count = 1) {
  const leader = requireLeader(leaderId);
  const row = requireClanByLeader(leaderId);
  const n = Math.max(1, Math.floor(Number(count) || 0));
  const price = n * GOLD_PER_NAME;
  if (leader.gold < price) throw new Error(`Нужно ${price} золота за ${n} имён`);
  transaction((d) => {
    d.prepare("UPDATE characters SET gold = gold - ?, updated_at = datetime('now') WHERE id = ?").run(price, leaderId);
    d.prepare("UPDATE clans SET names = names + ?, updated_at = datetime('now') WHERE id = ?").run(n, row.id);
  });
  return getClan(leaderId);
}

// --- mercenaries ------------------------------------------------------------

// The people a clan can hire: companion templates not already serving it.
export function listHireable(leaderId) {
  const row = requireClanByLeader(leaderId);
  const taken = new Set(mercenaryRows(row.id).map((m) => m.template_key));
  return COMPANIONS
    .filter((t) => !taken.has(t.key))
    .map((t) => ({
      key: t.key,
      name: t.name,
      class: t.class,
      className: CLASSES[t.class]?.label || t.class,
      level: t.level,
      portrait: t.portrait ? `/art/portraits/${t.portrait}.svg` : null,
      history: t.history,
      plus: t.plus.map(traitInfo),
      minus: t.minus.map(traitInfo),
      cost: hireCost(t),
    }));
}

// Hire a mercenary for gold. The clan's barracks raise the cap.
export function hireMercenary(leaderId, templateKey) {
  const leader = requireLeader(leaderId);
  const row = requireClanByLeader(leaderId);
  const t = companionTemplate(templateKey);
  if (!t) throw new Error('Такого наёмника не существует');
  if (mercenaryRows(row.id).some((m) => m.template_key === t.key)) throw new Error('Этот наёмник уже служит клану');

  const cap = 2 + (buildingRows(row.id).find((b) => b.type === 'barracks')?.tier || 0);
  if (mercenaryRows(row.id).length >= cap) throw new Error('Казарма не вмещает столько наёмников — постройте или улучшите её');

  const price = hireCost(t);
  if (leader.gold < price) throw new Error(`Нужно ${price} золота, чтобы нанять его`);

  transaction((d) => {
    d.prepare("UPDATE characters SET gold = gold - ?, updated_at = datetime('now') WHERE id = ?").run(price, leaderId);
    d.prepare(
      `INSERT INTO clan_mercenaries (clan_id, template_key, name, class, level, portrait, history, pluses, minuses, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    ).run(row.id, t.key, t.name, t.class, t.level, t.portrait || null, t.history, JSON.stringify(t.plus), JSON.stringify(t.minus));
  });
  return getClan(leaderId);
}

// A mercenary who falls in a raid. Kept for the resurrection list.
export function markMercenaryDead(mercenaryId) {
  return getDb().prepare("UPDATE clan_mercenaries SET status = 'dead', updated_at = datetime('now') WHERE id = ?")
    .run(mercenaryId).changes > 0;
}

// What a fallen mercenary's ritual costs in names, after the doctrine discount.
export function reviveCost(clan) {
  const doc = doctrineByKey(clan?.doctrine);
  const discount = doc?.effects?.reviveDiscount || 0;
  return Math.max(1, Math.round(10 * (1 - discount)));
}

// Bring a fallen mercenary back with a ritual for `names`. Reuses the death
// realm's pieces: the leader must stand in the chapel with the key and a living
// ally, and the names are spent. The doctrine can cheapen the price.
export function reviveMercenary(leaderId, mercenaryId) {
  requireLeader(leaderId);
  const row = requireClanByLeader(leaderId);
  const merc = getDb().prepare('SELECT * FROM clan_mercenaries WHERE id = ? AND clan_id = ?').get(mercenaryId, row.id);
  if (!merc) throw new Error('Такого наёмника у клана нет');
  if (merc.status !== 'dead') throw new Error('Этот наёмник ещё жив');

  const site = getDb().prepare('SELECT id, name FROM locations WHERE name = ?').get(RITUAL_SITE);
  const atSite = site && !!getDb().prepare('SELECT 1 FROM characters WHERE id = ? AND location_id = ?').get(leaderId, site.id);
  if (!atSite) throw new Error(`Ритуал вершится только в ${RITUAL_SITE}`);
  if (!hasItem(leaderId, RITUAL_ITEM)) throw new Error(`Нужен «${RITUAL_NAME}»`);

  const cost = reviveCost(row);
  if (row.names < cost) throw new Error(`Нужно ${cost} имён для ритуала`);

  takeItem(leaderId, RITUAL_ITEM, 1);
  transaction((d) => {
    d.prepare("UPDATE clans SET names = names - ?, updated_at = datetime('now') WHERE id = ?").run(cost, row.id);
    d.prepare("UPDATE clan_mercenaries SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(mercenaryId);
  });
  const fresh = getClan(leaderId);
  return { mercenary: fresh.mercenaries.find((m) => m.id === Number(mercenaryId)), namesCost: cost };
}

export { DOCTRINES, BUILDINGS, MAX_RANK, CLAN_MAX_LEVEL, GOLD_PER_NAME, RITUAL_NAME, RITUAL_SITE };
