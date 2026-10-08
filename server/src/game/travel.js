// The road between two places: how long it takes, and what the party meets on
// the way. Everything here is deterministic — the same road, entered at the
// same minute, always yields the same encounter, so a reload cannot reroll it.

// --- deterministic randomness -------------------------------------------------

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const between = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// --- travel time --------------------------------------------------------------

export const MIN_TRAVEL = 15;
export const MAX_TRAVEL = 50;

// How many map pixels a minute of walking covers. The world was redrawn as one
// compact generated plate, so its places sit roughly a quarter as far apart on
// the 1000x640 sheet as the old hand-placed points did; the scale shrank with
// them. Without this, every road's raw time fell under the floor and the whole
// map read "15 мин".
export const PX_PER_MINUTE = 2;

// Roads through a marsh or up a mountain are slower than open country. The
// multipliers are small so a route stays inside the 15–50 band once clamped.
const TERRAIN_FACTOR = {
  waste: 1.0, marsh: 1.35, forest: 1.15, coast: 1.05, bonefield: 1.2,
};

// Minutes are derived from the drawn distance between the two points, so a
// longer road on the map always takes longer in the game. Both endpoints'
// terrain counts, averaged, so the road takes the same time whichever way it is
// walked. The result is clamped to the 15–50 range the world was pitched around.
export function travelMinutes({ from, to }) {
  if (from?.x == null || to?.x == null) return MIN_TRAVEL;
  const dist = Math.hypot(from.x - to.x, from.y - to.y);
  const factorOf = (loc) => TERRAIN_FACTOR[loc?.biome] ?? 1;
  const terrain = (factorOf(from) + factorOf(to)) / 2;
  const raw = (dist / PX_PER_MINUTE) * terrain;
  return Math.max(MIN_TRAVEL, Math.min(MAX_TRAVEL, Math.round(raw)));
}

// --- encounters ---------------------------------------------------------------

// Each entry has an id, a weight (how often it shows up) and a kind that tells
// the UI which choices to offer. `minDanger` gates the harsh ones out of safe
// roads; `safeOnly` gates the friendly ones in.
export const ENCOUNTERS = {
  merchant: { kind: 'merchant', weight: 3, minDanger: 1, title: 'Бродячий торговец' },
  inn: { kind: 'inn', weight: 2, minDanger: 1, title: 'Одинокий постоялый двор' },
  refugees: { kind: 'refugees', weight: 3, minDanger: 1, title: 'Беженцы на обочине' },
  wounded: { kind: 'wounded', weight: 3, minDanger: 1, title: 'Раненый путник' },
  ambush: { kind: 'ambush', weight: 4, minDanger: 3, title: 'Засада' },
  shrine: { kind: 'shrine', weight: 2, minDanger: 1, title: 'Заброшенная часовня' },
  patrol: { kind: 'patrol', weight: 2, minDanger: 1, title: 'Дозор мордратцев' },
};

// Roughly one encounter per 18 minutes of road, capped, and none at all on a
// safe road. The count itself is deterministic.
export function encounterCount(minutes, danger, safe) {
  if (safe) return 0;
  const n = Math.round(minutes / 18);
  return Math.max(1, Math.min(3, n));
}

function eligibleEncounters(danger, safe) {
  return Object.entries(ENCOUNTERS)
    .filter(([, e]) => danger >= e.minDanger)
    .filter(([, e]) => !(safe && e.kind === 'ambush'))
    .map(([id, e]) => ({ id, ...e }));
}

// The encounter that fires at a given minute along a given road. Passing the
// road seed and the minute makes this stable across reloads.
export function encounterAt({ seed, minute, danger, safe }) {
  const pool = eligibleEncounters(danger, safe);
  if (!pool.length) return null;
  const rng = rngFrom((hashString(`${seed}:${minute}`) ^ 0x9e3779b9) >>> 0);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  for (const e of pool) {
    roll -= e.weight;
    if (roll <= 0) return e;
  }
  return pool[pool.length - 1];
}

// Minutes at which encounters fall on this road, e.g. 34-минутная дорога gives
// one around minute 17. Returned in order; the last one never lands on the very
// end so there is always a moment to react before arriving.
export function encounterMinutes(minutes, danger, safe) {
  const count = encounterCount(minutes, danger, safe);
  if (count === 0) return [];
  const out = [];
  for (let i = 1; i <= count; i += 1) {
    out.push(Math.max(3, Math.round((minutes * i) / (count + 1))));
  }
  return out;
}

// The full deterministic road: its length and every scheduled encounter.
export function planTravel({ from, to, seed }) {
  const minutes = travelMinutes({ from, to });
  const danger = Math.max(from?.danger ?? 1, to?.danger ?? 1);
  const safe = !!(from?.safe ?? from?.isSafe) && !!(to?.safe ?? to?.isSafe);
  const seedKey = seed || `${from?.id}->${to?.id}`;
  const events = encounterMinutes(minutes, danger, safe).map((minute) => ({
    minute,
    encounter: encounterAt({ seed: seedKey, minute, danger, safe }),
  }));
  return { minutes, danger, safe, seed: seedKey, events };
}

// --- resolving an encounter ---------------------------------------------------

