import { writeFileSync } from 'node:fs';

// One-off generator for the level 6-15 abilities. Emits a data module that
// classes.js merges in. Kept out of the server bundle: run manually, commit the
// generated file.
//
//   node tools/gen_epic.mjs > server/src/game/abilities_epic.js

// Archetypes for indices 0..19 (levels 6..15, two per level).
const SLOTS = [
  { level: 6, arch: 'strike' },
  { level: 6, arch: 'buffAttack' },
  { level: 7, arch: 'heal' },
  { level: 7, arch: 'debuffDefense' },
  { level: 8, arch: 'heavy' },
  { level: 8, arch: 'buffDefense' },
  { level: 9, arch: 'dot' },
  { level: 9, arch: 'restore' },
  { level: 10, arch: 'leech' },
  { level: 10, arch: 'debuffAttack' },
  { level: 11, arch: 'strike' },
  { level: 11, arch: 'buffEvasion' },
  { level: 12, arch: 'heal' },
  { level: 12, arch: 'debuffSpeed' },
  { level: 13, arch: 'execute' },
  { level: 13, arch: 'buffAttack' },
  { level: 14, arch: 'ultimate' },
  { level: 14, arch: 'buffDefense' },
  { level: 15, arch: 'ultimate' },
  { level: 15, arch: 'passive' },
];

const ICONS = {
  strike: '⚔️', heavy: '💥', heal: '💚', buffAttack: '📣', buffDefense: '🛡️',
  buffEvasion: '💨', dot: '🩸', restore: '💠', leech: '🩸', debuffDefense: '🎯',
  debuffAttack: '💀', debuffSpeed: '🕸️', execute: '☠️', ultimate: '☄️', passive: '🪬',
};

