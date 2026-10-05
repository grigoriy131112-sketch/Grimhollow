// Campaign progress (Wave G11). Pure rules only: the chapter-flag table, what
// each flag unlocks, and the ending resolver. No I/O, so the flag logic and the
// three endings can be unit-tested directly.
//
// Canon: docs/lore/campaign_progress.md and docs/lore/campaign.md. The campaign
// is a set of chapter flags that tie the waves into one story; the final chapter
// is the Black Spire, where the Костяной Пастырь must be overcome (not killed)
// and one of three endings is chosen by flags and the clan doctrine.

// Flags in story order. Keys stay Latin; everything a player reads is Russian.
export const FLAG_ORDER = [
  'prologue_done',
  'chapel_opened',
  'war_truth',
  'north_frozen',
  'memory_bought',
  'world_woken',
  'clan_founded',
];

// The chapter-flag table from docs/lore/campaign_progress.md.
//
//   flag            chapter  condition                       unlocks
//   prologue_done   0        the first companion is found    access to the ritual
//   chapel_opened   2        the first revival ritual done   the northern road
//   war_truth       3        the Ash-War record is found     the spire approaches
//   north_frozen    4        the Cradle branch is finished   "thawing"
//   memory_bought   5        memory bought in Kor-Ashan      the king's secret
//   world_woken     6        alliance with the Forest        "wake the world"
//   clan_founded    7        the clan is founded             the finale opens
//
// `quests` names the G8 quest keys whose completion derives the flag (G11 reads
// G8 completions rather than duplicating quest logic). A flag with no quests is
// set by another wave (the clan of G9, the northern/memory branches) or reported
// by hand. `source` is where a derived flag comes from.
export const FLAG_DEFS = {
  prologue_done: {
    flag: 'prologue_done', chapter: 0, title: 'Пролог',
    condition: 'Найден первый спутник',
    unlocks: 'Доступ к ритуалу воскрешения',
    icon: 'crossroads',
    source: 'quest',
    quests: ['prologue_name', 'prologue_water', 'prologue_first_ally'],
  },
  chapel_opened: {
    flag: 'chapel_opened', chapter: 2, title: 'Часовня, что утонула вместе со стадом',
    condition: 'Пройден ритуал первого воскрешения',
    unlocks: 'Северный путь',
    icon: 'church',
    source: 'quest',
    quests: ['chapel_song', 'first_revival', 'plague_answer'],
  },
  war_truth: {
    flag: 'war_truth', chapter: 3, title: 'Пепел помнит войну',
    condition: 'Найдена запись о Пепельной войне',
    unlocks: 'Подступы к Чёрному шпилю',
    icon: 'dead_wood',
    source: 'quest',
    quests: ['bone_records'],
  },
  north_frozen: {
    flag: 'north_frozen', chapter: 4, title: 'Заморозить, чтобы помнить',
    condition: 'Завершена ветка Морозной Колыбели',
    unlocks: 'Способ «оттаивания»',
    icon: 'guarded_tower',
    source: 'branch',
    quests: [],
  },
  memory_bought: {
    flag: 'memory_bought', chapter: 5, title: 'Память на продажу',
    condition: 'Куплена память в Кор-Ашане',
    unlocks: 'Разгадка о короле',
    icon: 'ancient_columns',
    source: 'branch',
    quests: [],
  },
  world_woken: {
    flag: 'world_woken', chapter: 6, title: 'Лес, который помнит всё',
    condition: 'Союз с Зелёным Пределом',
    unlocks: 'Способ «разбудить мир»',
    icon: 'forest',
    source: 'branch',
    quests: [],
  },
  clan_founded: {
    flag: 'clan_founded', chapter: 7, title: 'Гавани собирают флот',
    condition: 'Основан клан',
    unlocks: 'Финал открыт',
    icon: 'harbor',
    source: 'clan',
    quests: [],
  },
};

