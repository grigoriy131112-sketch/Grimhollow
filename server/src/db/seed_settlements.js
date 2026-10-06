import { getDb, transaction } from './index.js';
import { travelMinutes } from '../game/travel.js';

// Settlements (Wave G6). A settlement is a normal location on the existing
// Мордрат continent, so the map, the roads and travel keep working untouched;
// on top of it sits a set of buildings the player can enter.
//
// Stable keys stay Latin (`key`, `type`, `itemKey`); everything a player reads
// (`name`, `description`, action labels) is Russian.

// --- building type catalog ----------------------------------------------------
//
// `type` is the stable Latin identity; the service resolves "what can I do
// here" from this catalog. `actions` are the things a player may do in such a
// building; `label` is the Russian title shown in the UI. Later waves (G7
// trade, G8 quests) build on the same keys — add actions here, never rename a
// type.
export const BUILDING_TYPES = {
  tavern: {
    label: 'Таверна',
    actions: [
      { key: 'drink', label: 'Выпить и послушать', blurb: 'Кружка сидра и свежие слухи.' },
      { key: 'rest', label: 'Отдохнуть', blurb: 'Короткий отдых в тепле очага.' },
      { key: 'rumors', label: 'Расспросить о делах', blurb: 'Хозяин знает, что творится в округе.' },
    ],
  },
  temple: {
    label: 'Храм',
    actions: [
      { key: 'pray', label: 'Помолиться', blurb: 'Тихая молитва тому, кто ещё слышит.' },
      { key: 'heal', label: 'Исцелиться', blurb: 'Жрец перевяжет раны.' },
      { key: 'donate', label: 'Пожертвовать', blurb: 'Милостыня храму — и немного благодати.' },
    ],
  },
  library: {
    label: 'Библиотека',
    actions: [
      { key: 'study', label: 'Изучить свитки', blurb: 'Знание, что пережило своих писцов.' },
      { key: 'research', label: 'Провести изыскание', blurb: 'Поиск в записях о здешних землях.' },
    ],
  },
  guild: {
    label: 'Гильдейский дом',
    actions: [
      { key: 'contracts', label: 'Взять контракт', blurb: 'Работа для тех, кто не боится грязи.' },
      { key: 'register', label: 'Записаться в гильдию', blurb: 'Имя в книге — и место за столом.' },
    ],
  },
  smithy: {
    label: 'Кузница',
    actions: [
      { key: 'forge', label: 'Выковать', blurb: 'Железо, огонь и терпение.' },
      { key: 'repair', label: 'Починить снаряжение', blurb: 'Залатать то, что износилось в дороге.' },
    ],
  },
  shop: {
    label: 'Лавка',
    actions: [
      { key: 'browse', label: 'Осмотреть товар', blurb: 'Что выставлено на прилавке.' },
      { key: 'buy', label: 'Купить', blurb: 'Заплатить золотом за товар.' },
      { key: 'sell', label: 'Продать', blurb: 'Сбыть лишнее с рук.' },
    ],
  },
  market: {
    label: 'Рынок',
    actions: [
      { key: 'browse', label: 'Пройтись по рядам', blurb: 'Гомон, запахи и крики зазывал.' },
      { key: 'buy', label: 'Купить', blurb: 'Сторговаться с торговцем.' },
      { key: 'sell', label: 'Продать', blurb: 'Найти покупателя на свой товар.' },
    ],
  },
  inn: {
    label: 'Постоялый двор',
    actions: [
      { key: 'rest', label: 'Переночевать', blurb: 'Сон под крышей — редкая роскошь.' },
    ],
  },
  house: {
    label: 'Дом',
    actions: [
      { key: 'visit', label: 'Заглянуть', blurb: 'Жильё местных: кто-то да откликнется.' },
    ],
  },
};

// The buildings every settlement offers in some form. Used by tests to check a
// settlement is complete.
export const REQUIRED_BUILDING_TYPES = ['tavern', 'temple', 'library', 'guild', 'smithy', 'shop', 'market'];

// --- G7 stock shape (contract) ------------------------------------------------
//
// Shop and market buildings carry a list of offers. THIS IS THE SHAPE Wave G7
// (trade) consumes; G6 only seeds it and never buys or sells.
//
//   stock: [
//     { itemKey: 'ration', price: 6, quantity: 24 },
//     ...
//   ]
//
//   itemKey  — Latin string, the stable item identity. Maps to ITEMS in
//              game/items.js once Wave G2 lands; G6 keeps the keys provisional
//              so G7 can reconcile them without a data migration.
//   price    — integer > 0, gold per single unit.
//   quantity — integer >= -1, units on the shelf. -1 means an endless supply.
//
// Persisted in `settlement_stock` as one row per offer:
//   (building_id, item_key, price, quantity, sort_order)
// G7 will decrement `quantity` on a buy and pay gold on a sell; the UNIQUE
// (building_id, item_key) key makes each offer addressable by item.
// ---

