// Grimhollow dialogue engine — pure, deterministic, no I/O.
//
// This is the "own AI": it reads a free-text line, works out what the speaker
// is trying to do (the topic), judges it through the listener's personality
// traits, moves the relationship, distils a memory, and writes a reply in
// character. An optional LLM layer (services/llm.js) may later reword the
// reply, but the decision-making, memory and relationships always live here.

import { traitInfo } from './companions.js';

// ---------------------------------------------------------------------------
// Topics: what the player is trying to do, and how the world reacts by default.
// ---------------------------------------------------------------------------

export const TOPICS = {
  greeting: { label: 'приветствие', delta: 2, mood: 'warm' },
  wellbeing: { label: 'участливый вопрос', delta: 1, mood: 'warm' },
  mood: { label: 'ответ о самочувствии', delta: 1, mood: 'warm' },
  farewell: { label: 'прощание', delta: 0, mood: 'neutral' },
  compliment: { label: 'похвала', delta: 4, mood: 'warm' },
  insult: { label: 'оскорбление', delta: -8, mood: 'cold' },
  threat: { label: 'угроза', delta: -10, mood: 'cold' },
  battle: { label: 'готовность к бою', delta: 1, mood: 'warm' },
  joke: { label: 'шутка', delta: 3, mood: 'warm' },
  apology: { label: 'извинение', delta: 3, mood: 'neutral' },
  history: { label: 'расспрос о прошлом', delta: 1, mood: 'neutral' },
  party: { label: 'разговор об отряде', delta: 1, mood: 'neutral' },
  join: { label: 'зов в отряд', delta: 2, mood: 'warm' },
  help: { label: 'просьба о помощи', delta: 1, mood: 'neutral' },
  gold: { label: 'предложение золота', delta: 1, mood: 'neutral' },
  faith: { label: 'разговор о вере', delta: 1, mood: 'neutral' },
  lore: { label: 'расспрос о крае', delta: 1, mood: 'neutral' },
  smalltalk: { label: 'пустой разговор', delta: 0, mood: 'neutral' },
  question: { label: 'вопрос о персонаже', delta: 0, mood: 'neutral' },
};