// Every encounter offers the same three shapes of choice: approach it (talk,
// trade, help — or fight), keep to the road, or turn back. `options` returns the
// ones that make sense for the encounter; `resolve` turns a choice into an
// outcome the service can apply.
export function encounterOptions(encounter) {
  if (!encounter) return [];
  const common = [{ id: 'ignore', label: 'Идти дальше' }];
  switch (encounter.kind) {
    case 'ambush':
      return [{ id: 'fight', label: 'Принять бой' }, { id: 'flee', label: 'Бежать' }, ...common];
    case 'merchant':
      return [{ id: 'trade', label: 'Торговать' }, ...common];
    case 'inn':
      return [{ id: 'rest', label: 'Отдохнуть' }, ...common];
    case 'refugees':
      return [{ id: 'help', label: 'Помочь (5 золота)' }, ...common];
    case 'wounded':
      return [{ id: 'help', label: 'Перевязать раны' }, ...common];
    case 'shrine':
      return [{ id: 'pray', label: 'Помолиться' }, ...common];
    case 'patrol':
      return [{ id: 'talk', label: 'Заговорить' }, ...common];
    default:
      return common;
  }
}

// Pure resolution: returns an outcome descriptor. No DB, no side effects.
//   { kind: 'battle' }             -> the service should start a fight
//   { kind: 'gold', delta }        -> apply to the character
//   { kind: 'heal', hp, mana, stamina }
//   { kind: 'nothing', text }
export function resolveEncounter({ encounter, choice, seed, danger = 1 }) {
  if (!encounter) return { kind: 'nothing', text: 'Дорога пуста.' };
  const rng = rngFrom(hashString(`${seed}:${encounter.kind}:${choice}`) >>> 0);
  const ch = choice || 'ignore';

  if (ch === 'ignore' || ch === 'flee') {
    if (ch === 'flee' && encounter.kind === 'ambush' && rng() < 0.35) {
      return { kind: 'battle', text: 'Уйти не вышло — они уже рядом.' };
    }
    return { kind: 'nothing', text: ch === 'flee' ? 'Отряд уходит от дороги и возвращается на тракт.' : 'Отряд идёт дальше.' };
  }

  switch (encounter.kind) {
    case 'ambush':
      return { kind: 'battle', text: 'Засада! Отряд берётся за оружие.' };
    case 'merchant':
      return { kind: 'gold', delta: between(rng, -12, -4), text: 'Торговец уступает припасы за горсть монет.' };
    case 'inn':
      return { kind: 'heal', hp: between(rng, 4, 9), mana: between(rng, 3, 7), stamina: between(rng, 4, 9), text: 'Ночь у огня возвращает силы.' };
    case 'refugees':
      return { kind: 'gold', delta: -5, text: 'Отряд делится монетами и хлебом.' };
    case 'wounded':
      return { kind: 'heal', hp: between(rng, 3, 7), mana: 0, stamina: between(rng, 2, 5), text: 'Путник делится травами и советом.' };
    case 'shrine':
      return { kind: 'mana', delta: between(rng, 6, 14), text: 'Тихая молитва наполняет отряд.' };
    case 'patrol':
      return rng() < 0.5
        ? { kind: 'gold', delta: between(rng, 2, 8), text: 'Дозор отдаёт плату за вести о дороге.' }
        : { kind: 'nothing', text: 'Дозор расспрашивает и уходит.' };
    default:
      return { kind: 'nothing', text: 'Отряд идёт дальше.' };
  }
}

// --- journey state (real time) -------------------------------------------------

// The road is walked in real time: one game minute costs this many real
// milliseconds. Ten seconds a minute keeps a 15-minute road a short wait and a
// 40-minute one a real journey, without ever being idle-clicking.
export const MS_PER_MINUTE = 10_000;

// A journey only records how long the party has actually walked, not what it
// met: the stop at each scheduled minute is re-derived from the plan. Walking
// time accumulates in `walkedMs`; `segmentStart` marks the current stretch of
// walking, and is null while the party is paused at a stop.
export function startState(plan, now) {
  return { events: plan.events, cursor: 0, pending: null, walkedMs: 0, segmentStart: now, pendingAt: null };
}

// Total walking time so far, in milliseconds.
export function elapsedWalkMs(state, now) {
  if (state.segmentStart == null) return state.walkedMs;
  return state.walkedMs + Math.max(0, now - state.segmentStart);
}

// The game minute the party has reached.
export function currentMinute(state, now) {
  return Math.floor(elapsedWalkMs(state, now) / MS_PER_MINUTE);
}

// Reveal the stop the clock has reached. At most one stop pends at a time, so
// walking pauses exactly on the minute an encounter is due.
export function tick(state, now) {
  if (state.pending) return state;
  const next = state.events[state.cursor];
  if (next && currentMinute(state, now) >= next.minute) {
    return { ...state, walkedMs: next.minute * MS_PER_MINUTE, segmentStart: null, pending: next, pendingAt: now };
  }
  return state;
}

// Resume walking after a stop has been answered.
export function resume(state, now) {
  return { ...state, pending: null, segmentStart: now };
}

// The far end of the road: no stop pending, none left, and the whole road walked.
export function hasArrived(state, minutes, now) {
  if (state.pending) return false;
  return state.cursor >= state.events.length && elapsedWalkMs(state, now) >= minutes * MS_PER_MINUTE;
}