// Per class: the resource it spends, the art file reused for each role, the 20
// names (index 19 is the passive), and the third passive's mods + description.
const CLASSES = {
  fighter: {
    resource: 'stamina',
    art: { strike: 'cleave', heavy: 'execute', heal: 'second_wind', buff: 'battle_cry', debuff: 'rend', dot: 'rend', restore: 'second_wind', leech: 'rend', ultimate: 'execute' },
    names: ['Раскол брони', 'Зов к победе', 'Стальная стойкость', 'Разбить щит', 'Крушащий удар', 'Незыблемая стена', 'Кровоточащая рана', 'Второе дыхание войска', 'Кровавый пир', 'Сломить дух', 'Гибельный замах', 'Уйти от удара', 'Кровь и сталь', 'Сковать движение', 'Приговор меча', 'Ярость предков', 'Погибель королей', 'Бастион', 'Кровавая жатва', 'Легенда войны'],
    passive: { mods: { hpMul: 1.25 }, description: 'Пассивно: максимум здоровья +25%.' },
  },
  wizard: {
    resource: 'mana',
    art: { strike: 'fire_bolt', heavy: 'meteor', heal: 'mana_surge', buff: 'arcane_shield', debuff: 'frost_nova', dot: 'frost_nova', restore: 'mana_surge', leech: 'drain_life', ultimate: 'meteor' },
    names: ['Ледяное копьё', 'Печать силы', 'Поток жизни', 'Развеять чары', 'Раскол реальности', 'Кристальный панцирь', 'Проклятие тлена', 'Источник силы', 'Похищение сути', 'Оковы разума', 'Звёздный разряд', 'Призрачный контур', 'Живительная волна', 'Замедление времени', 'Астральный разрыв', 'Ярость стихий', 'Падение небес', 'Купол творения', 'Слово конца', 'Владыка тайн'],
    passive: { mods: { manaMul: 1.25 }, description: 'Пассивно: максимум маны +25%.' },
  },
  rogue: {
    resource: 'stamina',
    art: { strike: 'backstab', heavy: 'assassinate', heal: 'adrenaline', buff: 'adrenaline', debuff: 'death_mark', dot: 'poison_blade', restore: 'adrenaline', leech: 'assassinate', ultimate: 'assassinate' },
    names: ['Рассечение', 'Жажда крови', 'Перевязать раны', 'Ослепить', 'Смертельный выпад', 'Дымовая завеса', 'Гниющая рана', 'Второе дыхание', 'Отнять жизнь', 'Подрезать сухожилия', 'Удар из тени', 'Тень ветра', 'Холодный расчёт', 'Замедлить врага', 'Казнь без слов', 'Азарт охоты', 'Танец клинков', 'Неуловимость', 'Тень смерти', 'Владыка теней'],
    passive: { mods: { evasionAdd: 15 }, description: 'Пассивно: уклонение +15.' },
  },
  cleric: {
    resource: 'mana',
    art: { strike: 'smite', heavy: 'judgment', heal: 'greater_heal', buff: 'bless', debuff: 'purify', dot: 'holy_lance', restore: 'bless', leech: 'judgment', ultimate: 'judgment' },
    names: ['Молот света', 'Молитва силы', 'Благодать', 'Изгнание скверны', 'Кара небес', 'Стена веры', 'Святое пламя', 'Источник благодати', 'Испить свет', 'Печать молчания', 'Копьё рассвета', 'Покров святости', 'Великая благодать', 'Узы смирения', 'Последний суд', 'Гимн доблести', 'Гнев небес', 'Нерушимая вера', 'Слово творца', 'Святой заступник'],
    passive: { mods: { hpMul: 1.25 }, description: 'Пассивно: максимум здоровья +25%.' },
  },
  barbarian: {
    resource: 'stamina',
    art: { strike: 'reckless_strike', heavy: 'executioner', heal: 'wild_heal', buff: 'rage', debuff: 'brutal_blow', dot: 'blood_rage', restore: 'wild_heal', leech: 'executioner', ultimate: 'executioner' },
    names: ['Дикий размах', 'Боевое безумие', 'Перетерпеть', 'Проломить защиту', 'Сокрушающий удар', 'Шкура медведя', 'Рваная рана', 'Ярость зверя', 'Выпить жизнь', 'Устрашающий рёв', 'Неистовый натиск', 'Звериный нюх', 'Дикое восстановление', 'Пригвоздить', 'Казнь вождя', 'Кровавое бешенство', 'Ярость бури', 'Каменная кожа', 'Последний рёв', 'Неукротимый'],
    passive: { mods: { attackAdd: 8 }, description: 'Пассивно: атака +8.' },
  },
  bard: {
    resource: 'mana',
    art: { strike: 'vicious_mockery', heavy: 'requiem', heal: 'healing_ballad', buff: 'inspiring_song', debuff: 'discordant_note', dot: 'shatter_cry', restore: 'master_maestro', leech: 'requiem', ultimate: 'requiem' },
    names: ['Разящая нота', 'Песнь победы', 'Утешающий мотив', 'Разлад', 'Оглушающий аккорд', 'Мелодия щита', 'Плач сирены', 'Второе дыхание музы', 'Украсть вдохновение', 'Насмешка', 'Гимн клинков', 'Лёгкий шаг', 'Баллада жизни', 'Погребальный звон', 'Финальный аккорд', 'Ода героям', 'Апокалиптическая симфония', 'Гармония сфер', 'Реквием мира', 'Маэстро'],
    passive: { mods: { attackAdd: 6 }, description: 'Пассивно: атака +6.' },
  },
  druid: {
    resource: 'mana',
    art: { strike: 'thorn_whip', heavy: 'wildfire', heal: 'rejuvenate', buff: 'bark_skin', debuff: 'entangling_roots', dot: 'venom_bloom', restore: 'rejuvenate', leech: 'wildfire', ultimate: 'wildfire' },
    names: ['Терновый шип', 'Зов леса', 'Дар природы', 'Смять корни', 'Гнев чащи', 'Дубовая кора', 'Цветение скверны', 'Сила земли', 'Испить сок', 'Опутать', 'Лунный луч', 'Туман', 'Живая вода', 'Замедлить зверя', 'Ярость природы', 'Сила стаи', 'Буря листвы', 'Каменный покров', 'Гнев мира', 'Единство с миром'],
    passive: { mods: { hpMul: 1.15, evasionAdd: 8 }, description: 'Пассивно: максимум здоровья +15%, уклонение +8.' },
  },
  monk: {
    resource: 'stamina',
    art: { strike: 'flurry_of_blows', heavy: 'dragon_kick', heal: 'inner_peace', buff: 'ki_focus', debuff: 'pressure_point', dot: 'quivering_palm', restore: 'ki_focus', leech: 'dragon_kick', ultimate: 'dragon_kick' },
    names: ['Удар ладонью', 'Дыхание силы', 'Медитация', 'Захват', 'Сокрушительный пинок', 'Каменная стойка', 'Удар в нерв', 'Поток ки', 'Забрать дыхание', 'Парализующий удар', 'Серия ударов', 'Пустой шаг', 'Покой', 'Замедлить удар', 'Удар дракона', 'Внутренний огонь', 'Небесный удар', 'Непробиваемость', 'Дух горы', 'Просветление'],
    passive: { mods: { attackAdd: 8, evasionAdd: 5 }, description: 'Пассивно: атака +8, уклонение +5.' },
  },
  paladin: {
    resource: 'mana',
    art: { strike: 'holy_strike', heavy: 'divine_judgment', heal: 'greater_blessing', buff: 'divine_favor', debuff: 'consecrate', dot: 'consecrate', restore: 'greater_blessing', leech: 'divine_judgment', ultimate: 'divine_judgment' },
    names: ['Святой замах', 'Аура доблести', 'Свет исцеления', 'Разбить нечестивого', 'Кара света', 'Щит рассвета', 'Священный огонь', 'Благодать', 'Вытянуть свет', 'Печать вины', 'Клинок зари', 'Аура уклонения', 'Великое исцеление', 'Узы света', 'Приговор', 'Аура ярости', 'Гнев небес', 'Несокрушимый щит', 'Суд богов', 'Архипаладин'],
    passive: { mods: { hpMul: 1.25 }, description: 'Пассивно: максимум здоровья +25%.' },
  },
  ranger: {
    resource: 'stamina',
    art: { strike: 'precise_shot', heavy: 'piercing_shot', heal: 'beasts_bond', buff: 'hunters_mark', debuff: 'hunters_mark', dot: 'venom_arrow', restore: 'natural_recovery', leech: 'piercing_shot', ultimate: 'piercing_shot' },
    names: ['Меткий залп', 'Звериная ярость', 'Перевязать', 'Подсечь', 'Пробивающий выстрел', 'Маскировка', 'Ядовитая рана', 'Второе дыхание', 'Выпить силы', 'Метка слабости', 'Смертельный выстрел', 'Тень ветра', 'Дыхание леса', 'Опутать сетью', 'Выстрел в сердце', 'Азарт охоты', 'Град стрел', 'Камуфляж', 'Казнь зверя', 'Владыка охоты'],
    passive: { mods: { attackAdd: 8 }, description: 'Пассивно: атака +8.' },
  },
  sorcerer: {
    resource: 'mana',
    art: { strike: 'chaos_bolt', heavy: 'meteor_swarm', heal: 'sorcerous_restore', buff: 'empowered_spell', debuff: 'scorching_ray', dot: 'scorching_ray', restore: 'sorcerous_restore', leech: 'fireball', ultimate: 'meteor_swarm' },
    names: ['Сгусток пламени', 'Печать мощи', 'Всплеск силы', 'Развеять', 'Раскол', 'Драконья чешуя', 'Палящая рана', 'Прилив силы', 'Похитить жизнь', 'Смять волю', 'Грозовой разряд', 'Зеркала', 'Живительный вихрь', 'Оковы льда', 'Смертельный разряд', 'Кипящая кровь', 'Огненный шторм', 'Барьер силы', 'Гнев хаоса', 'Дитя магии'],
    passive: { mods: { attackAdd: 8 }, description: 'Пассивно: атака +8.' },
  },
  warlock: {
    resource: 'mana',
    art: { strike: 'eldritch_blast', heavy: 'doom_bolt', heal: 'shadow_heal', buff: 'dark_pact', debuff: 'curse_of_weakness', dot: 'soul_rend', restore: 'dark_pact', leech: 'siphon_life', ultimate: 'doom_bolt' },
    names: ['Тёмный разряд', 'Пакт силы', 'Теневое лечение', 'Проклятие брони', 'Разрыв души', 'Адский щит', 'Гниющая порча', 'Тёмный прилив', 'Выпить душу', 'Проклятие немощи', 'Заряд бездны', 'Тень', 'Тёмная благодать', 'Оковы тьмы', 'Приговор бездны', 'Пакт ярости', 'Гнев преисподней', 'Печать защиты', 'Конец всего', 'Владыка бездны'],
    passive: { mods: { hpMul: 1.25 }, description: 'Пассивно: максимум здоровья +25%.' },
  },
};