// Keyword banks. Russian is inflected, so we match on stems where it helps.
const PATTERNS = [
  // "how are you" is caring, not small talk, so it must be recognised before a
  // bare "привет" would swallow the line as a plain greeting.
  ['wellbeing', ['как ты', 'как дела', 'как оно', 'как сам', 'как жизнь', 'как настроен', 'как себя чувств', 'как ты себя', 'как пожива', 'как здоровь', 'что с тобой', 'ты в порядке', 'тебе как', 'самочувств', 'как вы']],
  // The player answering "how are you?" — "да также, потихоньку". This is a
  // reply about oneself, not empty chatter, so it must be recognised as its own
  // beat and answered warmly.
  ['mood', ['потихоньку', 'полегоньку', 'помаленьку', 'нормально', 'нормал', 'так же', 'также', 'да ничего', 'ничего так', 'неплохо', 'более-менее', 'более менее', 'средне', 'терпимо', 'по-старому', 'по старому', 'как обычно', 'как всегда', 'как раньше', 'всё так же', 'все так же', 'помалу', 'жив-здоров', 'жив здоров', 'да как у всех', 'не жалуюсь', 'грех жаловаться', 'по-разному', 'по разному', 'а ты как', 'а у тебя как', 'устал', 'вымотал', 'вымотался']],
  ['greeting', ['привет', 'здравств', 'здорово', 'добрый день', 'доброе утро', 'добрый вечер', 'хай', 'салют', 'приветств']],
  ['farewell', ['пока', 'прощай', 'до встреч', 'до свидан', 'увидимся', 'бывай', 'покеда']],
  ['compliment', ['молодец', 'умниц', 'красив', 'хорош', 'восхищ', 'спасибо', 'благодар', 'сильн', 'храбр', 'отличн', 'велик']],
  ['threat', ['убью', 'прикончу', 'зарежу', 'убить', 'смерть', 'задушу', 'прокляну', 'уничтож', 'раздавлю', 'конец тебе']],
  ['battle', ['сражени', 'битв', 'бой', 'бою', 'боя', 'драться', 'драк', 'сеч', 'враг', 'готов к ', 'готовы к ', 'готова к ', 'готовность', 'в атаку', 'на врага', 'прикрывай', 'прикрыть', 'выстоим', 'сражатьс', 'рубить']],
  ['insult', ['дурак', 'идиот', 'тупиц', 'трус', 'жалк', 'ничтож', 'ненавиж', 'заткнис', 'урод', 'мерзав', 'слабак', 'глуп']],
  ['joke', ['шутк', 'смешн', 'анекдот', 'ха-ха', 'хаха', 'хихи', 'пошути', 'весел']],
  ['apology', ['прости', 'извин', 'виноват', 'сожалею', 'прошу прощения', 'каюс']],
  ['history', ['кто ты', 'откуда', 'расскажи о себе', 'твоё прошлое', 'твое прошлое', 'история', 'откуда ты родом', 'что ты за']],
  ['join', ['пойдём со мной', 'присоедин', 'в отряд', 'идём вместе', 'пойдём вместе', 'пойдешь со мной', 'пойдёшь со мной', 'будешь с нами', 'вступай']],
  ['party', ['отряд', 'спутник', 'союзник', 'кто с нами', 'команда', 'ватаг']],
  ['help', ['помоги', 'подскажи', 'нужна помощь', 'выручи', 'посоветуй', 'научи']],
  ['gold', ['золот', 'заплачу', 'монет', 'цена', 'наня', 'награда', 'грош', 'серебр', 'оплач']],
  ['faith', ['бог', 'молит', 'вер', 'храм', 'жрец', 'свят', 'проклят', 'душа']],
  ['lore', ['мест', 'край', 'земл', 'локаци', 'где мы', 'что здесь', 'что тут', 'опасн', 'дорог', 'здешн', 'знаешь', 'известно', 'слухи']],
];

// Which traits change the reaction to a topic. Positive = likes it, negative =
// takes offence. Values are the relationship delta applied per trait present.
const TRAIT_REACTIONS = {
  compliment: { vain: 6, cheerful: 3, gloomy: -3, cruel: -2 },
  insult: { cruel: 5, hotheaded: -4, kind: -4, pious: -3, paranoid: -3, cheerful: -2, stubborn: -2 },
  threat: { brave: -5, fierce: -3, coward: -6, calm: -2, hotheaded: 2 },
  battle: { brave: 4, fierce: 4, hotheaded: 3, coward: -5, lazy: -3, loyal: 2, calm: 1, paranoid: -1 },
  joke: { cheerful: 5, gloomy: -4, cruel: -2, drunkard: 3, liar: 2 },
  apology: { kind: 4, honest: 3, cruel: -3, paranoid: -2, stubborn: -2 },
  history: { studious: 4, clever: 2, liar: -3, paranoid: -2 },
  party: { loyal: 3, brave: 2, coward: -2, lazy: -2 },
  join: { brave: 4, loyal: 4, coward: -4, lazy: -3, greedy: 2, paranoid: -2 },
  help: { kind: 3, loyal: 3, lazy: -4, cruel: -2, vain: -2 },
  gold: { greedy: 8, vain: 3, honest: -3, pious: -3, loyal: 2 },
  faith: { pious: 6, heretic: -6, kind: 2, liar: -2 },
  lore: { studious: 4, clever: 3, lazy: -2, paranoid: -1 },
  greeting: { cheerful: 3, gloomy: -2, paranoid: -1, kind: 2 },
  farewell: { loyal: 2, paranoid: -1 },
  smalltalk: {},
  mood: { cheerful: 2, gloomy: 1, kind: 1, proud: -1, hotheaded: -1 },
  wellbeing: { cheerful: 3, kind: 3, gloomy: -1, paranoid: -2, cruel: -2, honest: 2, loyal: 2 },
};

