import { getDb, transaction } from './index.js';
import { travelMinutes } from '../game/travel.js';

// A grim-dark world: a dying continent, its blighted regions, and the things
// that wait in them. Each location lists outgoing roads by name.

const WORLD = [
  {
    name: 'Мордрат',
    description: 'Расколотое королевство. Континент под небом цвета старых синяков, где мёртвые не всегда остаются в земле.',
    regions: [
      {
        name: 'Пепельный предел',
        description: 'Поля серой пыли, где отгремела война, которую никто не помнит.',
        locations: [
          { name: 'Перекрёсток висельников', description: 'Перекрёсток, отмеченный виселицей, что никогда не пустовала.', danger: 1, safe: true, biome: 'waste', scene: 'crossroads', x: 500, y: 278, connects: ['Плачущая низина', 'Утонувшая дорога'] },
          { name: 'Плачущая низина', description: 'Ложбина, задушенная туманом, что глотает и звук, и свет.', danger: 2, biome: 'marsh', scene: 'hollow', x: 459, y: 326, connects: ['Перекрёсток висельников', 'Пепельный лес'] },
          { name: 'Утонувшая дорога', description: 'Затонувшая гать, где болото поглотило королевский тракт.', danger: 2, biome: 'marsh', scene: 'drowned_road', x: 495, y: 320, connects: ['Перекрёсток висельников', 'Затонувшая часовня', 'Сумеречная гавань'] },
          { name: 'Пепельный лес', description: 'Обгоревшие деревья, всё ещё тёплые на ощупь спустя годы после пожара.', danger: 3, biome: 'forest', scene: 'ash_forest', x: 557, y: 235, connects: ['Плачущая низина', 'Костяные поля'] },
          { name: 'Стеклянная топь', description: 'Топь на южном краю пустоши, где из грязи торчат оплавленные камни, будто поле боя, что обратили в стекло.', danger: 2, biome: 'marsh', scene: 'glass_mire', x: 439, y: 398, connects: ['Соляной Брод', 'Плачущая низина'] },
        ],
      },
      {
        name: 'Костяной берег',
        description: 'Берег меловых утёсов и оссуариев, где море отдаёт кости вместо ракушек.',
        locations: [
          { name: 'Сумеречная гавань', description: 'Порт, освещённый фонарями, торгующий обломками и секретами.', danger: 1, safe: true, biome: 'coast', scene: 'harbor', x: 528, y: 300, connects: ['Утонувшая дорога', 'Пещеры, изгрызенные приливом'] },
          { name: 'Пещеры, изгрызенные приливом', description: 'Морские пещеры, увешанные останками тех, кого забрал прилив.', danger: 3, biome: 'coast', scene: 'tide_caves', x: 545, y: 273, connects: ['Сумеречная гавань', 'Затонувшая часовня', 'Костяные поля'] },
          { name: 'Затонувшая часовня', description: 'Затопленная часовня богу, что утонул вместе со своим стадом.', danger: 4, biome: 'coast', scene: 'sunken_chapel', x: 484, y: 348, connects: ['Утонувшая дорога', 'Пещеры, изгрызенные приливом'] },
          { name: 'Костяные поля', description: 'Равнина выбеленных останков, где земля так и не зажила.', danger: 4, biome: 'bonefield', scene: 'bone_field', x: 523, y: 251, connects: ['Пепельный лес', 'Пещеры, изгрызенные приливом', 'Чёрный шпиль'] },
          { name: 'Чёрный шпиль', description: 'Игла обсидиана, что гудит звуком, похожим на жужжание мух.', danger: 5, biome: 'waste', scene: 'black_spire', x: 584, y: 218, connects: ['Костяные поля'] },
          { name: 'Вдовья роща', description: 'Роща на северном отроге, где мёртвые сосны стоят так плотно, что в ней никогда не рассветает.', danger: 3, biome: 'forest', scene: 'widows_wood', x: 582, y: 160, connects: ['Чёрный шпиль', 'Костяные поля'] },
        ],
      },
    ],
  },
];

