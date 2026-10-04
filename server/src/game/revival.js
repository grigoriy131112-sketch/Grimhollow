// Pure rules for the resurrection mini-quest. Kept out of services so the
// relationship math can be unit-tested without a database.
//
// Revival is not free and not neutral: how a companion feels about being
// dragged back depends on who they are. The living who watched the leader walk
// into the death realm for one of their own warm to them a little too.

import { traitInfo } from './companions.js';

// The one place a gate may be opened: the flooded chapel of a drowned god.
export const RITUAL_SITE = 'Затонувшая часовня';

// Δ relationship toward the leader for the one brought back, by trait. Traits
// not listed fall back to their own loyalty effect (greedy, drunkard, ...).
export const REVIVAL_TRAIT_DELTA = {
  loyal: 8, kind: 8, pious: 8, cheerful: 6, honest: 6,
  brave: 5, fierce: 5, hardy: 5, calm: 4, clever: 3, swift: 3, studious: 3,
  coward: 4, // relief, not courage
  stubborn: -5, gloomy: -5, paranoid: -6, heretic: -4,
  cruel: -6, vain: -5, liar: -6,
};

// What a living companion feels watching the leader go into death for a peer.
export const WITNESS_DELTA = 4;

export function revivalDelta(traits = []) {
  let delta = 0;
  for (const key of traits) {
    delta += REVIVAL_TRAIT_DELTA[key] ?? (traitInfo(key).effects.loyalty || 0);
  }
  return delta;
}
