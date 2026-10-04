# Grimhollow

A dark-fantasy, classic D&D-flavoured browser RPG. Node/Express + SQLite API
with a React (Vite) client.

## Layout

- `server/` — Express API, game engine, SQLite storage.
  - `src/game/` — pure rules: `classes.js`, `rules.js`, `combat.js`.
  - `src/db/` — `schema.sql`, connection (`index.js`), world seed (`seed.js`).
  - `src/services/` — persistence + orchestration (`characters`, `world`, `battles`).
  - `src/routes/` — HTTP layer.
  - `test/` — `node:test` suites.
- `client/` — React + Vite SPA (`src/pages`, `src/api.js`, `src/icons.jsx`).
  - `public/art/` — CC BY 3.0 icons from game-icons.net (see `CREDITS.txt`).

## Commands

```bash
npm install                 # installs server + client workspaces
npm run dev                 # server (3001) + vite (5173) together
npm test                    # server test suite (node --test)
npm run build               # build the client into client/dist
npm start                   # run the API, serving client/dist if built
```

## Game design rules (locked)

- Combat is **diceless**: an ability shows an honest hit % (accuracy vs evasion)
  and a damage estimate. No dice rolls are shown to the player.
- Resources are **mana** and **stamina**; both regenerate a little on the
  owner's turn (`MANA_REGEN` / `STAMINA_REGEN` in `game/combat.js`).
- **Speed** decides turn order; there are no extra turns.
- **Defeat is survivable**: the hero keeps 1 HP and loses 25% of their gold
  (`DEFEAT_GOLD_PENALTY` in `services/battles.js`).
- Every class has **5 levels**; each level unlocks **2 abilities** and raises
  HP/mana (plus per-class growth in `game/classes.js`). There are **12 classes**
  (the D&D set).
- XP comes from quests (future), battles, and exploration (future).

## Content language

- All player-visible text is **Russian** (class/monster/location names, ability
  names and descriptions, combat log, UI labels, error messages).
- Stable keys stay **Latin**: class `key` (e.g. `fighter`), ability `id`
  (e.g. `fire_bolt`), stat keys, route paths. These are the identity used by the
  DB, the API, and the client, so never translate them.

## Ability icons

- Icons resolve by `ability.id` via `ABILITY_ICONS` in `client/src/icons.jsx`.
- Each entry maps an id to `client/public/art/abilities/<file>.svg`; a missing
  entry just renders no icon.
- Icons are CC BY 3.0 from game-icons.net (see `client/public/art/CREDITS.txt`
  for the per-file source manifest).

## Party (отряд)

- A party is a **leader** (a normal character) plus **companions** stored in
  `party_members`; each companion is a full sheet of its class/level.
- **14 recruitment sources** live in `game/companions.js` (`RECRUIT_SOURCES`):
  tavern, road, rescue, quest, arena, mercy, ransom, necromancy, guild, beast,
  sermon, deed, favor, orphan. Methods: free | gold | trial | quest | tame |
  raise | persuade | favor.
- `COMPANIONS` holds ready-made people with a history, two pluses, two minuses,
  a starting opinion, a portrait slug and the sources they can appear from.
  Traits live in `TRAITS` (each with `effects` and `likes`/`dislikes`).
- **Relationships** are directed and clamped 0..100: each member feels something
  toward the leader (`to_member_id IS NULL`) and toward every other member.
  `LEAVE_THRESHOLD = 25` — below it with *anyone*, the companion leaves
  (`sweepDepartures`). A fresh bond is seeded 30..90 so nobody leaves on day one.
- Recruitment may be **refused**; `acceptanceChance` is an honest 5..95% shown to
  the player. Deterministic pieces (prices, seeded opinions/bonds) keep it fair;
  `rng` is injectable for tests.
- Endpoints live under `/api/party` (see `routes/party.js`); the UI is
  `pages/Party.jsx` (cards + relation bars) and `pages/Recruit.jsx` (source chips
  + candidates).