const CITY_STOCK = [
  { itemKey: 'ration', price: 6, quantity: -1 },
  { itemKey: 'waterskin', price: 9, quantity: -1 },
  { itemKey: 'torch', price: 4, quantity: 40 },
  { itemKey: 'bandage', price: 12, quantity: 18 },
  { itemKey: 'oil_flask', price: 16, quantity: 10 },
  { itemKey: 'iron_ore', price: 22, quantity: 8 },
];

const CITY_MARKET = [
  { itemKey: 'healing_herb', price: 14, quantity: 30 },
  { itemKey: 'leather_strap', price: 5, quantity: -1 },
  { itemKey: 'bone_charm', price: 35, quantity: 4 },
  { itemKey: 'grave_dust', price: 28, quantity: 6 },
  { itemKey: 'dried_fish', price: 7, quantity: -1 },
];

const VILLAGE_STOCK = [
  { itemKey: 'ration', price: 5, quantity: -1 },
  { itemKey: 'waterskin', price: 8, quantity: -1 },
  { itemKey: 'torch', price: 3, quantity: 25 },
  { itemKey: 'bandage', price: 10, quantity: 8 },
  { itemKey: 'healing_herb', price: 12, quantity: 12 },
];

const VILLAGE_MARKET = [
  { itemKey: 'dried_fish', price: 6, quantity: -1 },
  { itemKey: 'leather_strap', price: 4, quantity: -1 },
  { itemKey: 'turnip', price: 2, quantity: 60 },
  { itemKey: 'clay_jug', price: 6, quantity: 14 },
];

// The city and the village. Each settlement declares its own location (placed
// on the drawn isle) and the roads that connect it to existing places. `x`/`y`
// are chosen to sit on land; the world-map test guards that.
export const SETTLEMENTS = [
  {
    key: 'grimhollow_city',
    name: 'Гримхольд',
    kind: 'city',
    description: 'Последний настоящий город Мордрата: обнесённый почерневшим частоколом, вечно в дыму костров и кузниц.',
    location: {
      name: 'Гримхольд',
      description: 'Укреплённый город под пепельным небом — рынок, храмы и гильдии, зажатые меж стен.',
      danger: 1,
      safe: true,
      biome: 'waste',
      scene: 'city',
      x: 275,
      y: 234,
      connects: ['Перекрёсток висельников', 'Пепельный лес'],
    },
    buildings: [
      { key: 'tavern', name: 'Таверна «Пьяный Ворон»', type: 'tavern', description: 'Три этажа скрипучих полов, где делят добычу и врут о ней.' },
      { key: 'temple', name: 'Храм Пепла', type: 'temple', description: 'Служит богу, чьё имя стёрли с фронтона, но не из сердец.' },
      { key: 'library', name: 'Хранилище Имён', type: 'library', description: 'Свод книг, где записаны все, кто вошёл в город и не вышел.' },
      { key: 'guild', name: 'Гильдия Пепельных Клинков', type: 'guild', description: 'Наёмники, что берутся за то, от чего откажется стража.' },
      { key: 'smithy', name: 'Кузня Кривого Гвоздя', type: 'smithy', description: 'Здесь куют не только сталь, но и слухи — дороже стали.' },
      { key: 'shop', name: 'Лавка Пыльных Товаров', type: 'shop', description: 'Полки ломятся от того, что сняли с мёртвых и продали живым.', stock: CITY_STOCK },
      { key: 'market', name: 'Пепельный торг', type: 'market', description: 'Площадь под навесами, где торгуют всем — даже именами.', stock: CITY_MARKET },
      { key: 'inn', name: 'Постоялый двор «Последний Вздох»', type: 'inn', description: 'Кровати, которые не всегда успевают остыть между постояльцами.' },
      { key: 'house_elder', name: 'Дом городского старшины', type: 'house', description: 'Каменный дом, обнесённый собственной стеной.' },
      { key: 'house_common', name: 'Общинный дом', type: 'house', description: 'Приют для тех, кому не хватило места у очага.' },
    ],
  },
  {
    key: 'salt_ford_village',
    name: 'Соляной Брод',
    kind: 'village',
    description: 'Деревня у солёного брода: горстка домов, часовня и мостки через топь, что кормят и хоронят её разом.',
    location: {
      name: 'Соляной Брод',
      description: 'Деревушка на краю топи, живущая с брода и с того, что приносит вода.',
      danger: 1,
      safe: true,
      biome: 'waste',
      scene: 'village',
      x: 182,
      y: 264,
      connects: ['Перекрёсток висельников', 'Плачущая низина'],
    },
    buildings: [
      { key: 'tavern', name: 'Таверна «Соль и Кружка»', type: 'tavern', description: 'Единственный стол на всю деревню, и тот качается.' },
      { key: 'temple', name: 'Часовня Соляной Заводи', type: 'temple', description: 'Службы идут, пока в топи не поднимется вода.' },
      { key: 'library', name: 'Писцовая изба', type: 'library', description: 'Дьяк хранит грамоты, закладные и чужие тайны.' },
      { key: 'guild', name: 'Странноприимный дом охотников', type: 'guild', description: 'Здесь ночуют те, кто ходит в топь за добычей.' },
      { key: 'smithy', name: 'Кузня Брода', type: 'smithy', description: 'Горн, что чинит плуги и ножи — когда есть уголь.' },
      { key: 'shop', name: 'Лавка тётушки Меры', type: 'shop', description: 'За прилавком — соль, сушёная рыба и доброе слово.', stock: VILLAGE_STOCK },
      { key: 'market', name: 'Бродовый торжок', type: 'market', description: 'Пара рядов по субботам: овощи, рыба и всякая мелочь.', stock: VILLAGE_MARKET },
      { key: 'inn', name: 'Постоялый двор «Соль»', type: 'inn', description: 'Сеновал, где путник спит в обнимку с собакой хозяина.' },
      { key: 'house_fisher', name: 'Дом рыбака', type: 'house', description: 'Сети сушатся на стене, а лодка — у самых мостков.' },
    ],
  },
];

