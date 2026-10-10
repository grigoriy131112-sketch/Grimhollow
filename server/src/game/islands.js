// The sea's scattered islands (Wave W-ISLES). A voyage may raise one out of the
// mist: the party is asked whether to put in, and if it accepts, it goes ashore
// on a real, walkable place -- and, like a continent, an island is not one rock
// but a little country of its own: a shore to land on, an interior to cross and a
// heart to search, joined by ordinary roads.
//
// The islands are deliberately invisible: they are hidden locations on a hidden
// continent, never drawn on the atlas and never listed, so the sea stays a blank
// chart and an island stays a discovery. Everything here is data + pure helpers,
// no I/O; the seed (db/seed_islands.js) writes these rows and the service
// (services/naval.js) drives them.

import { hashString } from './travel.js';

export const ISLAND_CONTINENT = {
  name: 'Море Осколков',
  description: 'Открытая вода за всеми берегами: острова, что море показывает лишь тому, кто идёт вслепую.',
};

// Each island is built from a type: the palette of biomes, the three places it
// holds (shore / interior / heart), the words they are named by, and the caches
// every place can hide. A type keeps thirty islands readable without thirty
// hand-written essays.
const TYPES = {
  salt: {
    biomes: ['coast', 'marsh', 'bonefield'],
    roles: ['Белая Отмель', 'Соляная Топь', 'Крипта Соли'],
    descriptions: [
      'Голый берег, выбеленный солью до цвета кости; ветер несёт не брызги, а песок.',
      'Топь, в которой соль выела воду досуха; под коркой что-то хрустит на каждом шагу.',
      'Соляная крипта: стены из белых кристаллов, и в них, как мухи в янтаре, застыли чужие вещи.',
    ],
    loot: {
      gold: [[20, 55], [35, 80], [60, 130]],
      items: [
        [['salt_lump', 2]],
        [['salt_lump', 2], ['tide_shard', 1]],
        [['ossuary_heart', 1], ['memory_fragment', 1], ['tide_shard', 2]],
      ],
    },
  },
  drowned: {
    biomes: ['coast', 'marsh', 'waste'],
    roles: ['Ржавый Берег', 'Затонувший Двор', 'Колокольная Глубина'],
    descriptions: [
      'Берег, усеянный ржавыми обломками; море выбросило всё, что забрало, кроме людей.',
      'Двор утонувшего города: стены стоят под водой, а по комнатам ходят те, кто не выплыл.',
      'Глубина, где лежит колокол без языка: он не звонит, но всё вокруг него молчит.',
    ],
    loot: {
      gold: [[25, 70], [45, 95], [70, 140]],
      items: [
        [['rusty_sword', 1], ['tide_shard', 1]],
        [['tide_shard', 2], ['grave_moss', 2]],
        [['ossuary_heart', 1], ['grave_moss_salve', 1], ['memory_fragment', 1]],
      ],
    },
  },
  bone: {
    biomes: ['coast', 'bonefield', 'waste'],
    roles: ['Костяной Берег', 'Мёртвая Чаща', 'Капище Костей'],
    descriptions: [
      'Песок перемешан с толчёной костью; волны точат её в белую муку.',
      'Чаща из костяных стволов: ветви не гнутся, и в них сидят птицы без перьев.',
      'Капище, сложенное из черепов; здесь молятся тому, кто собирает павших в стада.',
    ],
    loot: {
      gold: [[25, 65], [40, 90], [65, 135]],
      items: [
        [['bone_shard', 2], ['grave_moss', 1]],
        [['bone_shard', 2], ['grave_moss', 2]],
        [['ossuary_heart', 1], ['memory_fragment', 1], ['bone_shard', 2]],
      ],
    },
  },
  ash: {
    biomes: ['coast', 'forest', 'waste'],
    roles: ['Пепельный Берег', 'Гарь', 'Пепельное Капище'],
    descriptions: [
      'Чёрный берег, где волна оставляет не пену, а пепел; чайки тут серые и молчаливые.',
      'Гарь: лес, что сгорел стоя и до сих пор стоит, чёрный и без единого листа.',
      'Капище, засыпанное пеплом по плечи; на алтаре — тлеющий уголь, который не гаснет.',
    ],
    loot: {
      gold: [[20, 60], [35, 85], [55, 125]],
      items: [
        [['ash_flake', 2], ['crow_feather', 1]],
        [['ash_flake', 2], ['crow_feather', 2]],
        [['grave_moss_salve', 1], ['ash_flake', 3], ['memory_fragment', 1]],
      ],
    },
  },
  coral: {
    biomes: ['coast', 'marsh', 'bonefield'],
    roles: ['Бледный Риф', 'Коралловая Чаща', 'Гнездовье'],
    descriptions: [
      'Риф из кораллов цвета мёртвых губ; вода так ясна, что видно, как внизу шевелится.',
      'Чаща живого коралла: он растёт вверх, хватает и не отпускает.',
      'Гнездовье: стены свиты из рёбер и коралла, а в середине — то, что их свило.',
    ],
    loot: {
      gold: [[25, 65], [40, 95], [60, 130]],
      items: [
        [['tide_shard', 2], ['bone_shard', 1]],
        [['tide_shard', 2], ['mana_lichen', 2]],
        [['ossuary_heart', 1], ['mana_lichen', 3], ['tide_shard', 2]],
      ],
    },
  },
  frozen: {
    biomes: ['coast', 'waste', 'bonefield'],
    roles: ['Ледяной Берег', 'Стылая Пустошь', 'Ледяная Усыпальница'],
    descriptions: [
      'Берег, скованный льдом; прибой бьёт в него глухо, как в закрытую дверь.',
      'Пустошь, где ветер выстудил всё дочиста; под снегом — тела, что не успели уйти.',
      'Усыпальница во льду: в стенах стоят вмороженные лица и смотрят, не мигая.',
    ],
    loot: {
      gold: [[25, 70], [45, 105], [70, 145]],
      items: [
        [['memory_fragment', 1], ['clean_water', 2]],
        [['memory_fragment', 2], ['ossuary_heart', 1]],
        [['ossuary_heart', 1], ['memory_fragment', 2], ['clean_water', 3]],
      ],
    },
  },
};