- Companion portraits are game-icons faces under `client/public/art/portraits/`
  (map `PORTRAITS` in `game/companions.js`, credited in CREDITS.txt).

### Still to come (approved waves, not yet built)

- 3C battle as a party (control every member; permadeath).
- 3D party upgrade tree paid with a separate **Очки отряда** resource
  (`party_upgrades` table already exists).
- 3E living AI dialogue with the party — self-contained, no external key,
  never breaks the game.
- 3F resurrection rituals (animal sacrifice, no currency).

## Conventions

- ES modules everywhere. Server code has no build step.
- Keep game math in `src/game/*` pure and unit-tested; keep I/O in services/routes.
- The DB auto-seeds on startup (`seedWorld()` in `src/index.js`). The sqlite file
  lives in `server/src/data/` and is gitignored.
- `server/src/index.js` also serves `client/dist` (SPA fallback) so the whole app
  is reachable from one port in preview.

## Party combat (Wave 3C)

- `server/src/game/combat.js` builds combatants with `key`/`side`/`kind`
  (`leader|ally|enemy`)/`refId`.
- `startBattle` loads the leader's active party; every player-side member is
  human-controlled, turn order by speed. The enemy AI targets the lowest-HP
  living party member.
- Settlement applies leader XP/HP, companion XP, and permanent companion death
  (`party_members.status='dead'`). Defeat is survivable: the leader ends at 1 HP
  and loses 25% of gold unless the party still won.
- `battles.result` (JSON) stores the end-of-battle report; the Battle page reads
  it so the report survives a reload. Additive migrations live in
  `server/src/db/index.js#migrate`.
- Tests share one SQLite file, so they run serially:
  `npm --workspace server test` uses `node --test --test-concurrency=1`.

## World map, scenes and arena (Waves 4-5)

- `locations` carry `map_x`/`map_y`/`scene`/`biome`; migrations live in
  `server/src/db/index.js#migrate` and `seedWorld()` backfills map data into
  databases that predate the columns (no duplicates, keyed by location name).
- `GET /api/world/map` (see `services/world.js#getMap`) returns flat locations
  with coordinates plus undirected roads and per-location monster counts.
- All art is procedural SVG, no rasters: `client/src/WorldMap.jsx` is the
  interactive atlas, `client/src/scenes.jsx` renders layered scene backdrops
  (biome palette + location-specific accents) reused by location cards, the
  location hero and the battle arena.
- The arena in `client/src/pages/Battle.jsx` turns the engine's event stream
  into transient VFX (floating damage/heal numbers, hit shake, heal pulse,
  dodge, screen flash); `getBattleView` exposes the location's scene/biome.

## Dialogue, memory and the local AI (Wave 6)

The party and world inhabitants can be talked to. Every line is remembered, and
each character's attitude toward the leader moves with what is said.

- Pure engine: `server/src/game/dialogue.js` (topic classifier, trait-weighted
  `relationDelta`, mood buckets, fact extraction, reply composition). No I/O, so
  it is unit-tested directly.
- NPC design data: `server/src/game/npcs.js`; persistence and seeding:
  `server/src/services/npcs.js#seedNpcs` (idempotent, runs on startup).
- Orchestration: `server/src/services/dialogue.js` records both lines in
  `dialogue_messages`, distils durable facts into `dialogue_memory` (repeating a
  fact raises its weight), and moves the relationship. NPC opinion lives in
  `npc_relations`; companion opinion reuses `party_relations` (leader-targeted
  row). Both are clamped to 0..100.
- Routes: `server/src/routes/dialogue.js` — `GET /api/dialogue/options`,
  `GET /api/dialogue/:leaderId/:kind/:refId`, `POST .../say`, plus
  `GET /api/dialogue/status`.
- UI: `client/src/Talk.jsx` is a reusable panel wired into `pages/Location.jsx`
  (inhabitants) and `pages/Party.jsx` (companions). It shows the live relation
  meter, topic quick-prompts, remembered facts and per-line attitude deltas.