function locationRow(name) {
  return getDb().prepare('SELECT * FROM locations WHERE name = ?').get(name);
}

// Insert the settlements and their buildings. Safe to run on every boot: it
// only adds, and a database that already holds settlements is left alone.
export function seedSettlements() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) AS n FROM settlements').get().n;
  if (existing > 0) return { skipped: true };

  // The roads must land on places the base world already seeded.
  const anchorsMissing = SETTLEMENTS.some((s) => s.location.connects.some((n) => !locationRow(n)));
  if (anchorsMissing) return { skipped: true, reason: 'нет локаций' };

  const inserted = transaction((d) => {
    const insLocation = d.prepare(
      'INSERT INTO locations (region_id, name, description, danger, is_safe, sort_order, map_x, map_y, scene, biome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insConn = d.prepare('INSERT OR IGNORE INTO connections (from_id, to_id, label, minutes) VALUES (?, ?, ?, ?)');
    const insSettlement = d.prepare(
      'INSERT INTO settlements (location_id, key, name, kind, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insBuilding = d.prepare(
      'INSERT INTO settlement_buildings (settlement_id, key, name, type, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insStock = d.prepare(
      'INSERT OR IGNORE INTO settlement_stock (building_id, item_key, price, quantity, sort_order) VALUES (?, ?, ?, ?, ?)',
    );

    let count = 0;
    SETTLEMENTS.forEach((s, si) => {
      const l = s.location;
      // Settle in the same region as the first place it connects to, so the
      // settlement inherits a sensible continent/region.
      const anchor = locationRow(l.connects[0]);
      const regionId = anchor ? anchor.region_id : null;
      if (regionId == null) return;
      const lid = insLocation.run(
        regionId, l.name, l.description, l.danger ?? 1, l.safe ? 1 : 0,
        anchor.sort_order + 1 + si, l.x ?? null, l.y ?? null, l.scene ?? null, l.biome ?? null,
      ).lastInsertRowid;

      // Roads both ways, timed from the drawn map just like the base world.
      for (const targetName of l.connects) {
        const target = locationRow(targetName);
        if (!target) continue;
        const minutes = travelMinutes({
          from: { x: l.x, y: l.y, biome: l.biome, danger: l.danger },
          to: { x: target.map_x, y: target.map_y, biome: target.biome, danger: target.danger },
        });
        insConn.run(lid, target.id, `Дорога к ${target.name}`, minutes);
        insConn.run(target.id, lid, `Дорога к ${l.name}`, minutes);
      }

      const sid = insSettlement.run(lid, s.key, s.name, s.kind, s.description, si).lastInsertRowid;
      s.buildings.forEach((b, bi) => {
        const bid = insBuilding.run(sid, b.key, b.name, b.type, b.description ?? '', bi).lastInsertRowid;
        (b.stock || []).forEach((offer, oi) => {
          insStock.run(bid, offer.itemKey, offer.price, offer.quantity ?? -1, oi);
        });
      });
      count += 1;
    });
    return count;
  });

  return { settlements: inserted };
}