// Thirty islands, keyed latin. `base` is the shore's danger; the interior is one
// step worse and the heart two, so walking inward bites harder -- the same shape
// as a continent's coast-to-interior spread.
const ISLAND_SEEDS = [
  { key: 'salt_skull', name: 'Соляной Череп', type: 'salt', base: 3 },
  { key: 'drowned_bell', name: 'Утонувший Колокол', type: 'drowned', base: 3 },
  { key: 'pale_reef', name: 'Бледный Риф', type: 'coral', base: 3 },
  { key: 'gnawed_wreck', name: 'Изгрызенный Остов', type: 'drowned', base: 3 },
  { key: 'weeping_shoal', name: 'Плачущая Отмель', type: 'salt', base: 2 },
  { key: 'ash_gull', name: 'Пепельная Чайка', type: 'ash', base: 2 },
  { key: 'bone_hook', name: 'Костяной Крюк', type: 'bone', base: 3 },
  { key: 'glass_grave', name: 'Стеклянная Могила', type: 'coral', base: 3 },
  { key: 'frost_maw', name: 'Морозная Пасть', type: 'frozen', base: 3 },
  { key: 'rust_haven', name: 'Ржавая Пристань', type: 'drowned', base: 2 },
  { key: 'salt_idol', name: 'Соляной Идол', type: 'salt', base: 3 },
  { key: 'choir_isle', name: 'Остров Хора', type: 'bone', base: 3 },
  { key: 'ember_spit', name: 'Угольная Коса', type: 'ash', base: 2 },
  { key: 'widow_rock', name: 'Вдовья Скала', type: 'bone', base: 3 },
  { key: 'tide_husk', name: 'Приливный Струп', type: 'coral', base: 2 },
  { key: 'pallid_crown', name: 'Бледная Корона', type: 'salt', base: 3 },
  { key: 'ice_serpent', name: 'Ледяной Змей', type: 'frozen', base: 3 },
  { key: 'mire_choir', name: 'Топкий Хор', type: 'drowned', base: 3 },
  { key: 'bone_lantern', name: 'Костяной Фонарь', type: 'bone', base: 2 },
  { key: 'ashen_veil', name: 'Пепельная Завеса', type: 'ash', base: 3 },
  { key: 'coral_throne', name: 'Коралловый Трон', type: 'coral', base: 3 },
  { key: 'sleet_barrow', name: 'Мокрый Курган', type: 'frozen', base: 2 },
  { key: 'drowned_court', name: 'Утонувший Двор', type: 'drowned', base: 3 },
  { key: 'salt_lattice', name: 'Соляная Решётка', type: 'salt', base: 2 },
  { key: 'marrow_spire', name: 'Костномозговой Шпиль', type: 'bone', base: 3 },
  { key: 'cinder_fang', name: 'Тлеющий Клык', type: 'ash', base: 3 },
  { key: 'pale_abyss', name: 'Бледная Бездна', type: 'coral', base: 3 },
  { key: 'rime_hollow', name: 'Инеевая Низина', type: 'frozen', base: 2 },
  { key: 'gallows_reef', name: 'Висельный Риф', type: 'drowned', base: 3 },
  { key: 'ossuary_shoal', name: 'Костяная Отмель', type: 'bone', base: 3 },
];

