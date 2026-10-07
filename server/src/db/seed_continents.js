import { getDb, transaction } from './index.js';
import { travelMinutes } from '../game/travel.js';
import { CROSSING_GATES } from '../game/continent_travel.js';

// The four continents beyond Мордрат (Wave G5), from docs/lore/continents.md:
// Морозная Колыбель (north), Кор-Ашан (south), Вольные Гавани (west) and
// Зелёный Предел (east). Each is seeded as a normal continent with regions and
// locations, so the map, the roads and travel keep working untouched.
//
// Nothing here renames or moves an existing Мордрат location. Each continent's
// port is the gate the crossing rules sail from, and the continents are linked
// to Мордрат by those crossings (game/continent_travel.js) rather than by an
// ordinary road — a normal road would let a player walk between continents for
// free and bypass the crossing's fare, toll and danger. Within a continent the
// locations are joined by ordinary roads as usual.
//
// Coordinates are chosen to sit on the drawn isle; server/test/continents.test.js
// guards that against the sampled land mask.

export const CONTINENTS = [
  {
    name: 'Морозная Колыбель',
    description: 'Северный край ледников и фьордов, где память вмораживают в лёд, чтобы сохранить.',
    regions: [
      {
        name: 'Стеклянные фьорды',
        description: 'Узкие заливы меж ледяных стен, где эхо живёт дольше, чем помнят люди.',
        locations: [
          { name: 'Ледяной причал', description: 'Порт у кромки льда: единственная ниточка, что связывает Колыбель с остальным миром.', danger: 2, safe: true, biome: 'coast', scene: 'ice_harbor', x: 502, y: 192, connects: ['Фьорд Стеклянных Слёз', 'Тихая Трещина', 'Ледовый Погост'] },
          { name: 'Фьорд Стеклянных Слёз', description: 'Залив, чьи ледяные стены сочатся водой — говорят, это плачут замороженные воспоминания.', danger: 3, biome: 'coast', scene: 'glass_fjord', x: 520, y: 166, connects: ['Ледяной причал', 'Замёрзшее море', 'Стеклянная Отмель'] },
          { name: 'Стеклянная Отмель', description: 'Волны намыли к берегу лёд, прозрачный, как витраж: под ним видно чужие застывшие лица.', danger: 2, biome: 'coast', scene: 'glass_shoal', x: 504, y: 160, connects: ['Фьорд Стеклянных Слёз', 'Тихая Трещина'] },
          { name: 'Тихая Трещина', description: 'Разлом во льду, куда не долетает ветер; кто заглянет сюда раз — услышит собственное имя.', danger: 3, biome: 'coast', scene: 'quiet_rift', x: 504, y: 175, connects: ['Стеклянная Отмель', 'Ледяной причал'] },
        ],
      },
      {
        name: 'Ледяные гробницы',
        description: 'Поля вечной мерзлоты, усеянные курганами, в которых спят не только тела.',
        locations: [
          { name: 'Замёрзшее море', description: 'Внутреннее море, схваченное льдом до самого дна; под ним что-то шевелится.', danger: 4, biome: 'waste', scene: 'frozen_sea', x: 498, y: 143, connects: ['Фьорд Стеклянных Слёз', 'Ледяные гробницы'] },
          { name: 'Ледяные гробницы', description: 'Ряды ледяных курганов, где хранители холода замораживают лица, письма и имена.', danger: 5, biome: 'waste', scene: 'ice_tombs', x: 516, y: 147, connects: ['Замёрзшее море', 'Курганная Тропа'] },
          { name: 'Курганная Тропа', description: 'Тропа, протоптанная между курганами; идёшь по ней — и под ногами отзывается каждый шаг.', danger: 3, biome: 'waste', scene: 'barrow_path', x: 518, y: 182, connects: ['Ледяные гробницы', 'Ледовый Погост'] },
          { name: 'Ледовый Погост', description: 'Кладбище, где вместо надгробий — глыбы льда с вмороженными вещами тех, кого не вернуть.', danger: 4, biome: 'waste', scene: 'ice_graveyard', x: 518, y: 197, connects: ['Курганная Тропа', 'Ледяной причал'] },
        ],
      },
    ],
  },
  {
    name: 'Кор-Ашан',
    description: 'Стеклянная пустыня на юге, где память вплавляют в витражи, а история — валюта и оружие.',
    regions: [
      {
        name: 'Стеклянный берег',
        description: 'Побережье, где песок спёкся в стекло от жара, чьего имени никто не помнит.',
        locations: [
          { name: 'Порт Солёного Стекла', description: 'Порт на краю пустыни: караваны и корабли сходятся здесь, чтобы продать чужую память.', danger: 2, safe: true, biome: 'coast', scene: 'glass_port', x: 322, y: 402, connects: ['Стеклянные дюны', 'Стеклодувная'] },
          { name: 'Стеклянные дюны', description: 'Дюны из оплавленного песка, что звенят под ветром и режут глаза блеском.', danger: 3, biome: 'waste', scene: 'glass_dunes', x: 360, y: 430, connects: ['Порт Солёного Стекла', 'Зеркальное марево', 'Осколочный Брод', 'Стеклодувная'] },
          { name: 'Стеклодувная', description: 'Мастерская на самом берегу: здесь из дюнного стекла тянут нити, что хранят чужие дни.', danger: 2, biome: 'coast', scene: 'glassworks', x: 375, y: 391, connects: ['Стеклянные дюны', 'Порт Солёного Стекла'] },
          { name: 'Осколочный Брод', description: 'Мелкая переправа, сплошь из осколков: каждый шаг стоит крови, зато ведёт через пустошь.', danger: 3, biome: 'waste', scene: 'shard_ford', x: 332, y: 465, connects: ['Стеклянные дюны', 'Витражный Колодец'] },
        ],
      },
      {
        name: 'Подземные архивы',
        description: 'Города-архивы под песком, где знатные дома торгуют историей в витражах.',
        locations: [
          { name: 'Зеркальное марево', description: 'Плато, где днём воздух стоит зеркалом и показывает то, чего нет.', danger: 4, biome: 'waste', scene: 'mirror_haze', x: 388, y: 419, connects: ['Стеклянные дюны', 'Подземный архив', 'Дом Забытых Стёкол'] },
          { name: 'Подземный архив', description: 'Вырубленный в камне город-витраж: каждое событие вплавлено в стекло, и кто владеет стеклом, владеет прошлым.', danger: 5, biome: 'bonefield', scene: 'glass_archive', x: 416, y: 430, connects: ['Зеркальное марево', 'Витражный Колодец', 'Дом Забытых Стёкол'] },
          { name: 'Витражный Колодец', description: 'Шахта, уходящая вглубь архивов; её стены — сплошной витраж, и в нём тонет свет факела.', danger: 4, biome: 'bonefield', scene: 'stained_well', x: 375, y: 465, connects: ['Осколочный Брод', 'Подземный архив'] },
          { name: 'Дом Забытых Стёкол', description: 'Особняк, где хранят витражи о событиях, которых не было, — на случай, если они всё-таки случатся.', danger: 5, biome: 'bonefield', scene: 'forgotten_glass', x: 432, y: 406, connects: ['Подземный архив', 'Зеркальное марево'] },
        ],
      },
    ],
  },
  {
    name: 'Вольные Гавани',
    description: 'Утонувший запад: изрезанный берег, тонущие острова и затонувшие города, где море помнит всё.',
    regions: [
      {
        name: 'Вольные острова',
        description: 'Острова вольных капитанов и контрабандистов, живущие с моря и с того, что оно отдаёт.',
        locations: [
          { name: 'Порт Свободных Капитанов', description: 'Пёстрый порт без власти: флаги всех мастей, слухи всех берегов и ни одного честного счётчика.', danger: 2, safe: true, biome: 'coast', scene: 'free_port', x: 141, y: 280, connects: ['Рифовый маяк', 'Бухта Без Имён'] },
          { name: 'Рифовый маяк', description: 'Маяк на рифах из корабельных остовов; его огонь зажигают те, кто не собирается возвращаться.', danger: 3, biome: 'coast', scene: 'reef_light', x: 127, y: 310, connects: ['Порт Свободных Капитанов', 'Затонувший город', 'Мокрый Причал'] },
          { name: 'Мокрый Причал', description: 'Пристань на северной отмели, где швартуются те, кому нельзя показываться в порту.', danger: 3, biome: 'coast', scene: 'wet_pier', x: 289, y: 205, connects: ['Рифовый маяк', 'Затонувший Маяк'] },
          { name: 'Бухта Без Имён', description: 'Тихая бухта, где капитаны сходятся без флагов и без имён — только дела и долги.', danger: 3, biome: 'coast', scene: 'nameless_bay', x: 168, y: 435, connects: ['Рифовый маяк', 'Затонувший город'] },
        ],
      },
      {
        name: 'Утонувшие города',
        description: 'Кварталы, ушедшие под воду, и кладбища кораблей, что так и не доплыли.',
        locations: [
          { name: 'Затонувший город', description: 'Улицы под водой, где утопленники помнят больше живых.', danger: 4, biome: 'coast', scene: 'sunken_city', x: 280, y: 391, connects: ['Рифовый маяк', 'Кладбище кораблей', 'Немая Отмель'] },
          { name: 'Кладбище кораблей', description: 'Мелководье, утыканное мачтами; культ Хора поёт здесь имена утопленников, чтобы те не всплывали.', danger: 5, biome: 'bonefield', scene: 'ship_graveyard', x: 363, y: 374, connects: ['Затонувший город', 'Немая Отмель'] },
          { name: 'Затонувший Маяк', description: 'Маяк, чей огонь давно под водой, но всё ещё светит — тем, кто идёт ко дну.', danger: 4, biome: 'coast', scene: 'sunken_lighthouse', x: 454, y: 175, connects: ['Мокрый Причал', 'Немая Отмель'] },
          { name: 'Немая Отмель', description: 'Отмель из затонувших колоколов: они не звонят, но море вокруг них молчит, как в церкви.', danger: 4, biome: 'bonefield', scene: 'mute_shoal', x: 454, y: 294, connects: ['Кладбище кораблей', 'Затонувший город', 'Затонувший Маяк'] },
        ],
      },
    ],
  },
  {
    name: 'Зелёный Предел',
    description: 'Живой лес на востоке — единый сверхорганизм, чьи корни прорастают под всеми континентами.',
    regions: [
      {
        name: 'Живой берег',
        description: 'Тёплый влажный берег, где лес подступает к самой воде и светится ночью.',
        locations: [
          { name: 'Зелёный причал', description: 'Пристань на опушке живого леса: сюда приходят те, кто хочет, чтобы мир вспомнил.', danger: 2, safe: true, biome: 'forest', scene: 'green_harbor', x: 559, y: 307, connects: ['Корни-дороги', 'Берег, Что Дышит'] },
          { name: 'Корни-дороги', description: 'Тропы, протоптанные по исполинским корням; под ними слышно, как дышит лес.', danger: 3, biome: 'forest', scene: 'root_roads', x: 636, y: 254, connects: ['Зелёный причал', 'Сердце Леса', 'Мангровый Прилив', 'Гнездо Крон'] },
          { name: 'Мангровый Прилив', description: 'Корни, вставшие прямо в тёплую воду: прилив приносит сюда всё, что лес решил забыть.', danger: 3, biome: 'coast', scene: 'mangrove_tide', x: 654, y: 510, connects: ['Корни-дороги', 'Корневой Перевал'] },
          { name: 'Берег, Что Дышит', description: 'Полоса берега, что поднимается и опускается в такт дыханию леса; стоять здесь — как на груди спящего.', danger: 3, biome: 'forest', scene: 'breathing_shore', x: 918, y: 272, connects: ['Корни-дороги', 'Зелёный причал'] },
        ],
      },
      {
        name: 'Сердце Леса',
        description: 'Средоточие сверхорганизма, где кора врастает в плоть, чтобы ничто не забывалось.',
        locations: [
          { name: 'Сердце Леса', description: 'Поляна, где стоит сама богиня-мать: не говорит, а растёт — и хранит всё, включая чужие грехи.', danger: 5, biome: 'forest', scene: 'heart_forest', x: 700, y: 320, connects: ['Корни-дороги', 'Привитые', 'Корневой Перевал'] },
          { name: 'Привитые', description: 'Стойбище людей, в чьи тела вросла кора: они не забывают ничего — ни добра, ни зла.', danger: 4, biome: 'forest', scene: 'grafted_grove', x: 565, y: 350, connects: ['Сердце Леса', 'Гнездо Крон'] },
          { name: 'Корневой Перевал', description: 'Перевал по сплетённым корням через южные дубравы; ветви смыкаются над головой в сплошной свод.', danger: 4, biome: 'forest', scene: 'root_pass', x: 839, y: 532, connects: ['Мангровый Прилив', 'Сердце Леса'] },
          { name: 'Гнездо Крон', description: 'Кроны, сросшиеся в живое гнездо; отсюда лес видит все свои пределы разом.', danger: 4, biome: 'forest', scene: 'crown_nest', x: 475, y: 473, connects: ['Привитые', 'Корни-дороги'] },
        ],
      },
    ],
  },
];