### The AI layer is optional and layered

`server/src/services/llm.js` produces the spoken reply, in order:

1. **local** — llama.cpp `llama-server` with Qwen2.5-7B-Instruct Q4_K_M.
2. **cloud** — any OpenAI-compatible endpoint, only if `LLM_CLOUD_KEY` is set.
3. **template** — the deterministic engine line, always available.

There are two paths, and the difference matters:

- **Free answer (`answerQuestion`)** — for open questions the player asks about
  the character, the world or a reason ("почему ты стала воином?", "чего ты
  боишься?", "расскажи о прошлом"). Here the model *authors* the line; the engine
  draft is a fallback that is **not** shown to the model, so it cannot echo a
  wrong template. This is what makes an NPC able to talk about anything.
- **Reword (`rewordReply`)** — for the recognised "safe" topics, the model
  rewords the engine draft. Volatile beats (insult, threat, apology, join) keep
  the engine's exact wording.

The briefing (`llmBriefing`) always carries the character's **backstory**
(`description` for NPCs, `history` for companions) and `className`, so the model
knows why, say, Марта became a warrior. The static instruction block
(`SYSTEM_RULES`) is a module-level constant and comes first in the system prompt,
with all per-turn data after it — llama.cpp reuses the cached prefix, so prompt
evaluation stays cheap instead of re-reading the whole brief every turn.

The local model is Qwen2.5-**7B**-Instruct Q4_K_M (two GGUF shards; point
llama.cpp at the `-00001-of-00002` file and it loads the rest). The 3B was tried
and answered correctly but flatter; the 7B is markedly more in character, so
reply latency (seconds) is deliberately not optimised for.

If nothing is running, dialogue still works. Config via env: `LLM_PROVIDER`
(`auto|local|cloud|off`), `LLM_LOCAL_URL` (default `http://127.0.0.1:8080`),
`LLM_MODEL_PATH`, `LLM_CLOUD_KEY`, `LLM_CLOUD_BASE`, `LLM_CLOUD_MODEL`,
`LLM_TIMEOUT_MS`.

A small local model drifts off-register, so the reword path only touches "safe"
topics; volatile beats (insult, threat, apology, join) keep the engine's exact
wording. Model output is rejected (falling back to the engine) if it is empty,
too long, mostly Latin, contains markup, uses the speaker's own name for the
listener, or drifts off the draft's subject. `tidyReply` also strips small-model
framing ("Вот мой ответ:"), stray Latin words, and a line cut off on a trailing
conjunction or preposition.

Models are never committed: `models/` is gitignored. Recreate the local layer
with `npm run llm:setup` then `npm run llm:start`. The weights are open and the
runtime is offline, so this layer has no API key and no expiry — it keeps working
as long as the machine does.

## Testing rules (important)

- **Tests must never touch the live game data.** `server/test-support/env.js`
  points `DB_PATH` at a throwaway `server/test-support/.tmp/test.sqlite` and
  turns the LLM layer off. It MUST be the first import in every test file,
  before anything that opens the database or reads LLM config:
  `import '../test-support/env.js';`
- Never create scratch characters against the live database (`server/src/data/`).
  If you need to try something by hand, run it against the test DB by setting
  `DB_PATH` first, or through the API and delete it afterwards.
- Tests run serially (`node --test --test-concurrency=1`) because they share one
  SQLite file.

## Dialogue nuance: greetings vs caring questions

- A bare hello ("привет", "здравствуй") is topic `greeting`. A caring question
  ("как ты", "как дела", "как себя чувствуешь", "ты в порядке") is topic
  `wellbeing` and is matched **before** `greeting`, otherwise the word "привет"
  swallows the whole line.
- `wellbeing` is a small positive for most characters (never a penalty). It used
  to fall through to `smalltalk`, which gloomy/paranoid characters dislike, so
  asking someone how they were could cost you relationship — that was wrong.
- The LLM layer must not answer with a one-word stub. `accept()` rejects replies
  under three words and retries the local model once before falling back to the
  engine line, so "привет, как ты?" never comes back as just "Привет".

## Local AI rewording (Wave 6 follow-up)

- The LLM layer only ever rewords the **clean spoken line**. A remembered aside
  is appended afterwards (30% of the time, never twice in a row), otherwise a
  small model rewrites the mechanical aside and loses the actual answer.
- `llmBriefing` passes `playerText` so the model answers the real question
  instead of parroting the draft.
- `acceptReply` (services/llm.js) rejects: replies under 10 chars or 2 words,
  anything without Cyrillic, CJK/fullwidth/Arabic/Hebrew/Greek scripts, mostly
  Latin lines, and any line containing the speaker's own name **or a truncation
  of it** ("Март" for "Марта Вейл"). `rewordReply` retries the local model once
  with a nudge, then falls back to the engine line.
- Memory weight is capped at 5 and `memoryAside` only recalls weight >= 2, so a
  frequently repeated fact cannot monopolise every reply.

## Dialogue topics (invariants)

- `MOOD_LINES` must define a line for **every** topic in `TOPICS` in **every**
  mood. A missing key silently falls back to `default`, which once made a
  farewell answer with a battle line. The test
  "every mood answers every topic" enforces this.
- Battle readiness is its own topic (`battle`), matched by words like
  "сражени", "бой", "готов к", "в атаку". Before, "готов к сражению" fell
  through to smalltalk and the model just echoed it back.
- `acceptReply` also rejects a short reply that only mirrors the player's own
  words (>=60% shared content words, <=6 words), so "готов к сражению" cannot
  be answered with "Я готов к сражению!".
- A reply must share at least one four-letter stem with the engine draft; this
  catches hallucinated non-answers ("Ты гадкий" to "как ты сегодня?") while
  still allowing synonyms ("привет" ~ "приветствую").
- The reply seed counts only the character's own lines (`speaker='other'`),
  because each turn writes two rows and the parity used to get stuck.

## Answering "how are you?" (mood topic)

- A player *answering* "как ты?" — "да также, потихоньку", "нормально", "как обычно" — is the `mood` topic, not `smalltalk`. `smalltalk` had no real reply for it and gloomy listeners docked -2, which read as "you cannot just talk to a companion".
- `smalltalk` never changes the relationship (`TRAIT_REACTIONS.smalltalk = {}`); empty chatter is neutral, not an offence.
- "хорошо"/"отлично" are deliberately absent from the mood patterns: they belong to the `compliment` topic and would otherwise hijack "Ты отлично держишься".
- The UI badge shows "ответ: движок (характер)" whenever Qwen was not used — either the topic is intentionally engine-only (insult/threat/apology/join) or the model's line was rejected by `acceptReply` and the draft was kept.

## Free answers (open questions)

- Any real question that is not a recognised beat — "почему ты стала воином?",
  "чего ты боишься?", "расскажи о прошлом" — classifies as topic `question`
  (`DEEP_QUESTION` in `game/dialogue.js`) and is answered by the model directly
  via `answerQuestion`, not by a canned beat. This is what stops the old failure
  mode where a misclassified question made Qwen faithfully rephrase the *wrong*
  template ("почему решила стать воином" → "мне тоже кажется, что здесь пусто").
- A short social beat with a question mark ("как ты?") keeps its reliable canned
  reply: `freeAnswer` is true only for a deep question or a line classified as
  `question`, never for `greeting`/`wellbeing`/`mood`/`farewell`.
- `question` is in `TOPICS` and every mood defines `MOOD_LINES.question`, so the
  engine fallback (when no model is reachable) is still in character — the
  "every mood answers every topic" test covers it.
- On the free path the engine draft is a **fallback only** and is not put into
  the prompt, so the model cannot echo it. `answerQuestion` returns null on any
  failure and the caller keeps the engine line.