// The four clan doctrines (docs/lore/clan.md) and the ending each one tilts
// toward. `null` means the doctrine is neutral for the finale.
export const CLAN_DOCTRINES = {
  chroniclers: { key: 'chroniclers', name: 'Летописцы', idea: 'записывать имена', ending: 'restore' },
  thaw: { key: 'thaw', name: 'Оттепель', idea: 'возвращать воспоминания', ending: 'restore' },
  silent: { key: 'silent', name: 'Молчальники', idea: 'хранить тайны', ending: null },
  shepherds: { key: 'shepherds', name: 'Пастухи', idea: 'принять забвение', ending: 'hollow_king' },
};

export const doctrineInfo = (key) => CLAN_DOCTRINES[key] || null;

// The finale gate: the Black Spire opens only with the war truth and a founded
// clan. `war_truth` is also what unlocks the spire approaches (see FLAG_DEFS).
// The boss is the off-map Костяной Пастырь — the same lord of the dead the
// ritual fights — and his crook is the final trophy.
export const FINAL_BATTLE_KIND = 'campaign_final';
export const FINAL_BOSS = 'Костяной Пастырь';
export const FINAL_TROPHY = 'shepherd_crook';
export const FINAL_LOCATION = 'Чёрный шпиль';

// The G8 unlock that opens the road to the Spire. The campaign gate requires it
// too, so the approach is earned through quests (spire_permission), not assumed.
export const SPIRE_UNLOCK = 'spire_approach';

export function finalGateStatus(flags = {}) {
  const has = (f) => !!flags[f];
  const requirements = [
    { key: 'war_truth', label: 'Найдена запись о Пепельной войне', met: has('war_truth') },
    { key: 'clan_founded', label: 'Клан основан', met: has('clan_founded') },
  ];
  return {
    ready: requirements.every((r) => r.met),
    requirements,
    missing: requirements.filter((r) => !r.met).map((r) => r.key),
  };
}

// Which flags are derived from a set of completed quest keys. A flag is derived
// once every quest the table lists for it is done. Pure: the service passes the
// G8 completions in.
export function derivedFlags(completedKeys = []) {
  const done = new Set(completedKeys);
  const derived = {};
  for (const flag of FLAG_ORDER) {
    const def = FLAG_DEFS[flag];
    if (def.quests.length && def.quests.every((q) => done.has(q))) derived[flag] = true;
  }
  return derived;
}

// The chapter view the UI renders: every flag in order with whether it is met.
export function flagStatuses(flags = {}) {
  return FLAG_ORDER.map((flag) => {
    const def = FLAG_DEFS[flag];
    return { ...def, met: !!flags[flag] };
  });
}

// --- the three endings ------------------------------------------------------

// One entry per ending from docs/lore/campaign_progress.md.
//   restore     — available with world_woken OR north_frozen; strengthened by
//                 the Летописцы/Оттепель doctrine and the Forest.
//   freeze      — available with north_frozen; strengthened by the Archives.
//   hollow_king — available with memory_bought AND the Пастухи doctrine.
export const ENDINGS = {
  restore: {
    key: 'restore', name: 'Вернуть память', icon: 'church',
    description: 'Мир вспоминает всё, включая зло. Мордрат возрождается — но и старая война тоже. Горькая надежда.',
    anyOfFlags: ['world_woken', 'north_frozen'],
    strengthens: { doctrines: ['chroniclers', 'thaw'], factions: ['forest'] },
  },
  freeze: {
    key: 'freeze', name: 'Заморозить', icon: 'guarded_tower',
    description: 'Забвение остановлено, но мир остаётся в вечном холоде, и герой — его архивариус. Холодный покой.',
    allOfFlags: ['north_frozen'],
    strengthens: { doctrines: ['silent'], factions: ['archives'] },
  },
  hollow_king: {
    key: 'hollow_king', name: 'Стать Полым королём', icon: 'black_spire',
    description: 'Герой забирает забвение в себя, становится новым шпилем и правит. Власть — но он теряет себя окончательно.',
    allOfFlags: ['memory_bought'],
    allOfDoctrines: ['shepherds'],
    strengthens: { doctrines: ['shepherds'], factions: [] },
  },
};