const MONSTERS = [
  { name: 'Могильная крыса', description: 'Раздутая крыса, отъевшаяся на трупах.', level: 1, max_hp: 22, attack: 7, defense: 2, accuracy: 22, evasion: 8, speed: 9, mana: 0, stamina: 0, class_key: 'fighter', xp_reward: 25, gold_reward: 3 },
  { name: 'Пустой крестьянин', description: 'Селянин, в чьих глазах остался один лишь голод.', level: 1, max_hp: 26, attack: 8, defense: 3, accuracy: 20, evasion: 5, speed: 6, mana: 0, stamina: 0, class_key: 'fighter', xp_reward: 30, gold_reward: 5 },
  { name: 'Фонарный упырь', description: 'Утонувший моряк, несущий холодное зелёное пламя.', level: 2, max_hp: 34, attack: 11, defense: 4, accuracy: 26, evasion: 8, speed: 7, mana: 20, stamina: 0, class_key: 'wizard', xp_reward: 55, gold_reward: 12 },
  { name: 'Терновый охотник', description: 'Клубок шипастых конечностей, что охотится по запаху.', level: 2, max_hp: 30, attack: 12, defense: 3, accuracy: 28, evasion: 12, speed: 11, mana: 0, stamina: 40, class_key: 'rogue', xp_reward: 55, gold_reward: 8 },
  { name: 'Костяной рыцарь', description: 'Доспех, движимый обидой, всё ещё верный мёртвому сюзерену.', level: 3, max_hp: 52, attack: 15, defense: 8, accuracy: 28, evasion: 6, speed: 7, mana: 0, stamina: 60, class_key: 'fighter', xp_reward: 95, gold_reward: 25 },
  { name: 'Призрак хора', description: 'Хор проклятых, поющий одним сломанным голосом.', level: 3, max_hp: 46, attack: 16, defense: 5, accuracy: 32, evasion: 14, speed: 10, mana: 50, stamina: 0, class_key: 'wizard', xp_reward: 95, gold_reward: 20 },
  { name: 'Колосс костяных полей', description: 'Холм из сросшихся скелетов, что встаёт и идёт.', level: 4, max_hp: 80, attack: 20, defense: 10, accuracy: 30, evasion: 5, speed: 6, mana: 0, stamina: 80, class_key: 'fighter', xp_reward: 150, gold_reward: 45 },
  { name: 'Вестник чумы', description: 'Фигура в балахоне, чьё дыхание обращает плоть в гниль.', level: 4, max_hp: 64, attack: 18, defense: 7, accuracy: 34, evasion: 12, speed: 9, mana: 70, stamina: 0, class_key: 'cleric', xp_reward: 150, gold_reward: 40 },
  { name: 'Хранитель шпиля', description: 'То, что держит дверь Чёрного шпиля запертой.', level: 5, max_hp: 120, attack: 24, defense: 13, accuracy: 34, evasion: 10, speed: 9, mana: 60, stamina: 60, class_key: 'cleric', xp_reward: 260, gold_reward: 90 },
  { name: 'Полый король', description: 'Коронован, восседает и совершенно пуст — если не считать мух.', level: 5, max_hp: 140, attack: 26, defense: 12, accuracy: 36, evasion: 12, speed: 11, mana: 40, stamina: 80, class_key: 'fighter', xp_reward: 320, gold_reward: 150 },
  { name: 'Мясник из Вдовьей рощи', description: 'То, что осталось от лесоруба, когда лес решил ответить.', level: 6, max_hp: 175, attack: 31, defense: 14, accuracy: 37, evasion: 12, speed: 12, mana: 0, stamina: 100, class_key: 'barbarian', xp_reward: 400, gold_reward: 190 },
  { name: 'Плакальщица на костях', description: 'Вдова, что оплакивает всех сразу и никого в отдельности.', level: 6, max_hp: 150, attack: 30, defense: 12, accuracy: 40, evasion: 16, speed: 13, mana: 90, stamina: 0, class_key: 'warlock', xp_reward: 400, gold_reward: 200 },
  { name: 'Ржавый колосс', description: 'Доспех без рыцаря, что научился ходить сам.', level: 7, max_hp: 215, attack: 35, defense: 19, accuracy: 38, evasion: 10, speed: 10, mana: 0, stamina: 120, class_key: 'fighter', xp_reward: 520, gold_reward: 250 },
  { name: 'Триединый утопленник', description: 'Трое, что утонули вместе и с тех пор не расстаются.', level: 7, max_hp: 190, attack: 34, defense: 15, accuracy: 41, evasion: 17, speed: 14, mana: 80, stamina: 0, class_key: 'rogue', xp_reward: 520, gold_reward: 240 },
  { name: 'Пожиратель имён', description: 'Отнимает имя — и ты забываешь, кем был.', level: 8, max_hp: 240, attack: 39, defense: 18, accuracy: 42, evasion: 15, speed: 13, mana: 100, stamina: 0, class_key: 'sorcerer', xp_reward: 700, gold_reward: 320 },
  { name: 'Костяная вдова', description: 'Плетёт гнездо из рёбер в покинутых храмах.', level: 8, max_hp: 210, attack: 38, defense: 16, accuracy: 44, evasion: 20, speed: 15, mana: 0, stamina: 130, class_key: 'ranger', xp_reward: 700, gold_reward: 330 },
  { name: 'Хор безгласых', description: 'Поют без ртов и всё же слышно каждое слово.', level: 9, max_hp: 265, attack: 43, defense: 20, accuracy: 45, evasion: 17, speed: 14, mana: 120, stamina: 0, class_key: 'bard', xp_reward: 900, gold_reward: 400 },
  { name: 'Тлеющий прелат', description: 'Служил богу, которого сожгли вместе с ним.', level: 9, max_hp: 285, attack: 42, defense: 23, accuracy: 43, evasion: 13, speed: 12, mana: 110, stamina: 0, class_key: 'cleric', xp_reward: 900, gold_reward: 420 },
  { name: 'Курганный титан', description: 'Холм, что встал и пошёл, неся на плечах чью-то деревню.', level: 10, max_hp: 360, attack: 48, defense: 26, accuracy: 44, evasion: 11, speed: 11, mana: 0, stamina: 150, class_key: 'barbarian', xp_reward: 1200, gold_reward: 520 },
  { name: 'Пряха судеб', description: 'Пророчит твой конец и терпеливо ждёт, пока он сбудется.', level: 10, max_hp: 320, attack: 47, defense: 22, accuracy: 48, evasion: 19, speed: 15, mana: 140, stamina: 0, class_key: 'warlock', xp_reward: 1200, gold_reward: 540 },
  { name: 'Архивариус костей', description: 'Записывает смерть каждого. Твою — тоже, заранее.', level: 11, max_hp: 400, attack: 53, defense: 26, accuracy: 49, evasion: 18, speed: 14, mana: 150, stamina: 0, class_key: 'wizard', xp_reward: 1500, gold_reward: 650 },
  { name: 'Раздутый святой', description: 'Святость переполнила его и продолжает расти.', level: 11, max_hp: 440, attack: 52, defense: 30, accuracy: 46, evasion: 13, speed: 12, mana: 130, stamina: 0, class_key: 'paladin', xp_reward: 1500, gold_reward: 670 },
  { name: 'Оскал пустоты', description: 'Дыра в мире, у которой выросли зубы.', level: 12, max_hp: 470, attack: 58, defense: 27, accuracy: 52, evasion: 22, speed: 16, mana: 0, stamina: 170, class_key: 'monk', xp_reward: 1900, gold_reward: 800 },
  { name: 'Госпожа увядания', description: 'Всё, к чему она прикоснётся, вспоминает, что когда-то было живым.', level: 12, max_hp: 430, attack: 57, defense: 25, accuracy: 53, evasion: 21, speed: 16, mana: 160, stamina: 0, class_key: 'druid', xp_reward: 1900, gold_reward: 820 },
  { name: 'Гробоглазый', description: 'Глаза — как крышки гробов, и он никогда их не закрывает.', level: 13, max_hp: 540, attack: 64, defense: 31, accuracy: 54, evasion: 20, speed: 15, mana: 170, stamina: 0, class_key: 'sorcerer', xp_reward: 2400, gold_reward: 1000 },
  { name: 'Венец из праха', description: 'Корона, что пережила всех своих носителей.', level: 13, max_hp: 580, attack: 63, defense: 34, accuracy: 51, evasion: 15, speed: 13, mana: 150, stamina: 0, class_key: 'paladin', xp_reward: 2400, gold_reward: 1050 },
  { name: 'Длань забвения', description: 'Касается — и ты уже не помнишь, зачем пришёл сюда.', level: 14, max_hp: 660, attack: 70, defense: 35, accuracy: 57, evasion: 24, speed: 17, mana: 180, stamina: 0, class_key: 'warlock', xp_reward: 3000, gold_reward: 1300 },
  { name: 'Тень мёртвого бога', description: 'То, что осталось от божества, когда его перестали помнить.', level: 14, max_hp: 620, attack: 69, defense: 33, accuracy: 58, evasion: 23, speed: 17, mana: 170, stamina: 0, class_key: 'cleric', xp_reward: 3000, gold_reward: 1350 },
  { name: 'Костяной Пастырь', description: 'Собирает павших в стада и гонит их по царству мёртвых. Он держит ключ от каждого возвращения.', level: 15, max_hp: 900, attack: 78, defense: 40, accuracy: 60, evasion: 26, speed: 18, mana: 200, stamina: 180, class_key: 'warlock', xp_reward: 5000, gold_reward: 2000 },
];