const r2 = (n) => Math.round(n * 100) / 100;
const RU_RESOURCE = { mana: 'маны', stamina: 'выносливости' };
// Build the ability object for a slot. `i` is the tier (1..10) for scaling.
function build(classKey, cls, index, name) {
  const slot = SLOTS[index];
  const i = slot.level - 5;
  const id = `${classKey}_${slot.arch}_${slot.level}`;
  const art = cls.art[slot.arch] || cls.art.strike;
  const icon = ICONS[slot.arch];
  const base = { id, name, icon, art, unlockLevel: slot.level, resource: null, cost: 0, cooldown: 0, kind: 'attack', power: 0, accuracyBonus: 0, effect: null };
  const withCost = (cost, cooldown, resource) => ({ ...base, cost, cooldown, resource: resource ?? cls.resource });

  switch (slot.arch) {
    case 'strike':
      return { ...withCost(8 + 3 * i, 0), power: r2(1.5 + 0.16 * i), description: `Наносит ${Math.round((1.5 + 0.16 * i) * 100)}% урона от атаки.` };
    case 'heavy':
      return { ...withCost(12 + 3 * i, 2), power: r2(1.9 + 0.18 * i), accuracyBonus: -5, description: `Тяжёлый удар: ${Math.round((1.9 + 0.18 * i) * 100)}% урона, чуть менее точен.` };
    case 'heal':
      return { ...withCost(14 + 3 * i, 2), kind: 'heal', power: r2(0.36 + 0.035 * i), description: `Восстанавливает ${Math.round((0.36 + 0.035 * i) * 100)}% здоровья.` };
    case 'buffAttack':
      return { ...withCost(12 + 2 * i, 3), kind: 'buff', effect: { type: 'buff', stat: 'attack', amount: 8 + i, turns: 3 }, description: `Вдохновляет: +${8 + i} атаки на 3 хода.` };
    case 'buffDefense':
      return { ...withCost(12 + 2 * i, 3), kind: 'defend', effect: { type: 'buff', stat: 'defense', amount: 12 + i, turns: 3 }, description: `Укрепляет: +${12 + i} защиты на 3 хода.` };
    case 'buffEvasion':
      return { ...withCost(12 + 2 * i, 3), kind: 'defend', effect: { type: 'buff', stat: 'evasion', amount: 12 + i, turns: 3 }, description: `Делает увёртливым: +${12 + i} уклонения на 3 хода.` };
    case 'dot':
      return { ...withCost(14 + 3 * i, 2), power: r2(1.3 + 0.12 * i), effect: { type: 'dot', name: 'рана', damage: 7 + i, turns: 3 }, description: `${Math.round((1.3 + 0.12 * i) * 100)}% урона и +${7 + i} урона за 3 хода.` };
    case 'restore':
      return { ...withCost(0, 4, null), kind: 'buff', effect: { type: 'restore', resource: cls.resource, amount: 28 + 3 * i }, description: `Восстанавливает ${28 + 3 * i} ${RU_RESOURCE[cls.resource]}.` };
    case 'leech':
      return { ...withCost(16 + 3 * i, 2), power: r2(1.7 + 0.15 * i), effect: { type: 'leech', ratio: 0.5 }, description: `${Math.round((1.7 + 0.15 * i) * 100)}% урона, исцеляет наполовину.` };
    case 'debuffDefense':
      return { ...withCost(14 + 2 * i, 3), power: r2(1.3 + 0.1 * i), effect: { type: 'debuff', stat: 'defense', amount: -(6 + i), turns: 3 }, description: `${Math.round((1.3 + 0.1 * i) * 100)}% урона и -${6 + i} защиты на 3 хода.` };
    case 'debuffAttack':
      return { ...withCost(14 + 2 * i, 3), kind: 'buff', effect: { type: 'debuff', stat: 'attack', amount: -(6 + i), turns: 3 }, description: `Ослабляет врага: -${6 + i} атаки на 3 хода.` };
    case 'debuffSpeed':
      return { ...withCost(14 + 2 * i, 3), kind: 'buff', effect: { type: 'debuff', stat: 'speed', amount: -(4 + i), turns: 3 }, description: `Замедляет врага: -${4 + i} скорости на 3 хода.` };
    case 'execute':
      return { ...withCost(22 + 3 * i, 4), power: r2(2.6 + 0.22 * i), description: `Смертельный удар: ${Math.round((2.6 + 0.22 * i) * 100)}% урона.` };
    case 'ultimate':
      return { ...withCost(30 + 4 * i, 5), power: r2(3.0 + 0.25 * i), description: `Обрушивает мощь: ${Math.round((3.0 + 0.25 * i) * 100)}% урона.` };
    case 'passive':
      return {
        ...base, resource: null, cost: 0, cooldown: 0, kind: 'buff', power: 0,
        passive: true, mods: cls.passive.mods, description: cls.passive.description,
      };
    default:
      throw new Error(`unknown archetype ${slot.arch}`);
  }
}

