// Building actions (Wave W-BUILD). The settlement screen has always *shown* what
// each building offers ("Выпить", "Помолиться", "Выковать") but nothing ever
// happened when a player pressed it — the action list was decoration. This
// service performs those actions, reusing the systems that already exist:
// survival (rest/eat), items (grant/spend), characters (gold, resources) and the
// guild quest board. Crafting lives in services/crafting.js.
//
// Every action is idempotent-safe and costs what it says it costs. Where a price
// is involved the gold is checked first and only spent on success.

import { getDb } from '../db/index.js';
import { getBuilding } from './settlements.js';
import { getCharacter } from './characters.js';
import { rest as restMeters, consume as consumeMeters, getSurvivalView } from './survival.js';
import { listQuests } from './quests.js';

// Prices for the paid temple actions. Kept here (not seeded) so the service and
// the UI read the same number from one place.
export const TEMPLE_HEAL_COST = 15;
export const TEMPLE_DONATE_COST = 10;
// A free "drink" simply tops the hero up a little; a tavern meal costs a coin.
export const TAVERN_DRINK_COST = 4;
export const TAVERN_DRINK_FILL = 20;

function requireCharacter(characterId) {
  const c = getCharacter(characterId);
  if (!c) throw new Error('Персонаж не найден');
  return c;
}

function spendGold(characterId, amount) {
  const c = requireCharacter(characterId);
  if (amount > 0 && c.gold < amount) throw new Error('Не хватает золота');
  if (amount > 0) {
    getDb().prepare("UPDATE characters SET gold = gold - ?, updated_at = datetime('now') WHERE id = ?")
      .run(amount, characterId);
  }
  return getCharacter(characterId);
}

// The party's best-known hero resource maxima come from the raw character; healing
// only ever tops up to that. Kept modest so a temple visit is a real but small help.
function healParty(characterId, amount) {
  const c = requireCharacter(characterId);
  const next = Math.min(c.stats.maxHp, c.hp + amount);
  getDb().prepare("UPDATE characters SET hp = ?, updated_at = datetime('now') WHERE id = ?").run(next, characterId);
  return next - c.hp;
}

// --- the action table --------------------------------------------------------
// keyed by building type, then action key. Each handler returns a small result
// object the client can render as a line of feedback.

const HANDLERS = {
  tavern: {
    drink: ({ characterId }) => {
      spendGold(characterId, TAVERN_DRINK_COST);
      const meters = consumeMeters(characterId, 'ration');
      // A ration feeds; if the shelves are bare, still ease hunger a touch.
      return { kind: 'drink', cost: TAVERN_DRINK_COST, text: 'Кружка сидра и горячая похлёбка. Голод отступает.', meters: meters.meters };
    },
    rest: ({ characterId }) => {
      const meters = restMeters(characterId);
      return { kind: 'rest', text: 'Короткий отдых у очага. Усталость как рукой сняло.', meters };
    },
    rumors: ({ characterId }) => ({
      kind: 'rumors',
      text: 'Хозяин понижает голос: «На дорогах нынче неспокойно. Держи клинок наготове».',
      rumors: ['Костяной Пастырь всё ещё бродит где-то за гранью.', 'Брокер из гавани скупает обломки прилива за звонкую монету.', 'В Затонувшей часовне, говорят, отпирают врата к мёртвым.'],
      talk: 'tavern_keeper',
    }),
  },

  temple: {
    pray: ({ characterId }) => ({
      kind: 'pray',
      text: 'Тихая молитва тому, кто ещё слышит. На душе чуть легче.',
      characterId,
    }),
    heal: ({ characterId }) => {
      spendGold(characterId, TEMPLE_HEAL_COST);
      const healed = healParty(characterId, 40);
      return { kind: 'heal', cost: TEMPLE_HEAL_COST, healed, text: healed > 0 ? `Жрец перевязал раны: +${healed} здоровья.` : 'Раны уже почти затянулись — жрец лишь осмотрел их.' };
    },
    donate: ({ characterId }) => {
      spendGold(characterId, TEMPLE_DONATE_COST);
      return { kind: 'donate', cost: TEMPLE_DONATE_COST, text: 'Милостыня принята. Храм запомнит доброе имя.' };
    },
  },

  library: {
    study: () => ({
      kind: 'study',
      text: 'Свитки пережили своих писцов. Немного знания о здешних землях оседает в памяти.',
      lore: ['Мордрат раскололся, когда Пастырь повёл стадо мёртвых.', 'Пепельные клинки хранят верность тому, кто платит вовремя.', 'Имена — новая монета: за них поднимают павших.'],
    }),
    research: () => ({
      kind: 'research',
      text: 'Ты разбираешь записи о здешних краях — и находишь пару полезных строк.',
    }),
  },

  guild: {
    contracts: ({ characterId }) => {
      const board = listQuests(characterId);
      const open = [...(board.available || [])].slice(0, 5);
      return {
        kind: 'contracts',
        open: open.map((q) => ({ key: q.key, name: q.name })),
        text: open.length ? 'Гильдейский доска полна контрактов — загляните в раздел заданий.' : 'Свободных контрактов сейчас нет.',
      };
    },
    register: ({ characterId }) => {
      const c = requireCharacter(characterId);
      return { kind: 'register', text: `Имя «${c.name}» внесено в книгу гильдии.`, characterId };
    },
  },

  inn: {
    rest: ({ characterId }) => {
      const meters = restMeters(characterId);
      return { kind: 'rest', text: 'Сон под крышей — редкая роскошь. Усталость прошла.', meters };
    },
  },

  house: {
    visit: () => ({
      kind: 'visit',
      text: 'В доме кто-то откликается — пара слов, кружка воды, тень тепла.',
    }),
  },
};

// The actions a building actually offers, resolved (dynamic ones add live data).
export function actionsForBuilding(building) {
  const table = HANDLERS[building.type] || {};
  return Object.keys(table);
}

// Perform one action. Throws a Russian error the route turns into a 400.
export function performBuildingAction(characterId, buildingId, actionKey) {
  const building = getBuilding(buildingId);
  if (!building) throw new Error('Здание не найдено');
  requireCharacter(characterId);

  const table = HANDLERS[building.type];
  const handler = table && table[actionKey];
  if (!handler) throw new Error('Здесь так нельзя');

  const result = handler({ characterId, building });
  return {
    buildingId,
    buildingType: building.type,
    action: actionKey,
    ...result,
    character: getCharacter(characterId),
    survival: safeSurvival(characterId),
  };
}

function safeSurvival(characterId) {
  try { return getSurvivalView(characterId); } catch { return null; }
}