const SPAWNS = {
  'Плачущая низина': ['Могильная крыса', 'Пустой крестьянин', 'Терновый охотник'],
  'Утонувшая дорога': ['Пустой крестьянин', 'Могильная крыса', 'Фонарный упырь'],
  'Пепельный лес': ['Терновый охотник', 'Пустой крестьянин', 'Призрак хора', 'Мясник из Вдовьей рощи'],
  'Пещеры, изгрызенные приливом': ['Фонарный упырь', 'Костяной рыцарь', 'Могильная крыса', 'Триединый утопленник', 'Костяная вдова'],
  'Затонувшая часовня': ['Фонарный упырь', 'Призрак хора', 'Вестник чумы', 'Плакальщица на костях', 'Хор безгласых', 'Тлеющий прелат'],
  'Костяные поля': ['Костяной рыцарь', 'Колосс костяных полей', 'Призрак хора', 'Ржавый колосс', 'Костяная вдова', 'Курганный титан', 'Архивариус костей'],
  'Чёрный шпиль': ['Хранитель шпиля', 'Полый король', 'Колосс костяных полей', 'Пожиратель имён', 'Раздутый святой', 'Оскал пустоты', 'Госпожа увядания', 'Гробоглазый', 'Венец из праха', 'Длань забвения', 'Тень мёртвого бога'],
};

