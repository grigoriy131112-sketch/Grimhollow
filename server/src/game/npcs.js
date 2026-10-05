// Named inhabitants of Grimhollow (Wave 6). Pure design data: who lives where,
// what they are like, and how they feel about strangers at first. Persistence
// and dialogue live in services/npcs.js and services/dialogue.js.

export const NPCS = [
  // Пепельный предел
  {
    key: 'hangman_keeper', name: 'Могильщик Оден', location: 'Перекрёсток висельников', role: 'смотритель перекрёстка',
    gender: 'm',
    class: 'fighter', portrait: null,
    description: 'Старик, что хоронит повешенных и записывает их имена в сальную книгу.',
    plus: ['hardy', 'honest'], minus: ['gloomy', 'stubborn'], opinion: 50,
  },
  {
    key: 'sister_maeve', name: 'Сестра Мэйв', location: 'Перекрёсток висельников', role: 'странствующая жрица',
    gender: 'f',
    class: 'cleric', portrait: null,
    description: 'Ходит по пепелищам с чашей для милостыни и ни разу не прошла мимо страждущего.',
    plus: ['pious', 'kind'], minus: ['stubborn', 'gloomy'], opinion: 55,
  },
  {
    key: 'fog_widow', name: 'Вдова Измора', location: 'Плачущая низина', role: 'собирательница тумана',
    gender: 'f',
    class: 'druid', portrait: null,
    description: 'Наполняет фляги туманом низины и продаёт его как лекарство — или как яд.',
    plus: ['clever', 'greedy'], minus: ['paranoid', 'liar'], opinion: 40,
  },
  {
    key: 'marsh_ferryman', name: 'Паромщик Гриб', location: 'Утонувшая дорога', role: 'перевозчик через гать',
    gender: 'm',
    class: 'fighter', portrait: null,
    description: 'Знает каждую топь наизусть и берёт плату за проход, живую или мёртвую.',
    plus: ['hardy', 'cheerful'], minus: ['greedy', 'drunkard'], opinion: 45,
  },
  {
    key: 'ash_druid', name: 'Пепельный друид', location: 'Пепельный лес', role: 'хранитель леса',
    gender: 'm',
    class: 'druid', portrait: null,
    description: 'Говорит с обугленными деревьями и не доверяет никому, кто носит сталь.',
    plus: ['kind', 'calm'], minus: ['heretic', 'paranoid'], opinion: 48,
  },
  // Костяной берег
  {
    key: 'harbor_broker', name: 'Брокер Сарн', location: 'Сумеречная гавань', role: 'торговец обломками',
    gender: 'm',
    class: 'rogue', portrait: null,
    description: 'Скупает всё, что море вынесет на берег, включая имена погибших.',
    plus: ['clever', 'greedy'], minus: ['liar', 'vain'], opinion: 35,
  },
  {
    key: 'lantern_hag', name: 'Фонарная старуха', location: 'Сумеречная гавань', role: 'гадалка',
    gender: 'f',
    class: 'warlock', portrait: null,
    description: 'Зажигает фонари для тех, кто не вернётся, и берёт плату вперёд.',
    plus: ['clever', 'calm'], minus: ['cruel', 'greedy'], opinion: 32,
  },
  {
    key: 'tide_hermit', name: 'Отшельник Клайв', location: 'Пещеры, изгрызенные приливом', role: 'житель пещер',
    gender: 'm',
    class: 'ranger', portrait: null,
    description: 'Живёт среди костей прилива и считает их своими соседями.',
    plus: ['hardy', 'swift'], minus: ['paranoid', 'lazy'], opinion: 42,
  },
  {
    key: 'chapel_ghost', name: 'Хор Утонувшей часовни', location: 'Затонувшая часовня', role: 'утопленный хор',
    gender: 'm',
    class: 'bard', portrait: null,
    description: 'Поёт без слов всё, что не успел сказать, когда вода поднялась.',
    plus: ['kind', 'calm'], minus: ['gloomy', 'heretic'], opinion: 50,
  },
  {
    key: 'bonepicker', name: 'Костогрыз', location: 'Костяные поля', role: 'сборщик останков',
    gender: 'm',
    class: 'barbarian', portrait: null,
    description: 'Разбирает костяные холмы на продажу и знает, какие из них ещё шевелятся.',
    plus: ['fierce', 'hardy'], minus: ['hotheaded', 'greedy'], opinion: 38,
  },
  {
    key: 'spire_warden', name: 'Смотритель шпиля', location: 'Чёрный шпиль', role: 'хранитель двери',
    gender: 'm',
    class: 'wizard', portrait: null,
    description: 'Единственный, кто добровольно остался у подножия Чёрного шпиля. И остался собой.',
    plus: ['studious', 'brave'], minus: ['coward', 'gloomy'], opinion: 44,
  },
];

export const npcByKey = (key) => NPCS.find((n) => n.key === key) || null;
export const npcsForLocation = (locationName) => NPCS.filter((n) => n.location === locationName);