function locationRow(name) {
  return getDb().prepare('SELECT * FROM locations WHERE name = ?').get(name);
}

// Insert the four continents, their regions, locations and the internal roads
// between them. Safe to run on every boot. A database that already holds the
// continents keeps them and only gains any locations and roads it is missing —
// so later waves can spread a continent out without a destructive reseed — and
// existing Мордрат rows are never touched.
export function seedContinents() {
  const db = getDb();
  const existing = db.prepare(
    `SELECT COUNT(*) AS n FROM continents WHERE name IN (${CONTINENTS.map(() => '?').join(', ')})`,
  ).get(...CONTINENTS.map((c) => c.name)).n;

  // The hub must already exist: the base world seeds Мордрат first.
  const hub = locationRow('Сумеречная гавань');
  if (!hub) return { skipped: true, reason: 'нет Сумеречной гавани' };

  const inserted = transaction((d) => {
    const insContinent = d.prepare('INSERT INTO continents (name, description, sort_order) VALUES (?, ?, ?)');
    const insRegion = d.prepare('INSERT INTO regions (continent_id, name, description, sort_order) VALUES (?, ?, ?, ?)');
    const insLocation = d.prepare('INSERT INTO locations (region_id, name, description, danger, is_safe, sort_order, map_x, map_y, scene, biome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insConn = d.prepare('INSERT OR IGNORE INTO connections (from_id, to_id, label, minutes) VALUES (?, ?, ?, ?)');

    let continentOrder = d.prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM continents').get().n + 1;
    const continentId = (name) => d.prepare('SELECT id FROM continents WHERE name = ?').get(name)?.id;
    const regionId = (cid, name) => d.prepare('SELECT id FROM regions WHERE continent_id = ? AND name = ?').get(cid, name)?.id;
    const have = new Set(d.prepare('SELECT name FROM locations').all().map((r) => r.name));

    const added = [];
    for (const c of CONTINENTS) {
      let cid = continentId(c.name);
      if (!cid) { cid = insContinent.run(c.name, c.description, continentOrder).lastInsertRowid; continentOrder += 1; }
      c.regions.forEach((r, ri) => {
        let rid = regionId(cid, r.name);
        if (!rid) rid = insRegion.run(cid, r.name, r.description, ri).lastInsertRowid;
        r.locations.forEach((l, li) => {
          if (have.has(l.name)) return;
          insLocation.run(rid, l.name, l.description, l.danger, l.safe ? 1 : 0, li, l.x, l.y, l.scene, l.biome);
          added.push(l.name);
        });
      });
    }

    // Roads are laid after every location exists, so an internal link can name
    // any place in a new continent. Cross-continent travel is a crossing
    // (game/continent_travel.js), not a road, so nothing is laid to the hub here.
    for (const c of CONTINENTS) for (const r of c.regions) for (const l of r.locations) {
      const from = locationRow(l.name);
      for (const targetName of l.connects || []) {
        const to = locationRow(targetName);
        if (!from || !to) continue;
        const minutes = travelMinutes({
          from: { x: l.x, y: l.y, biome: l.biome, danger: l.danger },
          to: { x: to.map_x, y: to.map_y, biome: to.biome, danger: to.danger },
        });
        insConn.run(from.id, to.id, `Дорога к ${to.name}`, minutes);
        insConn.run(to.id, from.id, `Дорога к ${from.name}`, minutes);
      }
    }
    return added.length;
  });

  return { continents: CONTINENTS.length, locations: inserted, skipped: existing > 0 };
}

// The four port gates that reach Мордрат, exported so tests and the service can
// agree on which places open a crossing.
export { CROSSING_GATES };
