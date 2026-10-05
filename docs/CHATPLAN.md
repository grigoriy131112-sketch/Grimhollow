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
| survival | G3 | `server/src/game/survival.js`*, `server/src/services/survival.js`* | `wave/g3-survival` |
| continents | G5 | `server/src/db/seed_continents.js`*, `server/src/services/continents.js`*, `server/src/game/continent_travel.js`* | `wave/g5-continents` |
| trade | G7 | `server/src/services/trade.js`*, `server/src/routes/trade.js`*, `client/src/pages/Trade.jsx`* | `wave/g7-trade` |

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
DONE: G1 lore, G2 items, G4 save/settings, G6 settlements

G3 survival (uses G2 modifier engine) ─┐
G5 continents (uses G1 lore)          ─┼─> G8 quests ─> G9 clan ─> G11 campaign
G7 trade (uses G6 stock shape)        ─┘
G10 monsters + randomizer
G12 online (last, per directive)
```

Current batch (parallel-safe, disjoint new files): **G3, G5, G7**.
Then **G8** (quests), then **G9** (clan), then **G10 + G11**, then **G12** last.

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
