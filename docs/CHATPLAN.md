# Grimhollow — chat bundle (how parallel work is split)

Grimhollow grows through **waves**. One wave = one approval (`погнали`) = one
chat = one branch = one PR. Parallel chats are allowed only when they touch
**disjoint files**, so they never block each other.

## Chat roles and branch ownership

| Chat | Wave | Owns (exclusive) | Branch |
|------|------|------------------|--------|
| Orchestrator | — | planning, review, merges, preview, **lore/story** (`docs/lore/**`) | `main` |
| lore | G1 | **DONE by orchestrator** — canon lives in `docs/lore/**`; no chat re-writes it | — |
| items | G2 | **DONE (merged)** — item catalogue + modifier engine | — |
| save-settings | G4 | **DONE (merged)** — save slots/export + settings page | — |
| settlements | G6 | **DONE (merged)** — city Гримхольд + village Соляной Брод + stock shape | — |
| survival | G3 | **DONE (merged)** — hunger/thirst/fatigue meters as debuffs | — |
| continents | G5 | **DONE (merged)** — 4 new continents + crossings | — |
| trade | G7 | **DONE (merged)** — buy/sell on the G6 stock shape | — |
| quests | G8 | **DONE (merged)** — 14 quests, progress + rewards | — |
| monsters | G10 | **DONE (merged)** — bestiary + encounters + loot | — |
| clan | G9 | **DONE (merged)** — founding, doctrine, holdings, mercenaries | — |
| campaign | G11 | **DONE (merged)** — chapter flags + three endings | — |
| online | G12 | **CANCELLED** by user decision (2026-10-08: «не онлайн, онлайн не делаем вообще»). Not to be built. | — |

`*` = new file, created by that chat. New files never collide.

## Shared files: one writer at a time

A few files are read by every wave but must have a **single writer** per batch:

- `server/src/index.js` — add `app.use(...)` for a new router.
- `client/src/App.jsx` — add a `<Route>` / nav link.
- `server/src/db/schema.sql` — new tables.
- `server/src/game/dialogue.js` — new topics.

Rule: **the orchestrator owns shared-file edits** and lands them on `main`
between waves, or assigns the edit to exactly one chat for the batch. A feature
chat writes its own new files and asks for the shared wiring; it never edits a
shared file that another chat is also editing.

## Dependencies (what must land before what)

```
DONE: G1 lore, G2 items, G3 survival, G4 save/settings, G5 continents,
      G6 settlements, G7 trade, G8 quests, G9 clan, G10 monsters, G11 campaign

Everything except G12 is merged. The offline game is complete.
```

**No batch is running.** Everything through G11 is merged; the ✅ shell/UX waves
(W-MENU, W-CODEX/W-SHELL, W-AUDIO, W-BUGHUNT, W-MAP, W-SHIP, W-SEA, W-THEME,
W-HERO-TABS) are merged too, and the "unspelled mechanics" queue (W-CLAN-LIVE,
W-CLAN-ROSTER, W-BESTIARY, W-SEA-TALK, W-SEA-BALANCE, W-WIRE, W-ACTIONS-CRAFT) is
**done and merged**. **The roadmap is clear**; **G12 (online) is cancelled** by the
user. `main` is at **391 pass / 0 fail**.

**The roadmap is `docs/PENDING_WAVES.md`** — the single source of truth: shipped
waves, built-but-not-wired mechanics, and the next queue. The wave chats' reports
are archived in **`docs/CHAT_ARCHIVE.md`**.

> **Standing rule:** the user adds requirements from his head, often. Every new
> requirement is written down in `docs/PENDING_WAVES.md` before it is built, and
> nothing is built without a per-wave `погнали`.

Each of G3/G5/G7 also needs a small append-only edit to the shared files
(`server/src/index.js`, `client/src/App.jsx`, `server/src/db/schema.sql`); the
orchestrator resolves those at merge time (as done for G2/G4/G6).

## How a chat is created

Chats are started through the OpenHands **Cloud API** (each gets its own
sandbox and a fresh clone of the repo, so they are fully isolated):

```bash
curl -X POST "https://app.all-hands.dev/api/v1/app-conversations" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"initial_message":{"content":[{"type":"text","text":"<self-contained task>"}]},
       "selected_repository":"grigoriy131112-sketch/Grimhollow",
       "selected_branch":"wave/<wave-id>",
       "title":"<wave title>"}'
```

Every chat prompt must be self-contained (it does not see this conversation),
name its branch, list its exclusive files, forbid touching shared files, require
`npm test` to pass, and require a push + PR against `main`.

## Approval gate

No chat is started for a wave until the user says `погнали` for that wave.