// Facts a line plants in memory. These are what the character will recall later.
const FACT_RULES = [
  ['greeting', 'greeted', 'Ты здоровался со мной.'],
  ['wellbeing', 'checked_in', 'Ты спрашивал, как у меня дела.'],
  ['mood', 'shared_mood', 'Ты говорил, как у тебя дела.'],
  ['compliment', 'praised', 'Ты хвалил меня.'],
  ['insult', 'insulted', 'Ты оскорблял меня.'],
  ['threat', 'threatened', 'Ты мне угрожал.'],
  ['battle', 'battle_ready', 'Ты звал меня в бой.'],
  ['joke', 'joked', 'С тобой было весело.'],
  ['apology', 'apologized', 'Ты просил прощения.'],
  ['join', 'invited', 'Ты звал меня в отряд.'],
  ['help', 'asked_help', 'Ты просил моей помощи.'],
  ['gold', 'gold_offer', 'Ты говорил о золоте.'],
  ['faith', 'faith', 'Вы говорили о вере.'],
  ['lore', 'lore', 'Ты расспрашивал о здешних местах.'],
];

export function classifyTopic(text) {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return 'smalltalk';
  // Threat before insult: "убью тебя, дурак" is a threat.
  for (const [topic, keys] of PATTERNS) {
    if (keys.some((k) => t.includes(k))) return topic;
  }
  // Anything else that is a real question — "почему ты стала воином?", "чего
  // ты боишься?" — is its own beat, answered freely rather than by a canned line.
  if (DEEP_QUESTION.test(t) || /[?？]/.test(t)) return 'question';
  return 'smalltalk';
}

export function topicInfo(topic) {
  return TOPICS[topic] || TOPICS.smalltalk;
}

// True when the player asked something the canned beats cannot answer — an open
// question about the character, the world, or a reason ("почему", "зачем",
// "расскажи"). Such lines are answered by the model directly, so the dialogue
// stays alive instead of snapping to a template about the wrong thing.
const DEEP_QUESTION = /почему|зачем|отчего|расскажи|поведай|как ты (стал|стала|оказал|оказалась)|как вы (стал|стали)|откуда ты|кто ты|что ты (знаешь|думаешь|помнишь) о|боишься|мечта|любишь|нравится|веришь|хочешь ли/i;

export function freeAnswer(text, topic = 'smalltalk') {
  const t = String(text || '').trim();
  if (t.length < 3) return false;
  // A deep question always goes free. A plain question mark only counts when the
  // line was classified as an open question — short social beats ("как ты?")
  // keep their reliable canned reply.
  return DEEP_QUESTION.test(t) || topic === 'question';
}

// How a listener's traits colour the reaction to a topic.
export function traitReaction(topic, traitKeys = []) {
  const table = TRAIT_REACTIONS[topic] || {};
  let sum = 0;
  for (const key of traitKeys) sum += table[key] || 0;
  return sum;
}

// The relationship delta a line causes: topic baseline, trait colouring, and a
// small pull so a low opinion can still be won over but a high one is guarded.
export function relationDelta(topic, traitKeys = [], relation = 50) {
  const base = topicInfo(topic).delta;
  const trait = traitReaction(topic, traitKeys);
  let delta = base + trait;
  // Kind words land harder on someone who dislikes you; insults sting the devoted.
  if (base > 0 && relation < 40) delta += 2;
  if (base < 0 && relation > 70) delta -= 2;
  return Math.max(-15, Math.min(15, Math.round(delta)));
}

// Mood bucket used to pick the tone of the reply.
export function moodFor(relation) {
  if (relation < 20) return 'hostile';
  if (relation < 40) return 'cold';
  if (relation < 60) return 'neutral';
  if (relation < 80) return 'warm';
  return 'devoted';
}

export function extractFacts(topic) {
  return FACT_RULES.filter(([t]) => t === topic).map(([, key, text]) => ({ key, text }));
}

// ---------------------------------------------------------------------------
// Reply writing. Trait-specific lines win; otherwise a mood-appropriate line.
// ---------------------------------------------------------------------------