export const ENDING_ORDER = ['restore', 'freeze', 'hollow_king'];
export const ENDING_NONE = { key: 'none', name: 'Ещё не решено', description: 'Ни одна концовка пока не открыта: герой не дошёл до выбора.' };

const hasAll = (flags, keys) => (keys || []).every((k) => !!flags[k]);
const hasAny = (flags, keys) => (keys || []).some((k) => !!flags[k]);
const opinionOf = (factionOpinions, key) => (factionOpinions && Number.isFinite(factionOpinions[key]) ? factionOpinions[key] : 50);

// Availability of each ending under the current state, with an honest score so
// the strongest (most committed) path wins. Pure and deterministic.
export function endingCandidates({ flags = {}, doctrine = null, factionOpinions = {} } = {}) {
  const out = {};
  for (const key of ENDING_ORDER) {
    const def = ENDINGS[key];
    const flagsOk = def.anyOfFlags ? hasAny(flags, def.anyOfFlags) : hasAll(flags, def.allOfFlags || []);
    const doctrineOk = hasAll({ [doctrine]: doctrine }, def.allOfDoctrines);
    const available = flagsOk && doctrineOk;

    const reasons = [];
    let score = 0;
    if (available) {
      score = 10;
      // Every satisfied flag adds weight, so two paths beat one.
      const satisfied = (def.anyOfFlags || def.allOfFlags || []).filter((f) => flags[f]);
      score += satisfied.length * 2;
      if (satisfied.length) reasons.push(`флаги: ${satisfied.join(', ')}`);
      // A matching doctrine strengthens the path.
      if (def.strengthens.doctrines.includes(doctrine)) {
        score += 4;
        reasons.push(`уклон клана: ${doctrineInfo(doctrine).name}`);
      }
      // A warm faction strengthens it too.
      for (const faction of def.strengthens.factions) {
        if (opinionOf(factionOpinions, faction) >= 60) {
          score += 3;
          reasons.push(`союз: ${faction}`);
        }
      }
    }
    out[key] = { ...def, available, score, reasons };
  }
  return out;
}

// Resolve the single ending the current state produces, or `none` when the hero
// has not opened any path. Ties break by ENDING_ORDER (restore, then freeze,
// then the dark path) — the committed dark path scores higher by design, so a
// Пастухи clan with a bought memory reaches Стать Полым королём.
export function resolveEnding(ctx = {}) {
  const candidates = endingCandidates(ctx);
  const available = ENDING_ORDER.map((k) => candidates[k]).filter((c) => c.available);
  if (!available.length) return { ...ENDING_NONE, score: 0, reasons: [] };
  available.sort((a, b) => b.score - a.score || ENDING_ORDER.indexOf(a.key) - ENDING_ORDER.indexOf(b.key));
  const best = available[0];
  return { key: best.key, name: best.name, description: best.description, icon: best.icon, score: best.score, reasons: best.reasons };
}

// --- epilogues --------------------------------------------------------------

// The named voices that get one epitaph line, with the NPC key they read their
// opinion from. Мэйв, Гриб and Оден are the "one warm line" the spec asks for.
export const EPILOGUE_VOICES = [
  { key: 'oden', npc: 'hangman_keeper', name: 'Могильщик Оден', warm: true },
  { key: 'maeve', npc: 'sister_maeve', name: 'Сестра Мэйв', warm: true },
  { key: 'grib', npc: 'marsh_ferryman', name: 'Паромщик Гриб', warm: true },
  { key: 'choir', npc: 'chapel_ghost', name: 'Хор Утонувшей часовни' },
  { key: 'warden', npc: 'spire_warden', name: 'Смотритель шпиля' },
  { key: 'forest', npc: 'ash_druid', name: 'Пепельный друид' },
];

