// The item catalogue (Wave G2). Every item a hero can carry lives here; the
// inventory service (services/items.js) is only the I/O layer.
//
// Item shape:
//   {
//     key,          // latin, stable id (DB + API identity)
//     name,         // Russian, player-visible
//     description,  // Russian, player-visible
//     type,         // weapon | armor | resource | artifact | consumable
//     slot,         // equipment only: weapon | offhand | head | body | hands | feet | ring | amulet
//     rarity,       // common | uncommon | rare | epic | legendary
//     stats,        // equipment only: flat bonuses to combat stats (attack, defense, ...)
//     price,        // base value in gold (trade wave G7 will read this)
//     buff,         // consumable: temporary buff/debuff it applies
//                   //   { stat, amount, turns, kind: 'buff'|'debuff', key? }
//     resource,     // consumable: restores { resource: 'hp'|'mana'|'stamina', amount, also? }
//     ritual,       // the death-realm gate consumes it
//     trophy,       // a keepsake, not usable
//     artifact,     // a unique relic (magic, not sold)
//   }
//
// `stats` are FLAT adds fed to the modifier engine (game/modifiers.js). Keep
// them modest — combat balance is locked and equipment must not break it.

export const ITEM_TYPES = {
  weapon: 'Оружие',
  armor: 'Броня',
  resource: 'Припас',
  artifact: 'Артефакт',
  consumable: 'Снадобье',
};

export const RARITIES = {
  common: { name: 'Обычный', color: '#a08a6a' },
  uncommon: { name: 'Необычный', color: '#6fae5a' },
  rare: { name: 'Редкий', color: '#5a8fd8' },
  epic: { name: 'Эпический', color: '#9a5ad8' },
  legendary: { name: 'Легендарный', color: '#d9b44a' },
};

// Every slot a character can fill. Order matters for the inventory screen.
export const EQUIP_SLOTS = {
  weapon: 'Оружие',
  offhand: 'Левая рука',
  head: 'Голова',
  body: 'Тело',
  hands: 'Руки',
  feet: 'Ноги',
  ring: 'Кольцо',
  amulet: 'Амулет',
};

export const SLOT_ORDER = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'ring', 'amulet'];