const TRAIT_LINES = {
  insult: {
    cruel: ['Ха. Продолжай, мне нравится, когда ты злишься.', 'Слова дешёвы. Попробуй сделать хуже — если посмеешь.'],
    hotheaded: ['Ещё одно слово — и я забуду, что мы заодно.', 'Держи язык за зубами, пока я держу руки при себе.'],
    kind: ['За что ты так со мной? Я ведь ничего тебе не сделал.', 'Мне больно это слышать.'],
    pious: ['Злые слова вернутся к тебе, я лишь запомню их.', 'Боги слышат тебя. И я тоже.'],
  },
  compliment: {
    vain: ['Наконец-то кто-то это заметил.', 'Ты льстишь — но я не против.'],
    gloomy: ['Похвала не залечит того, что я видел.', 'Спасибо. Хотя радости мне это не приносит.'],
  },
  joke: {
    cheerful: ['Вот это уже похоже на жизнь! Ещё одну — и я твой.', 'Ха! Давно так не смеялся.'],
    gloomy: ['Смех здесь звучит неправильно.', 'Весёлого мало, но... ладно.'],
  },
  threat: {
    brave: ['Мне угрожали и похуже. Ты не первый.', 'Попробуй. Только потом не жалей.'],
    coward: ['Ладно, ладно! Не надо резких движений.', 'Я... я не хочу драться.'],
    fierce: ['Наконец-то разговор по мне.', 'Угрожай, угрожай. Я уже скучал.'],
  },
  battle: {
    brave: ['Готов. Дай только знак — и я пойду первым.', 'Наконец-то дело. Когда выступаем?'],
    fierce: ['Кровь закипает. Я готов.', 'Давно пора размяться.'],
    coward: ['Готов... наверное. Только держись рядом.', 'Если ты прикроешь — я пойду.'],
    lazy: ['Опять драться? Ну ладно, раз надо.', 'Готов, но без особого восторга.'],
  },
  gold: {
    greedy: ['Золото — язык, который я понимаю лучше всех.', 'Сколько? Называй цифру.'],
    honest: ['Я не продаюсь. По крайней мере, за монеты.', 'Оставь деньги, говори по-человечески.'],
    pious: ['Сребреники погубили и не таких, как я.', 'Мне не нужно твоё золото.'],
  },
  faith: {
    pious: ['Вера — единственное, что меня ещё держит.', 'Боги видят нас даже здесь.'],
    heretic: ['Боги — это долги, которые кто-то выдумал.', 'Я оставил веру там же, где и надежду.'],
  },
  join: {
    brave: ['Если дело правое — я с тобой.', 'Я пойду. Но не жди, что я буду прятаться.'],
    coward: ['Идти туда?.. Ну... если ты обещаешь прикрыть.', 'Я не создан для подвигов, но попробую.'],
  },
};

