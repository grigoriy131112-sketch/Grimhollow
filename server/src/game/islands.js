// The sea's scattered islands (Wave W-ISLES). A voyage may raise one out of the
// mist: the party is asked whether to put in, and if it accepts, it goes ashore
// on a real, walkable location -- fight what haunts it, search its hoard, then
// put back to sea. The islands are deliberately invisible: they are hidden
// locations on a hidden continent, never drawn on the atlas and never listed, so
// the sea stays a blank chart and an island stays a discovery.
//
// Everything here is data + pure helpers, no I/O; the seed (db/seed_islands.js)
// writes these rows and the service (services/naval.js) drives them.

export const ISLAND_CONTINENT = {
  name: 'Море Осколков',
  description: 'Открытая вода за всеми берегами: острова, что море показывает лишь тому, кто идёт вслепую.',
};

export const ISLAND_REGION = {
  name: 'Забытые острова',
  description: 'Клочки земли, которых нет ни на одной карте, — их находят, а не ищут.',
};

// Six islands, keyed latin. Danger 3..5, always coastal or waste (the sea leaves
// one shore of sand or bone). `monsters` are seeded monster names; the seed links
// by name and skips any it cannot find, so the list is safe to adjust.
export const ISLANDS = [
  {
    key: 'salt_skull',
    name: 'Соляной Череп',
    danger: 5,
    scene: 'isle_salt_skull',
    description: 'Голый утёс, выбеленный солью до цвета кости; ветер здесь несёт не брызги, а песок и чей-то шёпот.',
    monsters: ['Соляной утопленник', 'Триединый утопленник', 'Костяной мореход'],
    loot: { gold: [50, 110], items: [['tide_shard', 2], ['salt_lump', 3], ['memory_fragment', 1]] },
    note: 'На Соляном Черепе море отдаёт то, что проглотило у чужих берегов.',
  },
  {
    key: 'drowned_bell',
    name: 'Утонувший Колокол',
    danger: 5,
    scene: 'isle_drowned_bell',
    description: 'Из мелкой воды торчит колокол без языка; он не звонит, но всё вокруг него молчит, как в церкви.',
    monsters: ['Тихий хор', 'Призрак хора', 'Хор безгласых'],
    loot: { gold: [40, 90], items: [['tide_shard', 2], ['grave_moss', 2], ['ossuary_heart', 1]] },
    note: 'Колокол помнит имена утопленников — и требует, чтобы их вспомнили.',
  },
  {
    key: 'pale_reef',
    name: 'Бледный Риф',
    danger: 4,
    scene: 'isle_pale_reef',
    description: 'Риф из кораллов цвета мёртвых губ; вода над ним такая ясная, что видно, как внизу что-то шевелится.',
    monsters: ['Костяной батрак', 'Плакальщица на костях', 'Костяной рыцарь'],
    loot: { gold: [30, 70], items: [['tide_shard', 2], ['bone_shard', 2], ['grave_moss_salve', 1]] },
    note: 'На Бледном Рифе кости обрастают кораллом и не желают лежать смирно.',
  },
  {
    key: 'gnawed_wreck',
    name: 'Изгрызенный Остов',
    danger: 4,
    scene: 'isle_gnawed_wreck',
    description: 'Полусъеденный корпус корабля, вросший в песок; борта изгрызены так, будто кто-то пробовал их на зуб.',
    monsters: ['Ржавый дозорный', 'Ржавый колосс', 'Костяной рыцарь'],
    loot: { gold: [35, 80], items: [['rusty_sword', 1], ['tide_shard', 1], ['ash_flake', 2]] },
    note: 'Остов помнит последний рейс — и того, кто его сюда выбросил.',
  },
  {
    key: 'weeping_shoal',
    name: 'Плачущая Отмель',
    danger: 3,
    scene: 'isle_weeping_shoal',
    description: 'Песчаная коса, где вода никогда не отступает до конца; по ночам оттуда слышен плач, хотя плакать некому.',
    monsters: ['Костяная вдова', 'Фонарный упырь', 'Могильная крыса'],
    loot: { gold: [25, 60], items: [['tide_shard', 1], ['bone_shard', 2], ['mana_lichen', 2]] },
    note: 'Отмель плачет по тем, кого не вернули с воды.',
  },
  {
    key: 'ash_gull',
    name: 'Пепельная Чайка',
    danger: 3,
    scene: 'isle_ash_gull',
    description: 'Скала, где гнездятся серые, как пепел, птицы; они не кричат, а смотрят — и запоминают каждого, кто сошёл на берег.',
    monsters: ['Пустой крестьянин', 'Терновый охотник', 'Соляной утопленник'],
    loot: { gold: [20, 55], items: [['ash_flake', 3], ['crow_feather', 2], ['grave_moss', 1]] },
    note: 'Чайки с Пепельной скалы помнят твой берег и однажды туда долетят.',
  },
];

export const ISLAND_BY_KEY = new Map(ISLANDS.map((i) => [i.key, i]));

export function islandByKey(key) {
  return ISLAND_BY_KEY.get(key) || null;
}

// The item keys an island's hoard can hold, for a loot table that never hands
// out a key the item catalogue does not know.
export function islandLootKeys(island) {
  return (island?.loot?.items || []).map(([key]) => key);
}

// How much gold an island's hoard holds, given a random fraction 0..1. Pure so
// the service can roll and the test can pin.
export function islandGold(island, fraction = Math.random()) {
  const [lo, hi] = island?.loot?.gold || [0, 0];
  return Math.round(lo + (hi - lo) * Math.min(1, Math.max(0, fraction)));
}

// One item from the hoard, chosen by a random fraction. Returns { key, qty } or
// null when the island has nothing to give.
export function islandItem(island, fraction = Math.random()) {
  const items = island?.loot?.items || [];
  if (!items.length) return null;
  const [key, qty] = items[Math.min(items.length - 1, Math.floor(fraction * items.length))];
  return { key, qty };
}
