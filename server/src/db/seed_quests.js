import { getDb, transaction } from './index.js';

// Quests (Wave G8). The content is canon: docs/lore/quests.md (prologue +
// chapters 1-3) and docs/lore/campaign.md. This file only seeds that content;
// accepting, tracking and rewarding live in services/quests.js.
//
// Stable keys stay Latin (`key`, `source`, `giver`, objective `type`/`target`,
// reward `item`/`unlock`); everything a player reads (`title`, `text`) is Russian.
//
// A quest is:
//   {
//     key,          // latin, stable id
//     source,       // guild | tavern | temple | library | npc | story
//     giver,        // NPC key, building key, or 'settlementKey:buildingKey'
//     chapter,      // 0 = prologue, 1..3 = the opening chapters
//     title, text,  // Russian
//     objective,    // { type, target, count, item? }
//     reward,       // { gold?, xp?, item?, opinion?, unlock? }
//     requires,     // quest keys that must be completed first
//     story,        // true = a key quest that can never be permanently failed
//   }
//
// Objective types (docs/lore/quests.md): kill | visit | collect | deliver |
// talk | survive | revive | no_steel.
// Reward fields: gold | xp | item (a G2 key) | opinion (giver's Δ) | unlock (a
// progress flag, e.g. a location or chapter gate).

// The quest sources the spec names. `icon` maps to an existing CC BY 3.0
// landmark SVG (client/public/art/landmarks) — no new art, no rasters.
export const QUEST_SOURCES = {
  guild: { label: 'Гильдия', icon: 'guarded_tower' },
  tavern: { label: 'Таверна', icon: 'campfire' },
  temple: { label: 'Храм', icon: 'church' },
  library: { label: 'Библиотека', icon: 'ancient_columns' },
  npc: { label: 'Просьба', icon: 'crossroads' },
  story: { label: 'Сюжет', icon: 'black_spire' },
};

export const OBJECTIVE_TYPES = {
  kill: 'Убить',
  visit: 'Посетить',
  collect: 'Собрать',
  deliver: 'Отнести',
  talk: 'Поговорить',
  survive: 'Выжить',
  revive: 'Воскресить',
  no_steel: 'Без стали',
};

// Key story quests (docs/lore/quests.md). They cannot be failed for good: a
// failure sends them back to the pool.
export const STORY_QUESTS = new Set([
  'prologue_name', 'first_revival', 'bone_records', 'spire_permission',
]);

// Opinion a giver loses when a side quest is failed.
export const SIDE_FAIL_OPINION = -5;