const MOOD_LINES = {
  hostile: {
    greeting: ['Чего тебе?', 'Я тебя не звал.'],
    wellbeing: ['Тебе-то что? Жив, как видишь.', 'Не твоя забота, как я.'],
    mood: ['Мне-то? Как всегда. Без твоей помощи.', 'Живу. Тебя это удивляет?'],
    question: ['Зачем тебе знать? Скажи, что тебе нужно.', 'Спрашиваешь много. Отвечу, если будет толк.'],
    smalltalk: ['Говори по делу или уходи.', 'Мне не о чем с тобой болтать.'],
    compliment: ['Не подлизывайся. Тебе это не идёт.', 'Лесть от тебя — как соль в ране.'],
    insult: ['Ещё слово — и я проверю, крепка ли твоя шея.', 'Ты забываешься. Я это запомню.'],
    threat: ['Угрожай кому-нибудь послабее.', 'Ты пожалеешь, что открыл рот.'],
    battle: ['Обойдусь без тебя.', 'С тобой в бой? Не смеши.'],
    joke: ['Не смешно.', 'Здесь не место для шуток.'],
    apology: ['Поздно извиняться.', 'Слова не залечат того, что ты сделал.'],
    history: ['Моё прошлое тебя не касается.', 'Зачем тебе знать обо мне?'],
    party: ['Мне нет дела до твоего отряда.', 'Не ищи во мне союзника.'],
    join: ['С тобой? Ни за что.', 'Я скорее сдохну одна.'],
    help: ['Помоги себе сам.', 'С чего вдруг я должен помогать?'],
    gold: ['Твоё золото не купит меня.', 'Убери монеты, пока я не разозлился.'],
    faith: ['Не читай мне проповедей.', 'Твои боги мне безразличны.'],
    lore: ['Не задавай вопросов.', 'Мне нечего тебе рассказать.'],
    farewell: ['Скатертью дорога.', 'Уходи. И не возвращайся.'],
    default: ['Не испытывай моё терпение.', 'Ты мне не друг. Помни это.'],
  },
  cold: {
    greeting: ['А, это ты.', 'Здорово... наверное.'],
    wellbeing: ['Живу помаленьку. Чего хотел?', 'Да как у всех — терплю.'],
    mood: ['Так же, как и раньше. Без перемен.', 'Да ничего нового.'],
    question: ['К чему тебе это? Но слушай, если охота.', 'Много будешь знать — плохо спать будешь.'],
    smalltalk: ['Ну, говори, если есть что.', 'Не задерживай меня.'],
    compliment: ['Спасибо. Хотя я тебе не верю.', 'Не думай, что это что-то меняет.'],
    insult: ['Придержи язык.', 'Ещё раз — и разговор закончится плохо.'],
    threat: ['Не пугай меня. Не выйдет.', 'Ты не первый, кто это говорит.'],
    battle: ['Если придётся — пойду. Но без радости.', 'Готов, если ты готов.'],
    joke: ['Думаешь, это уместно?', 'Хм. Не смешно.'],
    apology: ['Ладно. Но я помню.', 'Извинения приняты. Пока.'],
    history: ['Было и было. Что тебе с того?', 'Прошлое лучше не ворошить.'],
    party: ['Отряд у тебя как отряд.', 'Не знаю, надолго ли вас хватит.'],
    join: ['Не уверен, что мне это нужно.', 'Посмотрим. Обещать не стану.'],
    help: ['Чего тебе надо?', 'Помогу, если будет выгода.'],
    gold: ['Говори цифру. Посмотрим.', 'Монеты — это уже разговор.'],
    faith: ['Вера — не для меня.', 'Не начинай про богов.'],
    lore: ['Что конкретно тебя интересует?', 'Места здесь гиблые, вот и всё.'],
    farewell: ['Иди. Может, свидимся.', 'Ну, прощай.'],
    default: ['Слушаю, но не жди тепла.', 'Хорошо. И что с того?'],
  },
  neutral: {
    greeting: ['Приветствую. Чем обязан?', 'Здравствуй.'],
    wellbeing: ['Да ничего, держусь. А ты?', 'Потихоньку. Спасибо, что спросил.'],
    mood: ['Да как обычно. Всё по-старому.', 'Тихо. Живу, и ладно.'],
    question: ['Спрашивай, коли интересно. Что именно?', 'Хм. Об этом можно и поговорить.'],
    smalltalk: ['День как день. А что?', 'Пусто вокруг. Но живём.'],
    compliment: ['Благодарю. Приятно слышать.', 'Спасибо на добром слове.'],
    insult: ['Это было лишним.', 'Зачем оскорблять? Мы ведь не враги.'],
    threat: ['Не говори так. Мы можем не ссориться.', 'Угрозы ни к чему.'],
    battle: ['Готов. Скажи, когда и куда.', 'Я в деле. Держись рядом.'],
    joke: ['Улыбнулся. Уже что-то.', 'Забавно.'],
    apology: ['Всякое бывает. Забудем.', 'Принято. Не держу зла.'],
    history: ['Что ж, слушай, коли интересно.', 'Моя история невесёлая.'],
    party: ['Отряд — это неплохо. Если друг другу верите.', 'Держитесь вместе, здесь это важно.'],
    join: ['Может, и пойду. Дай подумать.', 'Предложение интересное.'],
    help: ['Чем могу — помогу.', 'Спрашивай, если знаю — отвечу.'],
    gold: ['Золото — всегда кстати.', 'Ну, о цене можно поговорить.'],
    faith: ['Вера у каждого своя.', 'Боги далеко. Люди ближе.'],
    lore: ['Места здесь опасные. Слушай внимательно.', 'Край как край. Всякого повидал.'],
    farewell: ['Ступай с миром. Увидимся.', 'Ну, бывай. Береги себя.'],
    default: ['Понял тебя.', 'Ладно.'],
  },
  warm: {
    greeting: ['Рад тебя видеть.', 'О, ты вернулся. Хорошо.'],
    wellbeing: ['Да хорошо, раз ты рядом. А ты как?', 'Держусь. Спасибо, что не забываешь.'],
    mood: ['Как и ты — потихоньку. Спасибо, что спросил.', 'Неплохо, особенно когда ты рядом.'],
    question: ['Спроси, я отвечу. О чём думаешь?', 'Люблю, когда ты спрашиваешь. Говори.'],
    smalltalk: ['Всегда рад поболтать.', 'Рассказывай, я слушаю.'],
    compliment: ['Ты меня смущаешь. Но спасибо.', 'Доброе слово и здесь греет.'],
    insult: ['За что? Я ведь к тебе по-доброму.', 'Больше не говори так.'],
    threat: ['Не надо. Мы же заодно.', 'Я не хочу с тобой ссориться.'],
    battle: ['С тобой — хоть в огонь. Веди.', 'Я всегда готов, когда ты рядом.'],
    joke: ['Вот это по мне!', 'Ха! Хорошо сказано.'],
    apology: ['Да брось, я не в обиде.', 'Всё хорошо. Забудь.'],
    history: ['Тебе расскажу, как никому.', 'Слушай, раз просишь.'],
    party: ['С тобой отряд — как семья.', 'Рад, что мы вместе.'],
    join: ['С тобой — хоть на край света.', 'Я уже с тобой, разве нет?'],
    help: ['Для тебя — всё, что смогу.', 'Только скажи.'],
    gold: ['Твоё золото мне не нужно, ты и так со мной.', 'Оставь монеты, я помогу и так.'],
    faith: ['Вера держит и меня.', 'Хорошо, что ты об этом говоришь.'],
    lore: ['Пойдём, покажу здешние тропы.', 'Об этом крае я знаю немало.'],
    farewell: ['До встречи, друг.', 'Иди, но возвращайся.'],
    default: ['С тобой не так тоскливо.', 'Я тебя услышал.'],
  },
  devoted: {
    greeting: ['Ты пришёл! Я знал.', 'Мой друг. Всегда рад.'],
    wellbeing: ['Пока ты со мной — всё хорошо.', 'Что мне сделается, когда ты рядом.'],
    mood: ['С тобой — хорошо. Правда.', 'Спасибо, что спросил. Мне спокойно рядом с тобой.'],
    question: ['Спрашивай что угодно — для тебя отвечу на всё.', 'Ты хочешь знать? Тогда слушай.'],
    smalltalk: ['С тобой хоть в огонь.', 'Говори, я всё сделаю.'],
    compliment: ['Твоё слово для меня дороже золота.', 'Я сделаю всё, чтобы ты не разочаровался.'],
    insult: ['Даже от тебя это больно. Но я стерплю.', 'Ты расстроен? Прости меня.'],
    threat: ['Если ты так хочешь — я не подниму руку.', 'Твоя воля. Но мне горько это слышать.'],
    battle: ['За тебя — куда угодно. Я готов.', 'Скажи слово — и я прикрою тебя грудью.'],
    joke: ['С тобой всегда теплее.', 'Ха! Я запомню эту шутку.'],
    apology: ['Не извиняйся. Я всегда на твоей стороне.', 'Всё прощу. Ты же мой.'],
    history: ['Тебе — всю правду, до конца.', 'Слушай. Я доверяю тебе.'],
    party: ['Наш отряд — лучшее, что со мной случилось.', 'За каждого из вас я умру.'],
    join: ['Куда ты — туда и я.', 'Я и так твой. Приказывай.'],
    help: ['Одного слова довольно.', 'Всё, что скажешь.'],
    gold: ['Мне не нужны твои монеты.', 'Ты меня не купишь — я и так твой.'],
    faith: ['Твоя вера — и моя теперь.', 'Я верю в то же, что и ты.'],
    lore: ['Расскажу всё, что знаю, и больше.', 'Слушай, друг.'],
    farewell: ['Не уходи надолго. Я буду ждать.', 'Прощай. Возвращайся скорее.'],
    default: ['За тебя — куда угодно.', 'Твоё слово для меня закон.'],
  },
};