// Monsters by the danger they belong to, by name (the seed links them to the
// seeded rows and skips any it cannot find). Matched to each place's danger.
const MONSTER_BANDS = {
  2: ['Могильная крыса', 'Пустой крестьянин', 'Фонарный упырь', 'Терновый охотник'],
  3: ['Фонарный упырь', 'Терновый охотник', 'Костяной рыцарь', 'Призрак хора'],
  4: ['Колосс костяных полей', 'Вестник чумы', 'Плакальщица на костях', 'Триединый утопленник'],
  5: ['Ржавый колосс', 'Пожиратель имён', 'Костяная вдова', 'Хор безгласых', 'Курганный титан'],
};

function rngFrom(seed) {
  let a = hashString(String(seed)) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Three beasts for a place: drawn from the band of its danger, never repeating,
// stable per place so a reload cannot reroll the island's wildlife.
function monstersFor(seed, danger) {
  const pool = MONSTER_BANDS[Math.max(2, Math.min(5, danger))] || MONSTER_BANDS[3];
  const rng = rngFrom(`beasts:${seed}`);
  const start = Math.floor(rng() * pool.length);
  const out = [];
  for (let i = 0; i < Math.min(3, pool.length); i += 1) out.push(pool[(start + i) % pool.length]);
  return out;
}

function buildIsland(seed) {
  const type = TYPES[seed.type];
  const locations = type.roles.map((role, i) => {
    const danger = Math.min(5, seed.base + i);
    return {
      index: i,
      role,
      name: `${role} острова ${seed.name}`,
      description: type.descriptions[i],
      biome: type.biomes[i],
      scene: `isle_${seed.key}_${i}`,
      danger,
      monsters: monstersFor(`${seed.key}:${i}`, danger),
      loot: { gold: type.loot.gold[i], items: type.loot.items[i] },
    };
  });
  return {
    key: seed.key,
    name: seed.name,
    type: seed.type,
    base: seed.base,
    danger: Math.min(5, seed.base + 2),
    locations,
    // The shore is the anchor: the place the party lands on and the island's
    // stable identity for a discovery.
    anchor: locations[0],
  };
}

export const ISLANDS = ISLAND_SEEDS.map(buildIsland);

export const ISLAND_BY_KEY = new Map(ISLANDS.map((i) => [i.key, i]));

export function islandByKey(key) {
  return ISLAND_BY_KEY.get(key) || null;
}

// Every place an island holds, shore to heart.
export function islandLocations(island) {
  return island?.locations || [];
}

// How much gold a place's cache holds, given a random fraction 0..1. Pure, so
// the service can roll and a test can pin.
export function lootGold(location, fraction = Math.random()) {
  const [lo, hi] = location?.loot?.gold || [0, 0];
  return Math.round(lo + (hi - lo) * Math.min(1, Math.max(0, fraction)));
}

// One item from a place's cache, chosen by a random fraction. Returns
// { key, qty } or null when the place hides nothing.
export function lootItem(location, fraction = Math.random()) {
  const items = location?.loot?.items || [];
  if (!items.length) return null;
  const [key, qty] = items[Math.min(items.length - 1, Math.floor(fraction * items.length))];
  return { key, qty };
}
