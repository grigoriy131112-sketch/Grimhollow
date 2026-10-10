// The sea's scattered islands (Wave W-ISLES). A voyage may raise one out of the
// mist: the party is asked whether to put in, and if it accepts, it goes ashore
// on a real, walkable place -- and, like a continent, an island is not one rock
// but a little country of its own: a shore to land on, an interior to cross, a
// heart to search, and one **landmark** that gives the island its character.
//
// The landmark is the island's soul: a native village, a temple of the drowned
// god, a shrine, or a camp of wreckers. The party may **explore** it (the quiet
// way: lore, a small gift, and -- at a village -- a settlement with a tavern, a
// shop and a market) or **raid** it (the loud way: a real fight against its
// keepers, for a much bigger haul). Exploring and raiding are mutually
// exclusive; the choice stands.
//
// The islands are deliberately invisible: they are hidden locations on a hidden
// continent, never drawn on the atlas and never listed. Everything here is data
// + pure helpers, no I/O; the seed (db/seed_islands.js) writes these rows and the
// service (services/naval.js) drives them.

import { hashString } from './travel.js';

export const ISLAND_CONTINENT = {
  name: 'Море Осколков',
  description: 'Открытая вода за всеми берегами: острова, что море показывает лишь тому, кто идёт вслепую.',
};

// The four marks of a landmark. `scene` is the accent a place draws on the map
// legends/room art; `label` is what the player reads.
export const LANDMARK_TYPES = {
  village: { label: 'Племя', scene: 'isle_village' },
  temple: { label: 'Храм', scene: 'isle_temple' },
  shrine: { label: 'Святилище', scene: 'isle_shrine' },
  camp: { label: 'Стан', scene: 'isle_camp' },
  mine: { label: 'Копи', scene: 'isle_mine' },
};