// Deterministic pick so the same context yields the same line (tests stay sane).
function pick(arr, seed) {
  if (!arr || !arr.length) return '';
  const n = typeof seed === 'number' ? seed : String(seed).length;
  return arr[Math.abs(n) % arr.length];
}

export function composeReply({ topic, traits = [], relation = 50, name = '', facts = [] }, seed) {
  const mood = moodFor(relation);
  const traitPool = TRAIT_LINES[topic];
  if (traitPool) {
    for (const tr of traits) {
      if (traitPool[tr]) return pick(traitPool[tr], seed + tr.length);
    }
  }
  const moodPool = MOOD_LINES[mood] || MOOD_LINES.neutral;
  return pick(moodPool[topic] || moodPool.default, seed + mood.length);
}

// A short, in-character aside that references something remembered. Only strong
// memories (said more than once, or a strong beat like an insult) are recalled
// out loud, so the character does not parrot every greeting back at the player.
export function memoryAside(memory = [], relation = 50, seed = 0) {
  const strong = memory.filter((m) => m.weight >= 2);
  if (!strong.length) return null;
  const m = pick(strong, seed + relation);
  if (!m) return null;
  const mood = moodFor(relation);
  const lead = mood === 'hostile' || mood === 'cold' ? 'Я помню: ' : 'Я помню, ';
  return `${lead}${m.text.toLowerCase().replace(/\.$/, '')}.`;
}