const serverLines = [];
serverLines.push('// Auto-generated level 6-15 abilities (see tools/gen_epic.mjs).');
serverLines.push('// Merged into CLASSES by game/classes.js. Do not hand-edit without');
serverLines.push('// regenerating; ids stay latin, text is Russian.');
serverLines.push('');
serverLines.push('export const EPIC_ABILITIES = {');
const iconLines = [];
iconLines.push('// Auto-generated map of level 6-15 ability ids to their (reused) SVG file.');
iconLines.push('// Regenerate with: node tools/gen_epic.mjs');
iconLines.push('');
iconLines.push('export const EPIC_ABILITY_ICONS = {');
for (const [key, cls] of Object.entries(CLASSES)) {
  if (cls.names.length !== SLOTS.length) throw new Error(`${key}: ${cls.names.length} names for ${SLOTS.length} slots`);
  serverLines.push(`  ${key}: [`);
  cls.names.forEach((name, index) => {
    const a = build(key, cls, index, name);
    serverLines.push(`    ${JSON.stringify(a)},`);
    iconLines.push(`  ${a.id}: '${a.art}',`);
  });
  serverLines.push('  ],');
}
serverLines.push('};');
serverLines.push('');
iconLines.push('};');
iconLines.push('');

writeFileSync(new URL('../server/src/game/abilities_epic.js', import.meta.url), serverLines.join('\n'));
writeFileSync(new URL('../client/src/epicAbilityIcons.js', import.meta.url), iconLines.join('\n'));
console.log('wrote server/src/game/abilities_epic.js and client/src/epicAbilityIcons.js');