export const QUEST_DEFS = [
  // --- Глава 0 — Пролог (Перекрёсток висельников) ---------------------------
  {
    key: 'prologue_name',
    source: 'npc', giver: 'hangman_keeper', chapter: 0,
    title: 'Книга с чужим именем',
    text: 'Кто-то снял с мертвеца сапоги и оставил ему имя. Верни имя — сапоги оставь себе.',
    objective: { type: 'talk', target: 'hangman_keeper', count: 1 },
    reward: { gold: 20, xp: 50 },
    requires: [],
  },
  {
    key: 'prologue_water',
    source: 'npc', giver: 'sister_maeve', chapter: 0,
    title: 'Дойти до воды',
    text: '«Что забрали, то море отдаст», — говорит Мэйв. Иди к Сумеречной гавани и слушай.',
    objective: { type: 'visit', target: 'Сумеречная гавань', count: 1 },
    reward: { xp: 30, opinion: 5 },
    requires: [],
  },
  {
    key: 'prologue_first_ally',
    source: 'tavern', giver: 'salt_ford_village:tavern', chapter: 0,
    title: 'Первый спутник',
    text: 'Одному в Мордрате не выжить. Найми кого-нибудь, кто прикроет спину.',
    objective: { type: 'collect', target: 'companion', count: 1 },
    reward: { xp: 40 },
    requires: [],
  },

  // --- Глава 1 — «Что море отдаёт» ------------------------------------------
  {
    key: 'ferry_debt',
    source: 'npc', giver: 'marsh_ferryman', chapter: 1,
    title: 'Долг паромщика',
    text: 'Гриб перевозит через гать за плату — живую или мёртвую. Заплати, чем сможешь.',
    objective: { type: 'talk', target: 'marsh_ferryman', count: 1 },
    reward: { unlock: 'drowned_road' },
    requires: ['prologue_water'],
  },
  {
    key: 'broker_ledger',
    source: 'guild', giver: 'harbor_broker', chapter: 1,
    title: 'Обломки для брокера',
    text: 'Сарн покупает всё, что море вынесет. Три обломка — и он замолвит слово.',
    objective: { type: 'collect', target: 'tide_shard', count: 3 },
    reward: { gold: 60, xp: 80 },
    requires: ['prologue_water'],
  },
  {
    key: 'hermit_bones',
    source: 'npc', giver: 'tide_hermit', chapter: 1,
    title: 'Кости прилива',
    text: 'Клайв просит отогнать тварей от костяной кучи. Он отдаст то, что море вернуло.',
    objective: { type: 'kill', target: 'Костяной рыцарь', count: 2 },
    reward: { item: 'shepherd_key' },
    requires: ['ferry_debt'],
  },
  {
    key: 'tide_relic',
    source: 'temple', giver: 'chapel_ghost', chapter: 1,
    title: 'Украденная реликвия',
    text: 'Хор поёт о реликвии, что унесла вода. Верни её — и часовня снова заговорит.',
    objective: { type: 'kill', target: 'Плакальщица на костях', count: 1 },
    reward: { xp: 100, item: 'pale_lantern' },
    requires: ['hermit_bones'],
  },

  // --- Глава 2 — «Часовня, что утонула вместе со стадом» ---------------------
  {
    key: 'chapel_song',
    source: 'temple', giver: 'chapel_ghost', chapter: 2,
    title: 'Песня утонувшей часовни',
    text: 'Спой с Хором — без слов, как поют утонувшие. Только так ты поймёшь врата.',
    objective: { type: 'talk', target: 'chapel_ghost', count: 1 },
    reward: { unlock: 'chapel_gate' },
    requires: ['tide_relic'],
  },
  {
    key: 'first_revival',
    source: 'story', giver: 'chapel_ghost', chapter: 2,
    title: 'Первое возвращение',
    text: 'Врата открыты. Войди в царство мёртвых и выведи оттуда первого павшего.',
    objective: { type: 'revive', target: 'companion', count: 1 },
    reward: { xp: 150, item: 'shepherd_crook' },
    requires: ['chapel_song'],
  },
  {
    key: 'plague_answer',
    source: 'story', giver: null, chapter: 2,
    title: 'Счёт за воскрешение',
    text: 'За возвращение пришёл счёт: Вестник чумы, посланный культом Пастыря.',
    objective: { type: 'kill', target: 'Вестник чумы', count: 1 },
    reward: { gold: 120, xp: 200 },
    requires: ['first_revival'],
  },

  // --- Глава 3 — «Пепел помнит войну» ----------------------------------------
  {
    key: 'fog_medicine',
    source: 'npc', giver: 'fog_widow', chapter: 3,
    title: 'Туман как лекарство',
    text: 'Измора продаёт туман низины — как лекарство и как яд. Принеси ей две фляги.',
    objective: { type: 'deliver', target: 'fog_widow', item: 'clean_water', count: 2 },
    reward: { gold: 50 },
    requires: [],
  },
  {
    key: 'ash_forest_oath',
    source: 'npc', giver: 'ash_druid', chapter: 3,
    title: 'Клятва без стали',
    text: 'Друид Пепельного леса не доверяет стали. Пройди лес, не подняв оружия.',
    objective: { type: 'no_steel', target: 'Пепельный лес', count: 1 },
    reward: { xp: 100, opinion: 5 },
    requires: [],
  },
  {
    key: 'bone_records',
    source: 'library', giver: 'bonepicker', chapter: 3,
    title: 'Запись о Пепельной войне',
    text: 'Костогрыз разбирает костяные холмы и находит то, что война должна была стереть.',
    objective: { type: 'kill', target: 'Колосс костяных полей', count: 2 },
    reward: { xp: 200, unlock: 'ash_war_truth' },
    requires: ['plague_answer'],
  },
  {
    key: 'spire_permission',
    source: 'guild', giver: 'spire_warden', chapter: 3,
    title: 'Допуск к шпилю',
    text: 'Смотритель не пускает к игле. Докажи, что ты наполовину полый, — и он отступит.',
    objective: { type: 'talk', target: 'spire_warden', count: 1 },
    reward: { unlock: 'spire_approach' },
    requires: ['bone_records'],
  },
];

// A quest is a key quest (never permanently failed) if it is listed in the
// content spec OR the seed marked it as one.
export function isStoryQuest(def) {
  return !!def && (STORY_QUESTS.has(def.key) || def.source === 'story');
}

// Insert any quest from the content list that is not in the database yet. Safe
// to run on every boot: it only adds, never overwrites or duplicates.
export function seedQuests() {
  const db = getDb();
  const existing = new Set(db.prepare('SELECT key FROM quests').all().map((r) => r.key));
  const missing = QUEST_DEFS.filter((q) => !existing.has(q.key));
  if (!missing.length) return { skipped: true };

  transaction((d) => {
    const ins = d.prepare(
      `INSERT OR IGNORE INTO quests
         (key, source, giver, chapter, title, text, objective, reward, requires, story, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    QUEST_DEFS.forEach((q, i) => {
      if (existing.has(q.key)) return;
      ins.run(
        q.key, q.source, q.giver ?? null, q.chapter ?? 0, q.title, q.text ?? '',
        JSON.stringify(q.objective || {}), JSON.stringify(q.reward || {}),
        JSON.stringify(q.requires || []), isStoryQuest(q) ? 1 : 0, i,
      );
    });
  });
  return { added: missing.length };
}

export const questByKey = (key) => QUEST_DEFS.find((q) => q.key === key) || null;
