// Crossing from one continent to another (Wave G5). A road between places is a
// short, same-land walk (game/travel.js); a crossing is a long, multi-day voyage
// with a price and a real chance of trouble. Everything here is pure data and
// pure math, so the crossing screen can render it and the service can resolve it
// without touching the database.

import { hashString } from './travel.js';

// A crossing takes days, not minutes. `DAYS_PER_MINUTE` turns the game's minute
// clock into voyage days, so a 3-day crossing is a genuinely different thing
// from a 40-minute road.
export const MS_PER_MINUTE = 10_000;
export const MINUTES_PER_DAY = 15; // a "day" of travel the party actually walks
export const MIN_DAYS = 2;
export const MAX_DAYS = 8;

// The routes the player may sail. `from`/`to` are the crossing gate locations on
// each side; the same route serves both directions (see routeFor). `days` is the
// authored length in voyage days, `gold` the fare, `item` an optional toll the
// captain demands instead of (or as well as) coin, and `danger` the 0..1 chance
// that something happens on the water.
//
// Crossings exist only between gates. Мордрат's gate is Сумеречная гавань; every
// other continent reaches it through its own port.
export const CROSSINGS = [
  {
    key: 'frozen_harbor',
    from: 'Сумеречная гавань', to: 'Ледяной причал',
    days: 6, gold: 120, danger: 0.45,
    item: { key: 'pale_lantern', qty: 1, label: 'Бледный фонарь' },
    text: 'Северный путь мимо дрейфующего льда: шесть дней в холодном тумане, где лица сглаживаются.',
  },
  {
    key: 'free_harbor',
    from: 'Сумеречная гавань', to: 'Порт Свободных Капитанов',
    days: 4, gold: 80, danger: 0.35,
    item: { key: 'clean_water', qty: 3, label: 'Фляга чистой воды' },
    text: 'Западный путь через рифы Утонувших островов: четыре дня под низким небом и вечным туманом на воде.',
  },
  {
    key: 'glass_harbor',
    from: 'Сумеречная гавань', to: 'Порт Солёного Стекла',
    days: 5, gold: 100, danger: 0.4,
    item: { key: 'bread_loaf', qty: 4, label: 'Краюха хлеба' },
    text: 'Южный караванный путь по стеклянному морю: пять дней зноя и марева, где берег режет глаза.',
  },
  {
    key: 'green_harbor',
    from: 'Сумеречная гавань', to: 'Зелёный причал',
    days: 5, gold: 100, danger: 0.4,
    item: { key: 'bitter_herb', qty: 3, label: 'Горький корень' },
    text: 'Восточный путь вдоль живого берега: пять дней, и лес на горизонте растёт с каждым часом.',
  },
];

// The settlements on each continent that own the crossing gate. Kept here (not
// in the seed) so the rules stay free of I/O: the seed wires the roads, this
// names the gates the crossing screen points at.
export const CROSSING_GATES = ['Сумеречная гавань', 'Ледяной причал', 'Порт Свободных Капитанов', 'Порт Солёного Стекла', 'Зелёный причал'];

// The route between two gate names, in whichever direction they are named.
export function routeFor(fromName, toName) {
  return CROSSINGS.find(
    (r) => (r.from === fromName && r.to === toName) || (r.from === toName && r.to === fromName),
  ) || null;
}

// A crossing's length in game minutes, so it can share the road clock.
export function crossingMinutes(route) {
  const days = Math.max(MIN_DAYS, Math.min(MAX_DAYS, route?.days ?? MIN_DAYS));
  return days * MINUTES_PER_DAY;
}

// The whole route as data the travel screen can render: the price, the days, an
// honest danger label and the Russian blurb. `from`/`to` are resolved names.
export function crossingView(route, { from, to } = {}) {
  if (!route) return null;
  const minutes = crossingMinutes(route);
  return {
    key: route.key,
    from: from ?? route.from,
    to: to ?? route.to,
    days: route.days,
    minutes,
    gold: route.gold,
    item: route.item ? { ...route.item } : null,
    danger: route.danger,
    dangerLabel: dangerLabel(route.danger),
    text: route.text,
  };
}

// An honest, dice-free label for how likely trouble is on the water.
export function dangerLabel(danger) {
  if (danger <= 0) return 'Спокойное море';
  if (danger < 0.25) return 'Почти спокойно';
  if (danger < 0.45) return 'Могут быть неприятности';
  if (danger < 0.65) return 'Опасный путь';
  return 'Смертельный путь';
}

// Whether the party can afford the crossing as it stands. Returns the missing
// pieces rather than a bare boolean, so the screen can say exactly what is
// short. `hasItem(key, qty)` is injected so this stays pure.
export function canAfford(route, { gold = 0, hasItem = () => false } = {}) {
  const missing = [];
  if ((route?.gold ?? 0) > gold) missing.push({ kind: 'gold', need: route.gold, have: gold });
  if (route?.item && !hasItem(route.item.key, route.item.qty)) {
    missing.push({ kind: 'item', key: route.item.key, qty: route.item.qty, label: route.item.label });
  }
  return { ok: missing.length === 0, missing };
}

// Resolve a crossing deterministically: the same route, entered on the same day
// and carrying the same seed, always yields the same outcome, so a reload cannot
// reroll the sea. The service passes a seed (the travel row id); tests may pass
// their own.
//
//   { kind: 'safe', text }
//   { kind: 'gold', delta }               -> the party loses (or gains) coin
//   { kind: 'heal', hp, mana, stamina }   -> a calm passage restores the party
//   { kind: 'battle', text }              -> the service starts a fight at the gate
export function resolveCrossing(route, { seed = '', day = 1 } = {}) {
  if (!route) return { kind: 'nothing', text: 'Нет такого пути.' };
  const rng = rngFrom((hashString(`${route.key}:${seed}:${day}`) ^ 0x9e3779b9) >>> 0);
  const roll = rng();
  if (roll >= route.danger) {
    return { kind: 'safe', text: 'Переход прошёл спокойно — только вода и серое небо.' };
  }
  // Trouble: weigh it toward the sea taking its due, with a chance of something
  // worse climbing aboard.
  const trouble = rng();
  if (trouble < 0.4) {
    const delta = -(20 + Math.floor(rng() * Math.max(1, Math.round(route.gold / 2))));
    return { kind: 'gold', delta, text: 'Шторм смыл часть припасов за борт.' };
  }
  if (trouble < 0.75) {
    return { kind: 'battle', text: 'Из тумана на палубу лезет то, что не тонуло.' };
  }
  return {
    kind: 'heal',
    hp: 4 + Math.floor(rng() * 6),
    mana: 3 + Math.floor(rng() * 5),
    stamina: 4 + Math.floor(rng() * 6),
    text: 'Спокойная вахта у огня вернула силы.',
  };
}

// Same tiny PRNG the road uses, kept local so the two modules stay independent.
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
