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
//
// Ability ids stay latin (stable keys for icons/persistence); all player-facing
// text (names, descriptions) is Russian.

export const BASIC_ATTACK = {
  id: 'basic', name: 'Атака', icon: '⚔️', unlockLevel: 1,
  resource: null, cost: 0, cooldown: 0, kind: 'attack', power: 1.0,
  accuracyBonus: 0, effect: null,
  description: 'Простой удар оружием. Не стоит ничего.',
};

export const CLASSES = {
  fighter: {
    key: 'fighter',
    label: 'Воин',
    blurb: 'Стена из стали. Огромный запас здоровья и выносливости, неудержим в ближнем бою.',
    growthText: 'Здоровье +14, выносливость +10, атака +3, защита +2, точность +4 за уровень.',
    base: { hp: 60, mana: 10, stamina: 50, attack: 12, defense: 8, accuracy: 30, evasion: 10, speed: 8 },
    growth: { hp: 14, mana: 2, stamina: 10, attack: 3, defense: 2, accuracy: 4, evasion: 2, speed: 1 },
    abilities: [
      { id: 'cleave', name: 'Разрубающий удар', icon: '🪓', unlockLevel: 1, resource: 'stamina', cost: 8, cooldown: 0, kind: 'attack', power: 1.2, accuracyBonus: 0, effect: null, description: 'Широкий замах. Наносит 120% урона от атаки.' },
      { id: 'shield_wall', name: 'Стена щитов', icon: '🛡️', unlockLevel: 1, resource: 'stamina', cost: 10, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 6, turns: 3 }, description: 'Укрыться за щитом: +6 защиты на 3 хода.' },
      { id: 'power_strike', name: 'Мощный удар', icon: '💥', unlockLevel: 2, resource: 'stamina', cost: 14, cooldown: 2, kind: 'attack', power: 1.6, accuracyBonus: -5, effect: null, description: 'Тяжёлый удар сверху. 160% урона, чуть менее точен.' },
      { id: 'battle_cry', name: 'Боевой клич', icon: '📣', unlockLevel: 2, resource: 'stamina', cost: 12, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 5, turns: 3 }, description: 'Яростный рёв: +5 атаки на 3 хода.' },
      { id: 'rend', name: 'Разрывание', icon: '🩸', unlockLevel: 3, resource: 'stamina', cost: 13, cooldown: 2, kind: 'attack', power: 1.1, accuracyBonus: 0, effect: { type: 'dot', name: 'кровотечение', damage: 5, turns: 3 }, description: 'Разодрать рану, что кровоточит на 5 урона за 3 хода.' },
      { id: 'second_wind', name: 'Второе дыхание', icon: '💨', unlockLevel: 3, resource: 'stamina', cost: 18, cooldown: 4, kind: 'heal', power: 0.3, accuracyBonus: 0, effect: null, description: 'Стряхнуть раны и восстановить 30% здоровья.' },
      { id: 'whirlwind', name: 'Вихрь', icon: '🌀', unlockLevel: 4, resource: 'stamina', cost: 22, cooldown: 3, kind: 'attack', power: 2.0, accuracyBonus: 0, effect: null, description: 'Раскрутиться сквозь врага: 200% урона.' },
      { id: 'fortify', name: 'Укрепление', icon: '🏰', unlockLevel: 4, resource: 'stamina', cost: 20, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 12, turns: 3 }, description: 'Стать железной твердыней: +12 защиты на 3 хода.' },
      { id: 'execute', name: 'Казнь', icon: '☠️', unlockLevel: 5, resource: 'stamina', cost: 28, cooldown: 4, kind: 'attack', power: 2.8, accuracyBonus: 0, effect: null, description: 'Смертельный удар, наносящий 280% урона.' },
      { id: 'unbreakable', name: 'Несокрушимость', icon: '🪨', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { hpMul: 1.2 }, effect: null, description: 'Пассивно: максимум здоровья +20%.' },
    ],
  },

  wizard: {
    key: 'wizard',
    label: 'Волшебник',
    blurb: 'Учёный губительной силы. Огромная мана, сокрушительные чары, хрупкое тело.',
    growthText: 'Здоровье +6, мана +14, атака +2, защита +1, точность +5 за уровень.',
    base: { hp: 35, mana: 60, stamina: 20, attack: 7, defense: 3, accuracy: 28, evasion: 8, speed: 7 },
    growth: { hp: 6, mana: 14, stamina: 4, attack: 2, defense: 1, accuracy: 5, evasion: 2, speed: 1 },
    abilities: [
      { id: 'fire_bolt', name: 'Огненный снаряд', icon: '🔥', unlockLevel: 1, resource: 'mana', cost: 8, cooldown: 0, kind: 'attack', power: 1.3, accuracyBonus: 5, effect: null, description: 'Дротик пламени. 130% урона, точен.' },
      { id: 'arcane_shield', name: 'Магический щит', icon: '🔷', unlockLevel: 1, resource: 'mana', cost: 10, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 5, turns: 3 }, description: 'Мерцающий оберег: +5 защиты на 3 хода.' },
      { id: 'frost_nova', name: 'Ледяная вспышка', icon: '❄️', unlockLevel: 2, resource: 'mana', cost: 16, cooldown: 2, kind: 'attack', power: 1.5, accuracyBonus: 0, effect: { type: 'debuff', stat: 'speed', amount: -3, turns: 3 }, description: 'Взрыв инея: 150% урона и замедление врага.' },
      { id: 'mana_surge', name: 'Прилив маны', icon: '🔹', unlockLevel: 2, resource: null, cost: 0, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'restore', resource: 'mana', amount: 25 }, description: 'Обратиться к ткани мира и восстановить 25 маны.' },
      { id: 'lightning_lance', name: 'Копьё молнии', icon: '⚡', unlockLevel: 3, resource: 'mana', cost: 20, cooldown: 2, kind: 'attack', power: 1.9, accuracyBonus: 5, effect: null, description: 'Копьё из молний на 190% урона.' },
      { id: 'mage_armor', name: 'Доспех мага', icon: '🧿', unlockLevel: 3, resource: 'mana', cost: 18, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 10, turns: 3 }, description: 'Закалённые глифы: +10 защиты на 3 хода.' },
      { id: 'chain_lightning', name: 'Цепная молния', icon: '🌩️', unlockLevel: 4, resource: 'mana', cost: 26, cooldown: 3, kind: 'attack', power: 2.2, accuracyBonus: 5, effect: null, description: 'Дуговой разряд на 220% урона.' },
      { id: 'drain_life', name: 'Вытягивание жизни', icon: '🩻', unlockLevel: 4, resource: 'mana', cost: 22, cooldown: 2, kind: 'attack', power: 1.6, accuracyBonus: 0, effect: { type: 'leech', ratio: 0.5 }, description: 'Нанести 160% урона и исцелиться наполовину.' },
      { id: 'meteor', name: 'Метеор', icon: '☄️', unlockLevel: 5, resource: 'mana', cost: 40, cooldown: 4, kind: 'attack', power: 3.0, accuracyBonus: 0, effect: null, description: 'Низвести пылающую звезду: 300% урона.' },
      { id: 'arcane_mastery', name: 'Мастерство тайной магии', icon: '📘', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { manaMul: 1.25 }, effect: null, description: 'Пассивно: максимум маны +25%.' },
    ],
  },

  rogue: {
    key: 'rogue',
    label: 'Плут',
    blurb: 'Быстрый и беспощадный. Бьёт первым, бьёт больно и почти не получает ударов.',
    growthText: 'Здоровье +9, выносливость +11, атака +3, уклонение +3, скорость +2 за уровень.',
    base: { hp: 45, mana: 20, stamina: 55, attack: 11, defense: 5, accuracy: 38, evasion: 18, speed: 12 },
    growth: { hp: 9, mana: 4, stamina: 11, attack: 3, defense: 1, accuracy: 5, evasion: 3, speed: 2 },
    abilities: [
      { id: 'backstab', name: 'Удар в спину', icon: '🗡️', unlockLevel: 1, resource: 'stamina', cost: 9, cooldown: 0, kind: 'attack', power: 1.4, accuracyBonus: 5, effect: null, description: 'Удар в уязвимое место: 140% урона.' },
      { id: 'evade', name: 'Уклонение', icon: '👣', unlockLevel: 1, resource: 'stamina', cost: 8, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'evasion', amount: 8, turns: 3 }, description: 'Скользить как вода: +8 уклонения на 3 хода.' },
      { id: 'poison_blade', name: 'Отравленный клинок', icon: '🧪', unlockLevel: 2, resource: 'stamina', cost: 13, cooldown: 2, kind: 'attack', power: 1.2, accuracyBonus: 0, effect: { type: 'dot', name: 'яд', damage: 6, turns: 3 }, description: 'Смазать клинок: +6 урона ядом за 3 хода.' },
      { id: 'quick_step', name: 'Быстрый шаг', icon: '💫', unlockLevel: 2, resource: 'stamina', cost: 10, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'speed', amount: 4, turns: 3 }, description: 'Ускориться: +4 скорости на 3 хода.' },
      { id: 'fan_of_knives', name: 'Веер клинков', icon: '🔪', unlockLevel: 3, resource: 'stamina', cost: 18, cooldown: 2, kind: 'attack', power: 1.8, accuracyBonus: 0, effect: null, description: 'Швырнуть веер стали: 180% урона.' },
      { id: 'smoke_bomb', name: 'Дымовая бомба', icon: '💨', unlockLevel: 3, resource: 'stamina', cost: 16, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'evasion', amount: 15, turns: 2 }, description: 'Исчезнуть в дыму: +15 уклонения на 2 хода.' },
      { id: 'assassinate', name: 'Убийство', icon: '🎯', unlockLevel: 4, resource: 'stamina', cost: 24, cooldown: 3, kind: 'attack', power: 2.4, accuracyBonus: 5, effect: null, description: 'Смертельный удар на 240% урона.' },
      { id: 'adrenaline', name: 'Адреналин', icon: '⚗️', unlockLevel: 4, resource: null, cost: 0, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'restore', resource: 'stamina', amount: 30 }, description: 'Прилив энергии восстанавливает 30 выносливости.' },
      { id: 'death_mark', name: 'Метка смерти', icon: '💀', unlockLevel: 5, resource: 'stamina', cost: 30, cooldown: 4, kind: 'attack', power: 2.6, accuracyBonus: 0, effect: { type: 'debuff', stat: 'defense', amount: -8, turns: 3 }, description: 'Отметить добычу: 260% урона и -8 защиты на 3 хода.' },
      { id: 'shadow_master', name: 'Владыка теней', icon: '🌑', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { evasionAdd: 10 }, effect: null, description: 'Пассивно: уклонение +10.' },
    ],
  },

  cleric: {
    key: 'cleric',
    label: 'Жрец',
    blurb: 'Оплот веры. Ровный урон, крепкие обереги и власть над плотью.',
    growthText: 'Здоровье +10, мана +10, защита +2, атака +2 за уровень.',
    base: { hp: 50, mana: 45, stamina: 30, attack: 9, defense: 6, accuracy: 30, evasion: 10, speed: 8 },
    growth: { hp: 10, mana: 10, stamina: 6, attack: 2, defense: 2, accuracy: 4, evasion: 2, speed: 1 },
    abilities: [
      { id: 'smite', name: 'Кара', icon: '✨', unlockLevel: 1, resource: 'mana', cost: 7, cooldown: 0, kind: 'attack', power: 1.3, accuracyBonus: 5, effect: null, description: 'Удар святого света на 130% урона.' },
      { id: 'heal', name: 'Лечение', icon: '💚', unlockLevel: 1, resource: 'mana', cost: 12, cooldown: 0, kind: 'heal', power: 0.22, accuracyBonus: 0, effect: null, description: 'Залечить раны на 22% здоровья.' },
      { id: 'bless', name: 'Благословение', icon: '🙏', unlockLevel: 2, resource: 'mana', cost: 14, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 5, turns: 3 }, description: 'Воззвать к богу: +5 атаки на 3 хода.' },
      { id: 'purify', name: 'Очищение', icon: '🕊️', unlockLevel: 2, resource: 'mana', cost: 14, cooldown: 3, kind: 'heal', power: 0.12, accuracyBonus: 0, effect: { type: 'cleanse' }, description: 'Снять все недуги и восстановить 12% здоровья.' },
      { id: 'holy_lance', name: 'Святое копьё', icon: '🌟', unlockLevel: 3, resource: 'mana', cost: 18, cooldown: 2, kind: 'attack', power: 1.8, accuracyBonus: 5, effect: null, description: 'Прошить нечестивых: 180% урона.' },
      { id: 'sanctuary', name: 'Убежище', icon: '⛪', unlockLevel: 3, resource: 'mana', cost: 18, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 11, turns: 3 }, description: 'Святой барьер: +11 защиты на 3 хода.' },
      { id: 'divine_wrath', name: 'Божественный гнев', icon: '🔆', unlockLevel: 4, resource: 'mana', cost: 24, cooldown: 3, kind: 'attack', power: 2.3, accuracyBonus: 0, effect: null, description: 'Низвести суд: 230% урона.' },
      { id: 'greater_heal', name: 'Великое лечение', icon: '💖', unlockLevel: 4, resource: 'mana', cost: 24, cooldown: 2, kind: 'heal', power: 0.4, accuracyBonus: 0, effect: null, description: 'Мощное благословение восстанавливает 40% здоровья.' },
      { id: 'judgment', name: 'Суд', icon: '⚖️', unlockLevel: 5, resource: 'mana', cost: 34, cooldown: 4, kind: 'attack', power: 3.0, accuracyBonus: 0, effect: null, description: 'Окончательный приговор: 300% урона.' },
      { id: 'blessed_vitality', name: 'Благословенная жизненная сила', icon: '🪬', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { hpMul: 1.2 }, effect: null, description: 'Пассивно: максимум здоровья +20%.' },
    ],
  },
  barbarian: {
    key: 'barbarian',
    label: 'Варвар',
    blurb: 'Ярость во плоти. Гора здоровья и сокрушительные удары, но тонкая защита.',
    growthText: 'Здоровье +16, выносливость +12, атака +4, защита +1, точность +3 за уровень.',
    base: { hp: 70, mana: 5, stamina: 60, attack: 14, defense: 4, accuracy: 26, evasion: 8, speed: 9 },
    growth: { hp: 16, mana: 1, stamina: 12, attack: 4, defense: 1, accuracy: 3, evasion: 2, speed: 1 },
    abilities: [
      { id: 'rage', name: 'Ярость', icon: '😡', unlockLevel: 1, resource: 'stamina', cost: 12, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 6, turns: 3 }, description: 'Впасть в ярость: +6 атаки на 3 хода.' },
      { id: 'reckless_strike', name: 'Безрассудный удар', icon: '💢', unlockLevel: 1, resource: 'stamina', cost: 9, cooldown: 0, kind: 'attack', power: 1.35, accuracyBonus: 5, effect: null, description: 'Открыться, но ударить на 135% урона.' },
      { id: 'wide_swing', name: 'Размашистый удар', icon: '🪓', unlockLevel: 2, resource: 'stamina', cost: 14, cooldown: 2, kind: 'attack', power: 1.5, accuracyBonus: 0, effect: null, description: 'Обрушить оружие: 150% урона.' },
      { id: 'thick_skin', name: 'Толстая кожа', icon: '🛡️', unlockLevel: 2, resource: 'stamina', cost: 12, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 7, turns: 3 }, description: 'Закалиться: +7 защиты на 3 хода.' },
      { id: 'brutal_blow', name: 'Жестокий удар', icon: '💥', unlockLevel: 3, resource: 'stamina', cost: 20, cooldown: 2, kind: 'attack', power: 1.9, accuracyBonus: -5, effect: null, description: 'Сокрушительный удар на 190% урона, менее точный.' },
      { id: 'blood_rage', name: 'Кровавая ярость', icon: '🩸', unlockLevel: 3, resource: 'stamina', cost: 22, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 10, turns: 3 }, description: 'Распалиться: +10 атаки на 3 хода.' },
      { id: 'rampage', name: 'Неистовство', icon: '🌀', unlockLevel: 4, resource: 'stamina', cost: 26, cooldown: 3, kind: 'attack', power: 2.3, accuracyBonus: 0, effect: null, description: 'Снести всё на пути: 230% урона.' },
      { id: 'wild_heal', name: 'Дикое восстановление', icon: '💚', unlockLevel: 4, resource: 'stamina', cost: 24, cooldown: 4, kind: 'heal', power: 0.35, accuracyBonus: 0, effect: null, description: 'Перетерпеть боль, вернув 35% здоровья.' },
      { id: 'executioner', name: 'Палач', icon: '☠️', unlockLevel: 5, resource: 'stamina', cost: 30, cooldown: 4, kind: 'attack', power: 2.9, accuracyBonus: -5, effect: null, description: 'Обрекающий удар на 290% урона.' },
      { id: 'berserker', name: 'Берсерк', icon: '🪨', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { attackAdd: 6 }, effect: null, description: 'Пассивно: атака +6.' },
    ],
  },

  bard: {
    key: 'bard',
    label: 'Бард',
    blurb: 'Мастер слов и песен. Поднимает дух союзникам и терзает врагов диссонансом.',
    growthText: 'Здоровье +8, мана +12, выносливость +6, атака +2, точность +5, скорость +2 за уровень.',
    base: { hp: 42, mana: 50, stamina: 30, attack: 9, defense: 5, accuracy: 32, evasion: 12, speed: 10 },
    growth: { hp: 8, mana: 12, stamina: 6, attack: 2, defense: 1, accuracy: 5, evasion: 2, speed: 2 },
    abilities: [
      { id: 'vicious_mockery', name: 'Едкая насмешка', icon: '🎭', unlockLevel: 1, resource: 'mana', cost: 6, cooldown: 0, kind: 'attack', power: 1.2, accuracyBonus: 5, effect: null, description: 'Уязвить словом: 120% урона, точно.' },
      { id: 'inspiring_song', name: 'Вдохновляющая песня', icon: '🎵', unlockLevel: 1, resource: 'mana', cost: 10, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 5, turns: 3 }, description: 'Воспеть доблесть: +5 атаки на 3 хода.' },
      { id: 'healing_ballad', name: 'Целебная баллада', icon: '🎶', unlockLevel: 2, resource: 'mana', cost: 12, cooldown: 0, kind: 'heal', power: 0.22, accuracyBonus: 0, effect: null, description: 'Баллада, затягивающая раны на 22% здоровья.' },
      { id: 'discordant_note', name: 'Диссонанс', icon: '🎸', unlockLevel: 2, resource: 'mana', cost: 14, cooldown: 2, kind: 'attack', power: 1.4, accuracyBonus: 0, effect: { type: 'debuff', stat: 'defense', amount: -5, turns: 3 }, description: 'Резкий аккорд: 140% урона и -5 защиты на 3 хода.' },
      { id: 'mesmerizing_tune', name: 'Чарующий мотив', icon: '🪕', unlockLevel: 3, resource: 'mana', cost: 14, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'debuff', stat: 'speed', amount: -4, turns: 3 }, description: 'Заворожить врага: -4 скорости на 3 хода.' },
      { id: 'soothing_melody', name: 'Успокаивающая мелодия', icon: '🎼', unlockLevel: 3, resource: 'mana', cost: 16, cooldown: 2, kind: 'heal', power: 0.3, accuracyBonus: 0, effect: null, description: 'Мелодия покоя: восстановить 30% здоровья.' },
      { id: 'heroic_anthem', name: 'Героический гимн', icon: '📯', unlockLevel: 4, resource: 'mana', cost: 20, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 8, turns: 3 }, description: 'Гимн героям: +8 атаки на 3 хода.' },
      { id: 'shatter_cry', name: 'Крик-разрушение', icon: '📢', unlockLevel: 4, resource: 'mana', cost: 22, cooldown: 3, kind: 'attack', power: 1.9, accuracyBonus: 0, effect: { type: 'debuff', stat: 'defense', amount: -7, turns: 3 }, description: 'Сотрясающий вопль: 190% урона и -7 защиты на 3 хода.' },
      { id: 'requiem', name: 'Реквием', icon: '🎻', unlockLevel: 5, resource: 'mana', cost: 34, cooldown: 4, kind: 'attack', power: 2.6, accuracyBonus: 0, effect: null, description: 'Погребальная песнь на 260% урона.' },
      { id: 'master_maestro', name: 'Маэстро', icon: '📜', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { manaMul: 1.25 }, effect: null, description: 'Пассивно: максимум маны +25%.' },
    ],
  },

  druid: {
    key: 'druid',
    label: 'Друид',
    blurb: 'Голос дикой природы. Яды, обновление и звериная стойкость против скверны.',
    growthText: 'Здоровье +10, мана +11, выносливость +6, атака +2, защита +2, точность +4 за уровень.',
    base: { hp: 48, mana: 50, stamina: 30, attack: 9, defense: 6, accuracy: 30, evasion: 10, speed: 9 },
    growth: { hp: 10, mana: 11, stamina: 6, attack: 2, defense: 2, accuracy: 4, evasion: 2, speed: 1 },
    abilities: [
      { id: 'thorn_whip', name: 'Терновый хлыст', icon: '🌿', unlockLevel: 1, resource: 'mana', cost: 7, cooldown: 0, kind: 'attack', power: 1.25, accuracyBonus: 5, effect: null, description: 'Хлестнуть терниями: 125% урона, точно.' },
      { id: 'regrowth', name: 'Обновление', icon: '🌱', unlockLevel: 1, resource: 'mana', cost: 12, cooldown: 0, kind: 'heal', power: 0.22, accuracyBonus: 0, effect: null, description: 'Взрастить плоть заново: 22% здоровья.' },
      { id: 'entangling_roots', name: 'Опутывающие корни', icon: '🌳', unlockLevel: 2, resource: 'mana', cost: 15, cooldown: 2, kind: 'attack', power: 1.3, accuracyBonus: 0, effect: { type: 'debuff', stat: 'speed', amount: -4, turns: 3 }, description: 'Сковать корнями: 130% урона и -4 скорости на 3 хода.' },
      { id: 'bark_skin', name: 'Кора-кожа', icon: '🪵', unlockLevel: 2, resource: 'mana', cost: 14, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 7, turns: 3 }, description: 'Обрасти корой: +7 защиты на 3 хода.' },
      { id: 'venom_bloom', name: 'Ядовитое цветение', icon: '🍄', unlockLevel: 3, resource: 'mana', cost: 16, cooldown: 2, kind: 'attack', power: 1.4, accuracyBonus: 0, effect: { type: 'dot', name: 'яд', damage: 6, turns: 3 }, description: 'Расцвести ядом: +6 урона ядом за 3 хода.' },
      { id: 'rejuvenate', name: 'Омоложение', icon: '💚', unlockLevel: 3, resource: 'mana', cost: 18, cooldown: 2, kind: 'heal', power: 0.32, accuracyBonus: 0, effect: null, description: 'Восстановить 32% здоровья.' },
      { id: 'sunbeam', name: 'Солнечный луч', icon: '☀️', unlockLevel: 4, resource: 'mana', cost: 24, cooldown: 3, kind: 'attack', power: 2.1, accuracyBonus: 5, effect: null, description: 'Испепелить светом: 210% урона.' },
      { id: 'nature_ward', name: 'Природный оберег', icon: '🍃', unlockLevel: 4, resource: 'mana', cost: 20, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 12, turns: 3 }, description: 'Окутать себя природой: +12 защиты на 3 хода.' },
      { id: 'wildfire', name: 'Дикое пламя', icon: '🔥', unlockLevel: 5, resource: 'mana', cost: 34, cooldown: 4, kind: 'attack', power: 2.7, accuracyBonus: 0, effect: null, description: 'Испустить лесной пожар: 270% урона.' },
      { id: 'one_with_nature', name: 'Единство с природой', icon: '🌲', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { hpMul: 1.15 }, effect: null, description: 'Пассивно: максимум здоровья +15%.' },
    ],
  },

  monk: {
    key: 'monk',
    label: 'Монах',
    blurb: 'Живое оружие. Быстрые серии ударов, текучее уклонение и внутренняя сила ки.',
    growthText: 'Здоровье +10, выносливость +12, атака +3, защита +2, уклонение +3, скорость +2 за уровень.',
    base: { hp: 50, mana: 20, stamina: 60, attack: 12, defense: 7, accuracy: 36, evasion: 16, speed: 13 },
    growth: { hp: 10, mana: 3, stamina: 12, attack: 3, defense: 2, accuracy: 5, evasion: 3, speed: 2 },
    abilities: [
      { id: 'flurry_of_blows', name: 'Шквал ударов', icon: '👊', unlockLevel: 1, resource: 'stamina', cost: 7, cooldown: 0, kind: 'attack', power: 1.2, accuracyBonus: 8, effect: null, description: 'Быстрая серия: 120% урона, очень точная.' },
      { id: 'patient_defense', name: 'Стойкая защита', icon: '🧘', unlockLevel: 1, resource: 'stamina', cost: 8, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'evasion', amount: 8, turns: 3 }, description: 'Сосредоточиться: +8 уклонения на 3 хода.' },
      { id: 'pressure_point', name: 'Удар по болевой точке', icon: '🎯', unlockLevel: 2, resource: 'stamina', cost: 13, cooldown: 2, kind: 'attack', power: 1.4, accuracyBonus: 5, effect: null, description: 'Точный удар в уязвимость: 140% урона.' },
      { id: 'ki_focus', name: 'Сосредоточение ки', icon: '💠', unlockLevel: 2, resource: null, cost: 0, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'restore', resource: 'stamina', amount: 25 }, description: 'Направить ки: восстановить 25 выносливости.' },
      { id: 'roundhouse', name: 'Круговой удар', icon: '🦵', unlockLevel: 3, resource: 'stamina', cost: 18, cooldown: 2, kind: 'attack', power: 1.8, accuracyBonus: 0, effect: null, description: 'Разворот с ударом: 180% урона.' },
      { id: 'flowing_water', name: 'Текущая вода', icon: '💧', unlockLevel: 3, resource: 'stamina', cost: 16, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'evasion', amount: 15, turns: 2 }, description: 'Стать водой: +15 уклонения на 2 хода.' },
      { id: 'quivering_palm', name: 'Дрожащая ладонь', icon: '🖐️', unlockLevel: 4, resource: 'stamina', cost: 24, cooldown: 3, kind: 'attack', power: 2.3, accuracyBonus: 5, effect: null, description: 'Удар скрытой силы: 230% урона.' },
      { id: 'inner_peace', name: 'Внутренний покой', icon: '🕊️', unlockLevel: 4, resource: 'stamina', cost: 22, cooldown: 4, kind: 'heal', power: 0.35, accuracyBonus: 0, effect: null, description: 'Дыхание покоя: восстановить 35% здоровья.' },
      { id: 'dragon_kick', name: 'Удар дракона', icon: '🐉', unlockLevel: 5, resource: 'stamina', cost: 30, cooldown: 4, kind: 'attack', power: 2.7, accuracyBonus: 0, effect: null, description: 'Сокрушительный пинок: 270% урона.' },
      { id: 'perfect_body', name: 'Совершенное тело', icon: '⚪', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { evasionAdd: 10 }, effect: null, description: 'Пассивно: уклонение +10.' },
    ],
  },

  paladin: {
    key: 'paladin',
    label: 'Паладин',
    blurb: 'Святая сталь и ауры. Крепкий щит веры, что карает нечестивых и врачует раны.',
    growthText: 'Здоровье +12, мана +9, выносливость +8, атака +3, защита +2, точность +4 за уровень.',
    base: { hp: 58, mana: 40, stamina: 40, attack: 11, defense: 9, accuracy: 30, evasion: 8, speed: 8 },
    growth: { hp: 12, mana: 9, stamina: 8, attack: 3, defense: 2, accuracy: 4, evasion: 2, speed: 1 },
    abilities: [
      { id: 'holy_strike', name: 'Священный удар', icon: '✨', unlockLevel: 1, resource: 'mana', cost: 7, cooldown: 0, kind: 'attack', power: 1.3, accuracyBonus: 5, effect: null, description: 'Удар освящённым оружием: 130% урона.' },
      { id: 'lay_on_hands', name: 'Возложение рук', icon: '🤲', unlockLevel: 1, resource: 'mana', cost: 14, cooldown: 1, kind: 'heal', power: 0.25, accuracyBonus: 0, effect: null, description: 'Исцелить касанием: 25% здоровья.' },
      { id: 'shield_of_faith', name: 'Щит веры', icon: '🛡️', unlockLevel: 2, resource: 'mana', cost: 14, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 8, turns: 3 }, description: 'Вера как броня: +8 защиты на 3 хода.' },
      { id: 'divine_favor', name: 'Божья милость', icon: '🙏', unlockLevel: 2, resource: 'mana', cost: 13, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 5, turns: 3 }, description: 'Снискать милость: +5 атаки на 3 хода.' },
      { id: 'consecrate', name: 'Освящение', icon: '🔆', unlockLevel: 3, resource: 'mana', cost: 18, cooldown: 2, kind: 'attack', power: 1.6, accuracyBonus: 0, effect: { type: 'dot', name: 'святое пламя', damage: 5, turns: 3 }, description: 'Освятить землю: +5 урона святым пламенем за 3 хода.' },
      { id: 'aura_of_warding', name: 'Аура защиты', icon: '⛨', unlockLevel: 3, resource: 'mana', cost: 16, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 6, turns: 3 }, description: 'Излучать защиту: +6 защиты на 3 хода.' },
      { id: 'avenging_smite', name: 'Кара возмездия', icon: '⚔️', unlockLevel: 4, resource: 'mana', cost: 24, cooldown: 3, kind: 'attack', power: 2.2, accuracyBonus: 5, effect: null, description: 'Обрушить кару: 220% урона.' },
      { id: 'greater_blessing', name: 'Великое благословение', icon: '💖', unlockLevel: 4, resource: 'mana', cost: 26, cooldown: 3, kind: 'heal', power: 0.4, accuracyBonus: 0, effect: null, description: 'Щедрое благословение: 40% здоровья.' },
      { id: 'divine_judgment', name: 'Божественный суд', icon: '⚖️', unlockLevel: 5, resource: 'mana', cost: 36, cooldown: 4, kind: 'attack', power: 2.9, accuracyBonus: 0, effect: null, description: 'Небесный приговор: 290% урона.' },
      { id: 'aura_mastery', name: 'Владыка аур', icon: '🪬', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { hpMul: 1.2 }, effect: null, description: 'Пассивно: максимум здоровья +20%.' },
    ],
  },

  ranger: {
    key: 'ranger',
    label: 'Следопыт',
    blurb: 'Меткий охотник дальнего боя. Яды, метки на цель и смертоносные залпы.',
    growthText: 'Здоровье +9, выносливость +11, атака +3, защита +1, точность +5, уклонение +3 за уровень.',
    base: { hp: 46, mana: 25, stamina: 55, attack: 12, defense: 5, accuracy: 40, evasion: 14, speed: 12 },
    growth: { hp: 9, mana: 5, stamina: 11, attack: 3, defense: 1, accuracy: 5, evasion: 3, speed: 2 },
    abilities: [
      { id: 'precise_shot', name: 'Точный выстрел', icon: '🏹', unlockLevel: 1, resource: 'stamina', cost: 8, cooldown: 0, kind: 'attack', power: 1.35, accuracyBonus: 8, effect: null, description: 'Прицельный выстрел: 135% урона, очень точный.' },
      { id: 'hunters_mark', name: 'Метка охотника', icon: '🎯', unlockLevel: 1, resource: 'stamina', cost: 12, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'debuff', stat: 'defense', amount: -6, turns: 3 }, description: 'Отметить добычу: -6 защиты на 3 хода.' },
      { id: 'twin_shot', name: 'Двойной выстрел', icon: '🏹', unlockLevel: 2, resource: 'stamina', cost: 14, cooldown: 2, kind: 'attack', power: 1.6, accuracyBonus: 0, effect: null, description: 'Две стрелы подряд: 160% урона.' },
      { id: 'camouflage', name: 'Маскировка', icon: '🌫️', unlockLevel: 2, resource: 'stamina', cost: 12, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'evasion', amount: 10, turns: 3 }, description: 'Слиться с местностью: +10 уклонения на 3 хода.' },
      { id: 'venom_arrow', name: 'Отравленная стрела', icon: '🧪', unlockLevel: 3, resource: 'stamina', cost: 16, cooldown: 2, kind: 'attack', power: 1.3, accuracyBonus: 5, effect: { type: 'dot', name: 'яд', damage: 7, turns: 3 }, description: 'Стрела с ядом: +7 урона ядом за 3 хода.' },
      { id: 'natural_recovery', name: 'Природное восстановление', icon: '🍃', unlockLevel: 3, resource: null, cost: 0, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'restore', resource: 'stamina', amount: 30 }, description: 'Перевести дух: восстановить 30 выносливости.' },
      { id: 'volley', name: 'Залп', icon: '🎇', unlockLevel: 4, resource: 'stamina', cost: 24, cooldown: 3, kind: 'attack', power: 2.2, accuracyBonus: 5, effect: null, description: 'Град стрел: 220% урона.' },
      { id: 'beasts_bond', name: 'Связь со зверем', icon: '🐺', unlockLevel: 4, resource: 'stamina', cost: 22, cooldown: 4, kind: 'heal', power: 0.35, accuracyBonus: 0, effect: null, description: 'Заручиться духом зверя: 35% здоровья.' },
      { id: 'piercing_shot', name: 'Пронзающий выстрел', icon: '🎯', unlockLevel: 5, resource: 'stamina', cost: 32, cooldown: 4, kind: 'attack', power: 2.8, accuracyBonus: 5, effect: null, description: 'Пробивной выстрел: 280% урона.' },
      { id: 'eagle_eye', name: 'Орлиный глаз', icon: '👁️', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { attackAdd: 5 }, effect: null, description: 'Пассивно: атака +5.' },
    ],
  },

  sorcerer: {
    key: 'sorcerer',
    label: 'Чародей',
    blurb: 'Магия в крови. Не учится — повелевает, выплёскивая сырую разрушительную силу.',
    growthText: 'Здоровье +6, мана +15, атака +3, защита +1, точность +5 за уровень.',
    base: { hp: 36, mana: 62, stamina: 18, attack: 8, defense: 3, accuracy: 30, evasion: 8, speed: 8 },
    growth: { hp: 6, mana: 15, stamina: 4, attack: 3, defense: 1, accuracy: 5, evasion: 2, speed: 1 },
    abilities: [
      { id: 'chaos_bolt', name: 'Сгусток хаоса', icon: '🌀', unlockLevel: 1, resource: 'mana', cost: 8, cooldown: 0, kind: 'attack', power: 1.35, accuracyBonus: 5, effect: null, description: 'Сырая сила: 135% урона, точна.' },
      { id: 'draconic_ward', name: 'Драконья защита', icon: '🐲', unlockLevel: 1, resource: 'mana', cost: 10, cooldown: 3, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 5, turns: 3 }, description: 'Чешуя предков: +5 защиты на 3 хода.' },
      { id: 'scorching_ray', name: 'Палящий луч', icon: '🔥', unlockLevel: 2, resource: 'mana', cost: 16, cooldown: 2, kind: 'attack', power: 1.6, accuracyBonus: 5, effect: null, description: 'Жгучий луч: 160% урона.' },
      { id: 'sorcerous_restore', name: 'Восстановление силы', icon: '🔹', unlockLevel: 2, resource: null, cost: 0, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'restore', resource: 'mana', amount: 28 }, description: 'Вскипятить кровь: восстановить 28 маны.' },
      { id: 'lightning_arc', name: 'Дуга молнии', icon: '⚡', unlockLevel: 3, resource: 'mana', cost: 20, cooldown: 2, kind: 'attack', power: 1.9, accuracyBonus: 5, effect: null, description: 'Разряд молнии: 190% урона.' },
      { id: 'mirror_image', name: 'Зеркальный образ', icon: '🪞', unlockLevel: 3, resource: 'mana', cost: 18, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'evasion', amount: 12, turns: 3 }, description: 'Раздвоиться: +12 уклонения на 3 хода.' },
      { id: 'fireball', name: 'Огненный шар', icon: '☄️', unlockLevel: 4, resource: 'mana', cost: 26, cooldown: 3, kind: 'attack', power: 2.3, accuracyBonus: 0, effect: null, description: 'Взрыв пламени: 230% урона.' },
      { id: 'empowered_spell', name: 'Усиленное заклинание', icon: '📘', unlockLevel: 4, resource: 'mana', cost: 22, cooldown: 4, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 9, turns: 3 }, description: 'Переполнить чары: +9 атаки на 3 хода.' },
      { id: 'meteor_swarm', name: 'Рой метеоров', icon: '🌠', unlockLevel: 5, resource: 'mana', cost: 40, cooldown: 4, kind: 'attack', power: 3.0, accuracyBonus: 0, effect: null, description: 'Небеса падают: 300% урона.' },
      { id: 'innate_power', name: 'Врождённая мощь', icon: '🔮', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { manaMul: 1.25 }, effect: null, description: 'Пассивно: максимум маны +25%.' },
    ],
  },

  warlock: {
    key: 'warlock',
    label: 'Колдун',
    blurb: 'Продал душу за силу. Тёмный пакт, проклятия и вытягивание чужой жизни.',
    growthText: 'Здоровье +9, мана +12, выносливость +5, атака +3, защита +2, точность +4 за уровень.',
    base: { hp: 44, mana: 52, stamina: 26, attack: 10, defense: 6, accuracy: 30, evasion: 10, speed: 9 },
    growth: { hp: 9, mana: 12, stamina: 5, attack: 3, defense: 2, accuracy: 4, evasion: 2, speed: 1 },
    abilities: [
      { id: 'eldritch_blast', name: 'Мистический заряд', icon: '🌌', unlockLevel: 1, resource: 'mana', cost: 7, cooldown: 0, kind: 'attack', power: 1.3, accuracyBonus: 5, effect: null, description: 'Заряд чужой силы: 130% урона, точен.' },
      { id: 'dark_pact', name: 'Тёмный пакт', icon: '📜', unlockLevel: 1, resource: 'mana', cost: 12, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'attack', amount: 5, turns: 3 }, description: 'Воззвать к покровителю: +5 атаки на 3 хода.' },
      { id: 'hex', name: 'Сглаз', icon: '🕯️', unlockLevel: 2, resource: 'mana', cost: 14, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'debuff', stat: 'defense', amount: -6, turns: 3 }, description: 'Проклясть: -6 защиты на 3 хода.' },
      { id: 'siphon_life', name: 'Вытягивание жизни', icon: '🩸', unlockLevel: 2, resource: 'mana', cost: 20, cooldown: 2, kind: 'attack', power: 1.5, accuracyBonus: 0, effect: { type: 'leech', ratio: 0.5 }, description: 'Выпить жизнь: 150% урона и исцеление наполовину.' },
      { id: 'curse_of_weakness', name: 'Проклятие слабости', icon: '💀', unlockLevel: 3, resource: 'mana', cost: 16, cooldown: 3, kind: 'buff', power: 0, accuracyBonus: 0, effect: { type: 'debuff', stat: 'attack', amount: -6, turns: 3 }, description: 'Обессилить врага: -6 атаки на 3 хода.' },
      { id: 'shadow_heal', name: 'Теневое лечение', icon: '🌑', unlockLevel: 3, resource: 'mana', cost: 18, cooldown: 2, kind: 'heal', power: 0.3, accuracyBonus: 0, effect: null, description: 'Затянуть раны тьмой: 30% здоровья.' },
      { id: 'soul_rend', name: 'Разрыв души', icon: '😱', unlockLevel: 4, resource: 'mana', cost: 24, cooldown: 3, kind: 'attack', power: 2.2, accuracyBonus: 0, effect: null, description: 'Терзать душу: 220% урона.' },
      { id: 'infernal_shield', name: 'Адский щит', icon: '🔺', unlockLevel: 4, resource: 'mana', cost: 20, cooldown: 4, kind: 'defend', power: 0, accuracyBonus: 0, effect: { type: 'buff', stat: 'defense', amount: 11, turns: 3 }, description: 'Щит из пламени преисподней: +11 защиты на 3 хода.' },
      { id: 'doom_bolt', name: 'Заряд рока', icon: '🌑', unlockLevel: 5, resource: 'mana', cost: 36, cooldown: 4, kind: 'attack', power: 2.8, accuracyBonus: 0, effect: null, description: 'Обрекающий заряд: 280% урона.' },
      { id: 'dark_blessing', name: 'Тёмное благословение', icon: '🪬', unlockLevel: 5, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0, accuracyBonus: 0, passive: true, mods: { hpMul: 1.2 }, effect: null, description: 'Пассивно: максимум здоровья +20%.' },
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