export const ITEMS = {
  // --- Ritual components and trophies (kept working for the death realm) ----
  shepherd_key: {
    key: 'shepherd_key',
    name: 'Ключ Пастыря',
    description: 'Костяной ключ, выломанный из руки пастуха. Отпирает врата в царство мёртвых.',
    type: 'artifact',
    rarity: 'legendary',
    ritual: true,
  },
  shepherd_crook: {
    key: 'shepherd_crook',
    name: 'Посох Пастыря',
    description: 'Трофей, снятый с владыки мёртвых. Помнит, как гнали стадо.',
    type: 'artifact',
    rarity: 'legendary',
    trophy: true,
  },

  // --- Weapons --------------------------------------------------------------
  rusty_sword: {
    key: 'rusty_sword',
    name: 'Ржавый меч',
    description: 'Щербатый клинок, переживший хозяев. Всё ещё режет.',
    type: 'weapon', slot: 'weapon', rarity: 'common',
    stats: { attack: 3 }, price: 15,
  },
  hunter_bow: {
    key: 'hunter_bow',
    name: 'Охотничий лук',
    description: 'Тугой лук из тиса. Бьёт издалека и точно.',
    type: 'weapon', slot: 'weapon', rarity: 'uncommon',
    stats: { attack: 4, accuracy: 3 }, price: 55,
  },
  ashen_dagger: {
    key: 'ashen_dagger',
    name: 'Пепельный кинжал',
    description: 'Клинок, обожжённый на погребальном костре. Быстр и тих.',
    type: 'weapon', slot: 'weapon', rarity: 'rare',
    stats: { attack: 5, speed: 2 }, price: 120,
  },
  gravewarden_maul: {
    key: 'gravewarden_maul',
    name: 'Молот стража могил',
    description: 'Тяжёлая кувалда с клеймом кладбищенской стражи. Ломает кости и броню.',
    type: 'weapon', slot: 'weapon', rarity: 'epic',
    stats: { attack: 9, defense: 1 }, price: 320,
  },

  // --- Armour ---------------------------------------------------------------
  worn_leathers: {
    key: 'worn_leathers',
    name: 'Потёртая кожа',
    description: 'Дублёнка, латанная во многих дорогах. Не жмёт.',
    type: 'armor', slot: 'body', rarity: 'common',
    stats: { defense: 3, evasion: 1 }, price: 20,
  },
  iron_hauberk: {
    key: 'iron_hauberk',
    name: 'Железный хауберк',
    description: 'Кольчуга из тяжёлых колец. Держит удар, но отнимает прыть.',
    type: 'armor', slot: 'body', rarity: 'uncommon',
    stats: { defense: 6, speed: -1 }, price: 90,
  },
  dusk_hood: {
    key: 'dusk_hood',
    name: 'Сумеречный капюшон',
    description: 'Плащ цвета последнего часа. Гасит шаги и прячет лицо.',
    type: 'armor', slot: 'head', rarity: 'rare',
    stats: { evasion: 4, accuracy: 2 }, price: 140,
  },
  pallid_gauntlets: {
    key: 'pallid_gauntlets',
    name: 'Бледные рукавицы',
    description: 'Кожаные рукавицы мертвеца. Хватка крепче, чем кажется.',
    type: 'armor', slot: 'hands', rarity: 'uncommon',
    stats: { attack: 2, defense: 1 }, price: 45,
  },
  gravedigger_boots: {
    key: 'gravedigger_boots',
    name: 'Сапоги могильщика',
    description: 'Крепкие сапоги, привыкшие к глине. Шаг увереннее.',
    type: 'armor', slot: 'feet', rarity: 'uncommon',
    stats: { speed: 2, evasion: 1 }, price: 50,
  },
  bone_buckler: {
    key: 'bone_buckler',
    name: 'Костяной щит',
    description: 'Лёгкий щит из рёбер зверя. Прикрывает левый бок.',
    type: 'armor', slot: 'offhand', rarity: 'common',
    stats: { defense: 4 }, price: 25,
  },
  moonstone_ring: {
    key: 'moonstone_ring',
    name: 'Лунное кольцо',
    description: 'Перстень с холодным камнем. В нём больше силы, чем блеска.',
    type: 'armor', slot: 'ring', rarity: 'rare',
    stats: { maxMana: 12, accuracy: 2 }, price: 160,
  },
  wolf_fang_amulet: {
    key: 'wolf_fang_amulet',
    name: 'Амулет из волчьего клыка',
    description: 'Клык на жиле. Даёт нюх на кровь и звериную ярость.',
    type: 'armor', slot: 'amulet', rarity: 'rare',
    stats: { attack: 3, accuracy: 3 }, price: 150,
  },

  // --- Resources ------------------------------------------------------------
  bread_loaf: {
    key: 'bread_loaf',
    name: 'Краюха хлеба',
    description: 'Чёрствый хлеб. Голод не утолит, но силы вернёт.',
    type: 'resource', rarity: 'common',
    resource: { resource: 'stamina', amount: 15 }, price: 4,
  },
  clean_water: {
    key: 'clean_water',
    name: 'Фляга чистой воды',
    description: 'Колодезная вода без тины. Освежает.',
    type: 'resource', rarity: 'common',
    resource: { resource: 'stamina', amount: 10 }, price: 3,
  },
  bitter_herb: {
    key: 'bitter_herb',
    name: 'Горький корень',
    description: 'Трава из-под поваленного дерева. Затягивает мелкие раны.',
    type: 'resource', rarity: 'common',
    resource: { resource: 'hp', amount: 20 }, price: 8,
  },
  mana_lichen: {
    key: 'mana_lichen',
    name: 'Манный лишайник',
    description: 'Светящийся лишайник. Возвращает искру в жилы.',
    type: 'resource', rarity: 'uncommon',
    resource: { resource: 'mana', amount: 15 }, price: 12,
  },
  glowcap: {
    key: 'glowcap',
    name: 'Светящийся гриб',
    description: 'Гриб, что растёт в сырых погребах. Восстанавливает силы и дух.',
    type: 'resource', rarity: 'uncommon',
    resource: { resource: 'hp', amount: 25, also: { resource: 'mana', amount: 8 } }, price: 20,
  },

  // --- Consumables (temporary buffs/debuffs) --------------------------------
  shadow_draught: {
    key: 'shadow_draught',
    name: 'Тёмное зелье',
    description: 'Мутное варево. На короткое время ускоряет движения.',
    type: 'consumable', rarity: 'uncommon',
    buff: { stat: 'speed', amount: 4, turns: 4, kind: 'buff', key: 'shadow_draught' }, price: 30,
  },
  iron_brew: {
    key: 'iron_brew',
    name: 'Железный настой',
    description: 'Горький напиток кузнецов. Кожа будто каменеет.',
    type: 'consumable', rarity: 'rare',
    buff: { stat: 'defense', amount: 6, turns: 3, kind: 'buff', key: 'iron_brew' }, price: 60,
  },
  wolfsblood: {
    key: 'wolfsblood',
    name: 'Волчья кровь',
    description: 'Багровое зелье охотников. Рука бьёт сильнее.',
    type: 'consumable', rarity: 'rare',
    buff: { stat: 'attack', amount: 6, turns: 3, kind: 'buff', key: 'wolfsblood' }, price: 65,
  },
  hex_vial: {
    key: 'hex_vial',
    name: 'Склянка порчи',
    description: 'Зловещая настойка. Отнимает у врага крепость.',
    type: 'consumable', rarity: 'rare',
    buff: { stat: 'defense', amount: -4, turns: 3, kind: 'debuff', key: 'hex_vial' }, price: 55,
  },

  // --- Artifacts (unique relics) -------------------------------------------
  crow_feather: {
    key: 'crow_feather',
    name: 'Перо вестника',
    description: 'Чёрное перо, что не мокнет. Носишь — и мир слышишь зорче.',
    type: 'artifact', rarity: 'uncommon', artifact: true,
    stats: { accuracy: 3 }, price: 80,
  },
  ossuary_heart: {
    key: 'ossuary_heart',
    name: 'Сердце оссуария',
    description: 'Окаменевшее сердце, что бьётся, если приложить к уху. Даёт сил больше, чем плоти.',
    type: 'artifact', rarity: 'epic', artifact: true,
    stats: { maxHp: 30, attack: 2 }, price: 400,
  },
  pale_lantern: {
    key: 'pale_lantern',
    name: 'Бледный фонарь',
    description: 'Фонарь, что горит без огня. В его свете враги видны насквозь.',
    type: 'artifact', rarity: 'rare', artifact: true,
    stats: { accuracy: 5, evasion: 2 }, price: 220,
  },

  // --- Trade goods and finds ------------------------------------------------
  // Bestiary loot (G10) and the tide quest (G8) name these keys; before them the
  // catalogue had no entry, so the bag could not show what was won. Settlement
  // shelf keys that the trade service already labels via its own table (torch,
  // oil_flask, iron_ore, bone_charm, dried_fish) are deliberately not listed here
  // as the catalogue treats `itemInfo(key).name === key` as "unknown". Each of
  // these carries a real Russian name. `tide_shard` is the one a quest collects.
  tide_shard: {
    key: 'tide_shard',
    name: 'Обломок прилива',
    description: 'Осколок, что море вынесло на берег. Брокер из гавани скупает такие.',
    type: 'resource', rarity: 'uncommon', price: 12,
  },
  bone_shard: {
    key: 'bone_shard',
    name: 'Костяной обломок',
    description: 'Обломок кости, оставшийся от чьей-то смерти.',
    type: 'resource', rarity: 'common', price: 6,
  },
  salt_lump: {
    key: 'salt_lump',
    name: 'Соляной ком',
    description: 'Слежавшаяся соль с низин. Товар нехитрый, да нужный.',
    type: 'resource', rarity: 'common', price: 5,
  },
  ash_flake: {
    key: 'ash_flake',
    name: 'Хлопья пепла',
    description: 'Пепел, что не разносит ветер. Собирается горстями.',
    type: 'resource', rarity: 'common', price: 4,
  },
  grave_moss: {
    key: 'grave_moss',
    name: 'Могильный мох',
    description: 'Мох с могил, мягкий и холодный. Годится для настоев.',
    type: 'resource', rarity: 'uncommon', price: 9,
  },
  memory_fragment: {
    key: 'memory_fragment',
    name: 'Фрагмент памяти',
    description: 'Чужая память, застывшая в стекле. Дороже золота для тех, кто помнит.',
    type: 'artifact', rarity: 'epic', artifact: true, price: 0,
  },
};

export const RITUAL_ITEM = 'shepherd_key';

const UNKNOWN = (key) => ({ key, name: key, description: '', type: 'resource', rarity: 'common' });

export const itemInfo = (key) => ITEMS[key] || UNKNOWN(key);

export const isEquipment = (item) => !!item && (item.type === 'weapon' || item.type === 'armor');

export const isConsumable = (item) => !!item && (item.type === 'consumable' || !!item.resource);

// Items that fit a given slot, in catalogue order.
export const itemsForSlot = (slot) => Object.values(ITEMS).filter((it) => isEquipment(it) && it.slot === slot);
