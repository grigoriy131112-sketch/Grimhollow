// Class definitions for Grimhollow.
//
// No dice: every value here is a fixed number. Hit chance comes from
// accuracy vs evasion (a real percentage, shown to the player), damage is
// attack minus defense. Abilities cost mana (magic) or stamina (martial).
//
// An ability:
//   { id, name, icon, unlockLevel, resource, cost, cooldown, kind, power,
//     accuracyBonus, effect, passive, description }
//   kind: attack | heal | buff | debuff | defend
//   power: for attack = multiplier of the attacker's attack stat
//          for heal  = fraction of the target's max HP
//   effect: dot | buff | debuff | stun | restore | cleanse
//   passive: when true the ability is not castable; its `mods` are folded
//            into the character's stats permanently.

export const BASIC_ATTACK = {
  id: 'basic', name: 'Attack', icon: '⚔️', unlockLevel: 1,
  resource: null, cost: 0, cooldown: 0, kind: 'attack', power: 1.0,
  accuracyBonus: 0, effect: null,
  description: 'A straightforward strike with your weapon. Costs nothing.',
};

export const CLASSES = {
  fighter: {
    key: 'fighter',
    label: 'Fighter',
    blurb: 'A wall of steel. Massive health and stamina, unstoppable up close.',
    growthText: 'HP +14, Stamina +10, Attack +3, Defense +2, Accuracy +4 per level.',
    base: { hp: 60, mana: 10, stamina: 50, attack: 12, defense: 8, accuracy: 30, evasion: 10, speed: 8 },
    growth: { hp: 14, mana: 2, stamina: 10, attack: 3, defense: 2, accuracy: 4, evasion: 2, speed: 1 },
    abilities: [
      { id: 'cleave', name: 'Cleave', icon: '🪓', unlockLevel: 1, resource: 'stamina', cost: 8, cooldown: 0, kind: 'attack', power: 1.2, accuracyBonus: 0, effect: null, description: 'A wide swing. Deals 120% attack damage.' },
      { id: 'shield_wall', name: 'Shield Wall', icon: '🛡️', unlockLevel: 1, resource: 'stamina', cost: 10, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 6, turns: 3 }, description: 'Brace behind your shield: +6 defense for 3 turns.' },
      { id: 'power_strike', name: 'Power Strike', icon: '💥', unlockLevel: 2, resource: 'stamina', cost: 14, cooldown: 2, kind: 'attack', power: 1.6, accuracyBonus: -5, effect: null, description: 'A heavy overhead blow. 160% damage, slightly less accurate.' },
      { id: 'battle_cry', name: 'Battle Cry', icon: '📣', unlockLevel: 2, resource: 'stamina', cost: 12, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 5, turns: 3 }, description: 'Roar your fury: +5 attack for 3 turns.' },
      { id: 'rend', name: 'Rend', icon: '🩸', unlockLevel: 3, resource: 'stamina', cost: 13, cooldown: 2, kind: 'attack', power: 1.1, accuracyBonus: 0, effect: { type: 'dot', name: 'bleed', damage: 5, turns: 3 }, description: 'Tear a wound that bleeds for 5 damage over 3 turns.' },
      { id: 'second_wind', name: 'Second Wind', icon: '💨', unlockLevel: 3, resource: 'stamina', cost: 18, cooldown: 4, kind: 'heal', power: 0.3, accuracyBonus: 0, effect: null, description: 'Shake off your wounds and recover 30% of max HP.' },
      { id: 'whirlwind', name: 'Whirlwind', icon: '🌀', unlockLevel: 4, resource: 'stamina', cost: 22, cooldown: 3, kind: 'attack', power: 2.0, accuracyBonus: 0, effect: null, description: 'Spin through the enemy for 200% damage.' },
      { id: 'fortify', name: 'Fortify', icon: '🏰', unlockLevel: 4, resource: 'stamina', cost: 20, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 12, turns: 3 }, description: 'Become an iron bastion: +12 defense for 3 turns.' },
      { id: 'execute', name: 'Execute', icon: '☠️', unlockLevel: 5, resource: 'stamina', cost: 28, cooldown: 4, kind: 'attack', power: 2.8, accuracyBonus: 0, effect: null, description: 'A finishing blow dealing 280% damage.' },
      { id: 'unbreakable', name: 'Unbreakable', icon: '🪨', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { hpMul: 1.2 }, effect: null, description: 'Passive: your maximum HP is increased by 20%.' },
    ],
  },

  wizard: {
    key: 'wizard',
    label: 'Wizard',
    blurb: 'A scholar of ruinous power. Enormous mana, devastating spells, fragile body.',
    growthText: 'HP +6, Mana +14, Attack +2, Defense +1, Accuracy +5 per level.',
    base: { hp: 35, mana: 60, stamina: 20, attack: 7, defense: 3, accuracy: 28, evasion: 8, speed: 7 },
    growth: { hp: 6, mana: 14, stamina: 4, attack: 2, defense: 1, accuracy: 5, evasion: 2, speed: 1 },
    abilities: [
      { id: 'fire_bolt', name: 'Fire Bolt', icon: '🔥', unlockLevel: 1, resource: 'mana', cost: 8, cooldown: 0, kind: 'attack', power: 1.3, accuracyBonus: 5, effect: null, description: 'A dart of flame. 130% damage, accurate.' },
      { id: 'arcane_shield', name: 'Arcane Shield', icon: '🔷', unlockLevel: 1, resource: 'mana', cost: 10, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 5, turns: 3 }, description: 'A shimmering ward: +5 defense for 3 turns.' },
      { id: 'frost_nova', name: 'Frost Nova', icon: '❄️', unlockLevel: 2, resource: 'mana', cost: 16, cooldown: 2, kind: 'attack', power: 1.5, accuracyBonus: 0, effect: { type: 'debuff', stat: 'speed', amount: 3, turns: 3 }, description: 'A blast of rime: 150% damage and slows the enemy.' },
      { id: 'mana_surge', name: 'Mana Surge', icon: '🔹', unlockLevel: 2, resource: null, cost: 0, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'restore', resource: 'mana', amount: 25 }, description: 'Draw on the weave to restore 25 mana.' },
      { id: 'lightning_lance', name: 'Lightning Lance', icon: '⚡', unlockLevel: 3, resource: 'mana', cost: 20, cooldown: 2, kind: 'attack', power: 1.9, accuracyBonus: 5, effect: null, description: 'A spear of lightning for 190% damage.' },
      { id: 'mage_armor', name: 'Mage Armor', icon: '🧿', unlockLevel: 3, resource: 'mana', cost: 18, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 10, turns: 3 }, description: 'Hardened glyphs: +10 defense for 3 turns.' },
      { id: 'chain_lightning', name: 'Chain Lightning', icon: '🌩️', unlockLevel: 4, resource: 'mana', cost: 26, cooldown: 3, kind: 'attack', power: 2.2, accuracyBonus: 5, effect: null, description: 'Arcing death for 220% damage.' },
      { id: 'drain_life', name: 'Drain Life', icon: '🩻', unlockLevel: 4, resource: 'mana', cost: 22, cooldown: 2, kind: 'attack', power: 1.6, accuracyBonus: 0, effect: { type: 'leech', ratio: 0.5 }, description: 'Deal 160% damage and heal for half of it.' },
      { id: 'meteor', name: 'Meteor', icon: '☄️', unlockLevel: 5, resource: 'mana', cost: 40, cooldown: 4, kind: 'attack', power: 3.0, accuracyBonus: 0, effect: null, description: 'Call down a burning star for 300% damage.' },
      { id: 'arcane_mastery', name: 'Arcane Mastery', icon: '📘', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { manaMul: 1.25 }, effect: null, description: 'Passive: your maximum mana is increased by 25%.' },
    ],
  },

  rogue: {
    key: 'rogue',
    label: 'Rogue',
    blurb: 'Quick and vicious. Strikes first, strikes hard, and rarely gets hit.',
    growthText: 'HP +9, Stamina +11, Attack +3, Evasion +3, Speed +2 per level.',
    base: { hp: 45, mana: 20, stamina: 55, attack: 11, defense: 5, accuracy: 38, evasion: 18, speed: 12 },
    growth: { hp: 9, mana: 4, stamina: 11, attack: 3, defense: 1, accuracy: 5, evasion: 3, speed: 2 },
    abilities: [
      { id: 'backstab', name: 'Backstab', icon: '🗡️', unlockLevel: 1, resource: 'stamina', cost: 9, cooldown: 0, kind: 'attack', power: 1.4, accuracyBonus: 5, effect: null, description: 'Strike a weak point for 140% damage.' },
      { id: 'evade', name: 'Evade', icon: '👣', unlockLevel: 1, resource: 'stamina', cost: 8, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'evasion', amount: 8, turns: 3 }, description: 'Flow like water: +8 evasion for 3 turns.' },
      { id: 'poison_blade', name: 'Poison Blade', icon: '🧪', unlockLevel: 2, resource: 'stamina', cost: 13, cooldown: 2, kind: 'attack', power: 1.2, accuracyBonus: 0, effect: { type: 'dot', name: 'poison', damage: 6, turns: 3 }, description: 'Coat your blade: +6 poison damage over 3 turns.' },
      { id: 'quick_step', name: 'Quick Step', icon: '💫', unlockLevel: 2, resource: 'stamina', cost: 10, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'speed', amount: 4, turns: 3 }, description: 'Accelerate: +4 speed for 3 turns.' },
      { id: 'fan_of_knives', name: 'Fan of Knives', icon: '🔪', unlockLevel: 3, resource: 'stamina', cost: 18, cooldown: 2, kind: 'attack', power: 1.8, accuracyBonus: 0, effect: null, description: 'Hurl a spread of steel for 180% damage.' },
      { id: 'smoke_bomb', name: 'Smoke Bomb', icon: '💨', unlockLevel: 3, resource: 'stamina', cost: 16, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'evasion', amount: 15, turns: 2 }, description: 'Vanish in smoke: +15 evasion for 2 turns.' },
      { id: 'assassinate', name: 'Assassinate', icon: '🎯', unlockLevel: 4, resource: 'stamina', cost: 24, cooldown: 3, kind: 'attack', power: 2.4, accuracyBonus: 5, effect: null, description: 'A lethal strike for 240% damage.' },
      { id: 'adrenaline', name: 'Adrenaline', icon: '⚗️', unlockLevel: 4, resource: null, cost: 0, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'restore', resource: 'stamina', amount: 30 }, description: 'A burst of energy restores 30 stamina.' },
      { id: 'death_mark', name: 'Death Mark', icon: '💀', unlockLevel: 5, resource: 'stamina', cost: 30, cooldown: 4, kind: 'attack', power: 2.6, accuracyBonus: 0, effect: { type: 'debuff', stat: 'defense', amount: 8, turns: 3 }, description: 'Mark your prey: 260% damage and -8 defense for 3 turns.' },
      { id: 'shadow_master', name: 'Shadow Master', icon: '🌑', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { evasionAdd: 10 }, effect: null, description: 'Passive: your evasion is increased by 10.' },
    ],
  },

  cleric: {
    key: 'cleric',
    label: 'Cleric',
    blurb: 'A bulwark of faith. Steady damage, strong wards, and the power to mend flesh.',
    growthText: 'HP +10, Mana +10, Defense +2, Attack +2 per level.',
    base: { hp: 50, mana: 45, stamina: 30, attack: 9, defense: 6, accuracy: 30, evasion: 10, speed: 8 },
    growth: { hp: 10, mana: 10, stamina: 6, attack: 2, defense: 2, accuracy: 4, evasion: 2, speed: 1 },
    abilities: [
      { id: 'smite', name: 'Smite', icon: '✨', unlockLevel: 1, resource: 'mana', cost: 7, cooldown: 0, kind: 'attack', power: 1.3, accuracyBonus: 5, effect: null, description: 'A blow of holy light for 130% damage.' },
      { id: 'heal', name: 'Heal', icon: '💚', unlockLevel: 1, resource: 'mana', cost: 12, cooldown: 0, kind: 'heal', power: 0.22, accuracyBonus: 0, effect: null, description: 'Mend your wounds for 22% of max HP.' },
      { id: 'bless', name: 'Bless', icon: '🙏', unlockLevel: 2, resource: 'mana', cost: 14, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 5, turns: 3 }, description: 'Invoke your god: +5 attack for 3 turns.' },
      { id: 'purify', name: 'Purify', icon: '🕊️', unlockLevel: 2, resource: 'mana', cost: 14, cooldown: 3, kind: 'heal', power: 0.12, accuracyBonus: 0, effect: { type: 'cleanse' }, description: 'Cleanse all afflictions and heal 12% of max HP.' },
      { id: 'holy_lance', name: 'Holy Lance', icon: '🌟', unlockLevel: 3, resource: 'mana', cost: 18, cooldown: 2, kind: 'attack', power: 1.8, accuracyBonus: 5, effect: null, description: 'Pierce the wicked for 180% damage.' },
      { id: 'sanctuary', name: 'Sanctuary', icon: '⛪', unlockLevel: 3, resource: 'mana', cost: 18, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 11, turns: 3 }, description: 'A holy barrier: +11 defense for 3 turns.' },
      { id: 'divine_wrath', name: 'Divine Wrath', icon: '🔆', unlockLevel: 4, resource: 'mana', cost: 24, cooldown: 3, kind: 'attack', power: 2.3, accuracyBonus: 0, effect: null, description: 'Call down judgement for 230% damage.' },
      { id: 'greater_heal', name: 'Greater Heal', icon: '💖', unlockLevel: 4, resource: 'mana', cost: 24, cooldown: 2, kind: 'heal', power: 0.4, accuracyBonus: 0, effect: null, description: 'A powerful blessing restores 40% of max HP.' },
      { id: 'judgment', name: 'Judgment', icon: '⚖️', unlockLevel: 5, resource: 'mana', cost: 34, cooldown: 4, kind: 'attack', power: 3.0, accuracyBonus: 0, effect: null, description: 'The final verdict: 300% damage.' },
      { id: 'blessed_vitality', name: 'Blessed Vitality', icon: '🪬', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { hpMul: 1.2 }, effect: null, description: 'Passive: your maximum HP is increased by 20%.' },
    ],
  },
};

export const CLASS_KEYS = Object.keys(CLASSES);

export function abilitiesForClass(classKey, level) {
  const klass = CLASSES[classKey];
  if (!klass) throw new Error(`Unknown class: ${classKey}`);
  return klass.abilities.filter((a) => a.unlockLevel <= level);
}

export function findAbility(classKey, abilityId) {
  if (abilityId === 'basic') return BASIC_ATTACK;
  return CLASSES[classKey]?.abilities.find((a) => a.id === abilityId) || null;
}