// The death-realm boss is never spawned on the map: it is reachable only
// through a resurrection ritual (see services/resurrections.js).
const DEATH_REALM_BOSS = 'Костяной Пастырь';


// Existing databases predate the map columns; fill them in from the source
// world definition without touching anything the player has changed.
function backfillMap() {
  const rows = WORLD.flatMap((c) => c.regions).flatMap((r) => r.locations);
  transaction((d) => {
    const stmt = d.prepare('UPDATE locations SET map_x=?, map_y=?, scene=?, biome=? WHERE name=?');
    rows.forEach((l) => stmt.run(l.x ?? null, l.y ?? null, l.scene ?? null, l.biome ?? null, l.name));
  });
}

// New waves add places to Мордрат. An existing database predates them, so
// insert anything missing by name into its region and lay its roads, without
// touching rows that already exist. Coordinates come from the seed, so a
// re-layout reaches the live DB as well.
function backfillLocations() {
  const d = getDb();
  const have = new Set(d.prepare('SELECT name FROM locations').all().map((r) => r.name));
  const insLoc = d.prepare('INSERT INTO locations (region_id, name, description, danger, is_safe, sort_order, map_x, map_y, scene, biome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insConn = d.prepare('INSERT OR IGNORE INTO connections (from_id, to_id, label, minutes) VALUES (?, ?, ?, ?)');
  const regionId = (continent, region) => d.prepare(
    `SELECT r.id FROM regions r JOIN continents c ON c.id = r.continent_id WHERE c.name = ? AND r.name = ?`,
  ).get(continent, region)?.id;
  const locRow = (name) => d.prepare('SELECT * FROM locations WHERE name = ?').get(name);
  const all = WORLD.flatMap((c) => c.regions).flatMap((r) => r.locations);

  transaction(() => {
    WORLD.forEach((c) => c.regions.forEach((r) => {
      const rid = regionId(c.name, r.name);
      if (!rid) return;
      r.locations.forEach((l, li) => {
        if (have.has(l.name)) return;
        insLoc.run(rid, l.name, l.description, l.danger, l.safe ? 1 : 0, li, l.x ?? null, l.y ?? null, l.scene ?? null, l.biome ?? null);
      });
    }));
    // Lay every declared road both ways; INSERT OR IGNORE keeps existing ones.
    all.forEach((l) => {
      const from = locRow(l.name);
      if (!from) return;
      for (const target of l.connects || []) {
        const to = locRow(target);
        if (!to) continue;
        const minutes = travelMinutes({
          from: { x: l.x, y: l.y, biome: l.biome, danger: l.danger },
          to: { x: to.map_x, y: to.map_y, biome: to.biome, danger: to.danger },
        });
        insConn.run(from.id, to.id, `Дорога к ${to.name}`, minutes);
        insConn.run(to.id, from.id, `Дорога к ${from.name}`, minutes);
      }
    });
  });
}

// Travel time is derived from the drawn map, so it is recomputed (not stored in
// the world definition) and written for every road, including old databases.
function backfillTravel() {
  const d = getDb();
  const rows = d.prepare(
    `SELECT c.id, a.map_x ax, a.map_y ay, a.biome ab, a.danger ad,
            b.map_x bx, b.map_y by, b.biome bb, b.danger bd
     FROM connections c
     JOIN locations a ON a.id = c.from_id
     JOIN locations b ON b.id = c.to_id`,
  ).all();
  const upd = d.prepare('UPDATE connections SET minutes = ? WHERE id = ?');
  transaction(() => {
    rows.forEach((r) => {
      const minutes = travelMinutes({
        from: { x: r.ax, y: r.ay, biome: r.ab, danger: r.ad },
        to: { x: r.bx, y: r.by, biome: r.bb, danger: r.bd },
      });
      upd.run(minutes, r.id);
    });
  });
}

// New waves add monsters and spawn links. Existing databases predate them, so
// insert anything missing by name without disturbing existing rows.
function backfillMonsters() {
  const d = getDb();
  const have = new Set(d.prepare('SELECT name FROM monsters').all().map((r) => r.name));
  const locId = (name) => d.prepare('SELECT id FROM locations WHERE name = ?').get(name)?.id;
  const insMonster = d.prepare(
    `INSERT INTO monsters (name, description, level, max_hp, attack, defense, accuracy, evasion, speed, mana, stamina, class_key, xp_reward, gold_reward)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insSpawn = d.prepare('INSERT OR IGNORE INTO location_monsters (location_id, monster_id, weight) VALUES (?, ?, ?)');
  transaction(() => {
    for (const m of MONSTERS) {
      if (have.has(m.name)) continue;
      insMonster.run(m.name, m.description, m.level, m.max_hp, m.attack, m.defense, m.accuracy, m.evasion, m.speed, m.mana, m.stamina, m.class_key, m.xp_reward, m.gold_reward);
    }
    const ids = new Map(d.prepare('SELECT id, name FROM monsters').all().map((r) => [r.name, r.id]));
    for (const [locName, names] of Object.entries(SPAWNS)) {
      const lid = locId(locName);
      if (!lid) continue;
      names.forEach((n, i) => { const mid = ids.get(n); if (mid) insSpawn.run(lid, mid, Math.max(1, 5 - i)); });
    }
  });
}

export function seedWorld() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) AS n FROM continents').get().n;
  if (existing > 0) {
    backfillLocations();
    backfillMap();
    backfillTravel();
    backfillMonsters();
    return { skipped: true };
  }

  transaction((d) => {
    const insContinent = d.prepare('INSERT INTO continents (name, description, sort_order) VALUES (?, ?, ?)');
    const insRegion = d.prepare('INSERT INTO regions (continent_id, name, description, sort_order) VALUES (?, ?, ?, ?)');
    const insLocation = d.prepare('INSERT INTO locations (region_id, name, description, danger, is_safe, sort_order, map_x, map_y, scene, biome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insConn = d.prepare('INSERT OR IGNORE INTO connections (from_id, to_id, label) VALUES (?, ?, ?)');
    const insMonster = d.prepare(
      `INSERT INTO monsters (name, description, level, max_hp, attack, defense, accuracy, evasion, speed, mana, stamina, class_key, xp_reward, gold_reward)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insSpawn = d.prepare('INSERT OR IGNORE INTO location_monsters (location_id, monster_id, weight) VALUES (?, ?, ?)');

    const locIds = new Map();
    WORLD.forEach((c, ci) => {
      const cid = insContinent.run(c.name, c.description, ci).lastInsertRowid;
      c.regions.forEach((r, ri) => {
        const rid = insRegion.run(cid, r.name, r.description, ri).lastInsertRowid;
        r.locations.forEach((l, li) => {
          const lid = insLocation.run(rid, l.name, l.description, l.danger, l.safe ? 1 : 0, li, l.x ?? null, l.y ?? null, l.scene ?? null, l.biome ?? null).lastInsertRowid;
          locIds.set(l.name, lid);
        });
      });
    });

    WORLD.flatMap((c) => c.regions).flatMap((r) => r.locations).forEach((l) => {
      (l.connects || []).forEach((target) => {
        const from = locIds.get(l.name); const to = locIds.get(target);
        if (from && to) { insConn.run(from, to, `Дорога к ${target}`); insConn.run(to, from, `Дорога к ${l.name}`); }
      });
    });

    const monIds = new Map();
    MONSTERS.forEach((m) => {
      const mid = insMonster.run(m.name, m.description, m.level, m.max_hp, m.attack, m.defense, m.accuracy, m.evasion, m.speed, m.mana, m.stamina, m.class_key, m.xp_reward, m.gold_reward).lastInsertRowid;
      monIds.set(m.name, mid);
    });

    Object.entries(SPAWNS).forEach(([locName, names]) => {
      const lid = locIds.get(locName);
      if (!lid) return;
      names.forEach((n, i) => { const mid = monIds.get(n); if (mid) insSpawn.run(lid, mid, Math.max(1, 5 - i)); });
    });
  });
  backfillTravel();
  return { continents: WORLD.length, monsters: MONSTERS.length };
}