// Each island TYPE fixes the shore/interior/heart flavours, and carries one
// authored LANDMARK (name, story, danger, keepers, the camps' cache and the
// explored reward). A type keeps thirty islands readable without thirty essays.
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
    landmark: {
      kind: 'village', name: 'Соляное Племя', danger: 2,
      story: 'Племя, что живёт с соли: выпаривает её из топи, режет в бруски и меняет на рыбу. Оно не любит чужих, но не гонит их первым.',
      keepers: ['Пустой крестьянин', 'Терновый охотник', 'Костяной рыцарь'],
      raid: { gold: [220, 400], items: [['bone_shard', 4], ['rusty_sword', 1], ['salt_lump', 3]] },
      explored: { gold: [25, 55], items: [['salt_lump', 3], ['clean_water', 2]], unlock: 'salt_pact', note: 'Соляное племя поит отряд рассолом на дорогу и просит не трогать крипту.' },
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
    landmark: {
      kind: 'temple', name: 'Храм Утонувших', danger: 4,
      story: 'Храм, ушедший под воду вместе с городом, а теперь поднявшийся с илом на стенах. В нём служат те, кто утонул и всё ещё слышит зов.',
      keepers: ['Призрак хора', 'Костяной рыцарь', 'Хор безгласых', 'Триединый утопленник'],
      raid: { gold: [300, 520], items: [['tide_shard', 3], ['memory_fragment', 2], ['grave_moss_salve', 1]] },
      explored: { gold: [30, 60], items: [['tide_shard', 3], ['memory_fragment', 1]], unlock: 'drowned_hymn', note: 'Хор поёт один такт — и в ушах остаётся мокрый запах глубины.' },
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
    landmark: {
      kind: 'shrine', name: 'Костяное Святилище', danger: 4,
      story: 'Святилище из черепов, которым молятся те, кто остался на острове умирать. Кто постоит у алтаря, тот услышит, как счёт ведут за него.',
      keepers: ['Костяная вдова', 'Курганный титан', 'Пожиратель имён', 'Костяной рыцарь'],
      raid: { gold: [280, 500], items: [['ossuary_heart', 2], ['bone_shard', 4], ['memory_fragment', 1]] },
      explored: { gold: [30, 65], items: [['ossuary_heart', 1], ['bone_shard', 3]], unlock: 'bone_ledger', note: 'У алтаря счёт ведут за каждого, кто однажды сюда вернётся. И твоё имя уже вписано.' },
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
    landmark: {
      kind: 'village', name: 'Пепельное Племя', danger: 2,
      story: 'Племя, что жжёт мёртвых и живёт у их костров: оно верит, что имя, брошенное в огонь, вернётся домой. Здесь рады тем, кто приносит пепел, а не огонь.',
      keepers: ['Пустой крестьянин', 'Терновый охотник', 'Фонарный упырь'],
      raid: { gold: [200, 380], items: [['ash_flake', 5], ['crow_feather', 3], ['grave_moss_salve', 1]] },
      explored: { gold: [25, 50], items: [['ash_flake', 4], ['bread_loaf', 3]], unlock: 'ash_hearth', note: 'У костра тебя назвали другом — и записали твоё имя в пепле, чтобы вернулось.' },
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
    landmark: {
      kind: 'temple', name: 'Коралловый Храм', danger: 4,
      story: 'Храм, чей престол — живой коралл. Он растёт вверх, пока в него верят, и глотает тех, кто перестал. Жрецы тут не говорят, а дышат.',
      keepers: ['Плакальщица на костях', 'Хор безгласых', 'Костяная вдова'],
      raid: { gold: [320, 540], items: [['ossuary_heart', 2], ['mana_lichen', 4], ['tide_shard', 2]] },
      explored: { gold: [30, 60], items: [['mana_lichen', 3], ['tide_shard', 2]], unlock: 'coral_breath', note: 'Жрец выдыхает тебе в лицо тёплый воздух — и ты можешь задержать дыхание дольше.' },
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
    landmark: {
      kind: 'camp', name: 'Ледяной Стан', danger: 4,
      story: 'Стан тех, кто раньше ходил в эти воды за добычей, а теперь сам стал добычей. Здесь делят чужое и не спрашивают, откуда оно.',
      keepers: ['Ржавый колосс', 'Триединый утопленник', 'Костяная вдова', 'Хор безгласых'],
      raid: { gold: [320, 560], items: [['memory_fragment', 2], ['ossuary_heart', 2], ['clean_water', 4]] },
      explored: { gold: [25, 55], items: [['clean_water', 4], ['memory_fragment', 1]], unlock: 'frozen_cache', note: 'Стан отдаёт флягу за то, что ты не поднял на них оружие, и уходит во льды.' },
    },
  },
};

// Thirty islands, keyed latin. `base` is the shore's danger; the interior is one
// step worse, the heart two and the landmark three, so walking inward bites
// harder -- the same shape as a continent's coast-to-interior spread.
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

// Beasts for a place, drawn from the band of its own danger and kept stable per
// place, so a reload cannot reroll an island's wildlife and a deadly heart does
// not get the shore's vermin.
function islandBeasts(seed, danger) {
  const band = Math.max(2, Math.min(5, danger));
  const pool = MONSTER_BANDS[band] || MONSTER_BANDS[3];
  const rng = rngFrom(`isle-beasts:${seed}`);
  const start = Math.floor(rng() * pool.length);
  return pool.map((_, i) => pool[(start + i) % pool.length]);
}

function buildIsland(seed) {
  const type = TYPES[seed.type];
  const locations = type.roles.map((role, i) => {
    const danger = Math.min(5, seed.base + i);
    const beasts = islandBeasts(`${seed.key}:${i}`, danger);
    const b = (k) => beasts[(i + k) % beasts.length];
    return {
      index: i,
      role,
      kind: 'place',
      name: `${role} острова ${seed.name}`,
      description: type.descriptions[i],
      biome: type.biomes[i],
      scene: `isle_${seed.key}_${i}`,
      danger,
      monsters: [b(0), b(1), b(2)],
      loot: { gold: type.loot.gold[i], items: type.loot.items[i] },
    };
  });
  // The landmark: the island's character, reachable from the heart.
  const lm = type.landmark;
  const ltype = LANDMARK_TYPES[lm.kind];
  const landmark = {
    index: locations.length,
    role: lm.name,
    kind: 'landmark',
    landmarkKind: lm.kind,
    name: `${lm.name} острова ${seed.name}`,
    description: lm.story,
    biome: 'coast',
    scene: ltype.scene,
    danger: lm.danger,
    monsters: lm.keepers.slice(),
    // A landmark hides nothing to a simple search: its reward is the choosing --
    // explore it for a gift, or raid it for the haul. Searching here pays nothing.
    loot: { gold: [0, 0], items: [] },
    raid: lm.raid || null,
    explored: lm.explored || null,
    settlementKind: lm.kind === 'village' ? 'native_village' : null,
  };
  const all = [...locations, landmark];
  return {
    key: seed.key,
    name: seed.name,
    type: seed.type,
    base: seed.base,
    danger: Math.min(5, seed.base + 3),
    locations: all,
    places: locations,
    landmark,
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

// Every place an island holds, shore to heart and then its landmark.
export function islandLocations(island) {
  return island?.locations || [];
}

// How much gold a cache holds, given a random fraction 0..1. Pure, so the
// service can roll and a test can pin.
export function lootGold(location, fraction = Math.random()) {
  const [lo, hi] = location?.loot?.gold || [0, 0];
  return Math.round(lo + (hi - lo) * Math.min(1, Math.max(0, fraction)));
}

// One item from a cache, chosen by a random fraction. Returns { key, qty } or
// null when the cache hides nothing. `cache` may be a location's `loot` or a
// reward blob ({ items: [[key, qty], ...] }).
export function lootItem(location, fraction = Math.random()) {
  const items = location?.loot?.items || [];
  if (!items.length) return null;
  const [key, qty] = items[Math.min(items.length - 1, Math.floor(fraction * items.length))];
  return { key, qty };
}

// The reward of a landmark, drawn fresh for the given seed. Returns
// { gold, items: [{ key, qty }] }. `raid` is the big haul, `explored` the small gift.
export function landmarkReward(location, seed) {
  const reward = location?.kind === 'landmark'
    ? (location.raid || location.explored)
    : null;
  if (!reward) return { gold: 0, items: [] };
  const rng = rngFrom(`reward:${seed}`);
  const [glo, ghi] = reward.gold || [0, 0];
  const gold = Math.round(glo + (ghi - glo) * rng());
  const items = (reward.items || []).map(([key, qty]) => ({ key, qty }));
  return { gold, items };
}