const EPILOGUE_TITLES = {
  restore: 'Мир вспоминает',
  freeze: 'Вечный холод',
  hollow_king: 'Новый шпиль',
  none: 'Пока не решено',
};

const EPILOGUE_THEME = {
  restore: 'Имена вернулись — все сразу, и добрые, и страшные. Пепельная война встаёт из забвения вместе с теми, кто её начал.',
  freeze: 'Забвение остановлено льдом. Ничто больше не тает и не забывается — но и не живёт.',
  hollow_king: 'Забвение нашло нового хозяина. Герой стал шпилем, и мир склонился перед пустотой.',
  none: 'Выбор ещё не сделан; шпиль гудит и ждёт.',
};

// One line per voice, warm (opinion >= 60) or cold. The warm lines are the one
// bright note the spec keeps in an otherwise grim epilogue.
const VOICE_EPILOGUE = {
  oden: {
    warm: 'Оден вписывает имя героя в сальную книгу — уже его собственной рукой.',
    cold: 'Оден закрывает книгу, не найдя там ни одного знакомого имени.',
  },
  maeve: {
    warm: 'Мэйв ставит свечу за того, кто вернулся и всё же остался безымянным.',
    cold: 'Мэйв молится в пустой часовне — и не помнит, за кого.',
  },
  grib: {
    warm: 'Гриб перевозит героя через гать и не берёт платы: «За такое не платят».',
    cold: 'Гриб перевозит молча, глядя мимо, будто в лодке никого нет.',
  },
  choir: {
    warm: 'Хор поёт одно-единственное имя — и оно наконец держится.',
    cold: 'Хор поёт, но слов больше нет: одно дыхание без памяти.',
  },
  warden: {
    warm: 'Смотритель отступает от двери и впервые за век опускает взгляд.',
    cold: 'Смотритель снова запирает дверь и возвращается в тень иглы.',
  },
  forest: {
    warm: 'Пепельный лес выпускает один зелёный побег — и помнит, чей он.',
    cold: 'Пепельный лес молчит; обугленные ветви не помнят даже огня.',
  },
};

function heroLine(ctx) {
  const name = (ctx.heroName || '').trim();
  return name
    ? `Героя называют так, как он назвал себя сам: ${name}.`
    : 'У героя так и нет имени; в эпитафии он — просто Полый.';
}

function companionLine(ctx) {
  const living = ctx.living || [];
  const fallen = ctx.fallen || [];
  if (fallen.length) {
    return `Возвращённые идут рядом (${living.length}); кого не вернули — ${fallen.map((m) => m.name).join(', ')}.`;
  }
  if (living.length) return `Отряд цел: ${living.map((m) => m.name).join(', ')}.`;
  return 'Герой выходит из шпиля один.';
}

// A short set of epitaph lines: the ending's theme, the hero's naming, who
// survived, and one line per named voice. Pure — the service supplies the names.
export function buildEpilogue(ctx = {}, endingKey = 'none') {
  const key = EPILOGUE_TITLES[endingKey] ? endingKey : 'none';
  const lines = [
    EPILOGUE_THEME[key],
    heroLine(ctx),
    companionLine(ctx),
  ];
  const voices = EPILOGUE_VOICES.map((v) => {
    const opinion = opinionOf(ctx.factionOpinions, v.key);
    const tone = opinion >= 60 ? 'warm' : 'cold';
    return { key: v.key, name: v.name, tone, opinion, text: VOICE_EPILOGUE[v.key][tone] };
  });
  return {
    ending: key,
    title: EPILOGUE_TITLES[key],
    lines,
    voices,
    warmLines: voices.filter((v) => v.tone === 'warm').length,
  };
}