// The instruction block is byte-identical on every request, so llama.cpp can
// reuse its cached prefix. All per-turn data goes after it — that keeps prompt
// evaluation cheap, which is the difference between a snappy and a sluggish NPC.
const SYSTEM_RULES = [
  'Ты — персонаж тёмного фэнтези-мира Гримхоулл. Ты говоришь собеседнику (предводителю отряда) одну живую реплику.',
  'Правила: отвечай на «ты», по-русски, в характере и в нужном настроении; можешь говорить о чём угодно — о себе, о своём прошлом, о мире, о собеседнике.',
  'Если чего-то не знаешь — уклоняйся в характере, но не выдумывай фактов о собеседнике.',
  'Отвечай утверждением о себе, а не встречным вопросом и не пересказом вопроса.',
  'Не называй собеседника своим именем и не повторяй его слова — отвечай от себя.',
  'Не пересказывай воспоминания списком. Только русский язык, без других языков и иероглифов.',
].join('\n');

// Everything the LLM layer needs to reword a reply without changing its meaning.
export function llmBriefing(persona, { topic, relation, memory = [], playerText = '' }) {
  const mood = moodFor(relation);
  const moodRu = { hostile: 'враждебное', cold: 'холодное', neutral: 'ровное', warm: 'тёплое', devoted: 'преданное' }[mood];
  return {
    name: persona.name,
    topic: topicInfo(topic).label,
    playerText,
    system: [
      SYSTEM_RULES,
      `Персонаж: ${persona.name}, ${persona.role || 'житель'}${persona.className ? `, ${persona.className}` : ''}.`,
      persona.backstory ? `Предыстория: ${persona.backstory}` : '',
      `Черты характера: ${(persona.traits || []).map((t) => traitInfo(t).name).join(', ') || 'нет'}.`,
      `Отношение к собеседнику: ${moodRu} (${relation}/100).`,
      memory.length ? `Помнишь о собеседнике: ${memory.map((m) => m.text).join(' ')}` : '',
      playerText ? `Собеседник сказал: «${playerText}». Ответь именно ему.` : '',
    ].filter(Boolean).join('\n'),
  };
}

export { pick as pickLine, MOOD_LINES };
