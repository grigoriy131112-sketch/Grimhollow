import test from 'node:test';
import "../test-support/env.js";
import assert from 'node:assert/strict';
import { getDb, closeDb } from '../src/db/index.js';
import { seedWorld } from '../src/db/seed.js';
import { createCharacter } from '../src/services/characters.js';
import { seedNpcs, npcsAtLocation, getNpcByKey, listNpcs } from '../src/services/npcs.js';
import { getConversation, say, recallMemory, dialogueOptions } from '../src/services/dialogue.js';
import { recruit } from '../src/services/party.js';
import { companionTemplate } from '../src/game/companions.js';
import {
  classifyTopic, relationDelta, moodFor, traitReaction, extractFacts, composeReply,
} from '../src/game/dialogue.js';

// The LLM layer is off (set in test.env.js): replies come from the engine.
test.after(() => closeDb());

function hero(name = `Герой ${Math.floor(Math.random() * 1e6)}`) {
  seedWorld();
  seedNpcs();
  const c = createCharacter({ name, class: 'fighter' });
  getDb().prepare('UPDATE characters SET gold = 5000 WHERE id = ?').run(c.id);
  return c;
}

function npcIn(locationName) {
  const loc = getDb().prepare('SELECT id FROM locations WHERE name = ?').get(locationName);
  return npcsAtLocation(loc.id)[0];
}

// --- pure engine ------------------------------------------------------------

test('classifyTopic recognises the main intents from free text', () => {
  assert.equal(classifyTopic('Приветствую.'), 'greeting');
  assert.equal(classifyTopic('Ты жалкий дурак!'), 'insult');
  assert.equal(classifyTopic('Если предашь — убью тебя'), 'threat');
  assert.equal(classifyTopic('Расскажи о себе, откуда ты?'), 'history');
  assert.equal(classifyTopic('Я заплачу золотом'), 'gold');
  assert.equal(classifyTopic('Пойдём со мной, вступай в отряд'), 'join');
  assert.equal(classifyTopic('Ха-ха, смешно!'), 'joke');
  assert.equal(classifyTopic('абракадабра'), 'smalltalk');
});

test('"how are you" is a caring question, not a bare greeting or small talk', () => {
  assert.equal(classifyTopic('Привет, как ты?'), 'wellbeing');
  assert.equal(classifyTopic('Как себя чувствуешь?'), 'wellbeing');
  assert.equal(classifyTopic('Как дела?'), 'wellbeing');
  assert.equal(classifyTopic('Ты в порядке?'), 'wellbeing');
  // A plain hello with no question stays a greeting.
  assert.equal(classifyTopic('Привет.'), 'greeting');
});

test('a wellbeing question does not offend a gloomy character into a loss', () => {
  // Previously it fell through to small talk, which gloomy dislikes.
  assert.ok(relationDelta('wellbeing', ['gloomy'], 50) >= 0);
  assert.ok(relationDelta('wellbeing', ['kind'], 50) > 0);
});

test('a threat is not misread as an insult even with an insult word inside', () => {
  assert.equal(classifyTopic('убью тебя, дурак'), 'threat');
});

test('traits colour the reaction: greedy loves gold, honest dislikes it', () => {
  const greedy = relationDelta('gold', ['greedy'], 50);
  const honest = relationDelta('gold', ['honest'], 50);
  assert.ok(greedy > honest, 'the greedy reacts better to a bribe than the honest');
  assert.ok(honest < 0, 'an honest person takes offence at a bribe');
});

test('insults hurt the kind and delight the cruel', () => {
  assert.ok(relationDelta('insult', ['kind'], 50) < relationDelta('insult', ['cruel'], 50));
});

test('mood buckets track the relationship value', () => {
  assert.equal(moodFor(10), 'hostile');
  assert.equal(moodFor(30), 'cold');
  assert.equal(moodFor(50), 'neutral');
  assert.equal(moodFor(70), 'warm');
  assert.equal(moodFor(95), 'devoted');
});

test('facts are only planted for topics that carry one', () => {
  assert.equal(extractFacts('insult')[0].key, 'insulted');
  assert.equal(extractFacts('smalltalk').length, 0);
});

test('composeReply is deterministic for the same context', () => {
  const ctx = { topic: 'greeting', traits: ['cheerful'], relation: 70, name: 'Тест' };
  assert.equal(composeReply(ctx, 5), composeReply(ctx, 5));
});

// --- persistence: NPCs ------------------------------------------------------

test('seeding populates NPCs into their locations and is idempotent', () => {
  seedWorld();
  seedNpcs();
  const first = listNpcs().length;
  assert.ok(first >= 10, 'there are named inhabitants');
  seedNpcs();
  assert.equal(listNpcs().length, first, 're-seeding adds nothing');

  const harbor = getDb().prepare('SELECT id FROM locations WHERE name = ?').get('Сумеречная гавань');
  const here = npcsAtLocation(harbor.id);
  assert.ok(here.length >= 1);
  assert.ok(here.every((n) => n.locationId === harbor.id));
});

test('every NPC has traits and a base opinion', () => {
  seedWorld(); seedNpcs();
  for (const n of listNpcs()) {
    assert.ok(n.traits.length >= 3, `${n.name} has traits`);
    assert.ok(n.baseOpinion >= 0 && n.baseOpinion <= 100);
  }
});

// --- conversation -----------------------------------------------------------

test('"привет, как ты?" gets a real answer, not a one-word echo', async () => {
  const h = hero();
  const npc = npcIn('Перекрёсток висельников');
  const r = await say(h.id, 'npc', npc.id, 'Привет, как ты? Как себя чувствуешь?');
  assert.equal(r.topic, 'wellbeing');
  assert.ok(r.reply.trim().split(/\s+/).length >= 3, 'a full line, not just "привет"');
  assert.notEqual(r.reply.toLowerCase().replace(/[.!?]/g, '').trim(), 'привет');
  assert.ok(r.delta >= 0, 'a caring question never costs you');
});

test('greeting raises opinion and insult lowers it, with memory recorded', async () => {
  const h = hero();
  const npc = npcIn('Сумеречная гавань');
  const start = getConversation(h.id, 'npc', npc.id).persona.relation;

  const greet = await say(h.id, 'npc', npc.id, 'Приветствую тебя!');
  assert.equal(greet.topic, 'greeting');
  assert.ok(greet.delta > 0);
  assert.ok(greet.relation > start);

  const insult = await say(h.id, 'npc', npc.id, 'Ты жалкий трус и дурак!');
  assert.equal(insult.topic, 'insult');
  assert.ok(insult.delta < 0);
  assert.ok(insult.relation < greet.relation);

  const mem = recallMemory(h.id, 'npc', npc.id);
  assert.ok(mem.some((m) => m.key === 'greeted'));
  assert.ok(mem.some((m) => m.key === 'insulted'));
});

test('repeating a fact strengthens the memory weight', async () => {
  const h = hero();
  const npc = npcIn('Перекрёсток висельников');
  await say(h.id, 'npc', npc.id, 'Привет.');
  await say(h.id, 'npc', npc.id, 'Ещё раз привет.');
  const mem = recallMemory(h.id, 'npc', npc.id).find((m) => m.key === 'greeted');
  assert.ok(mem.weight >= 2, 'the greeting is remembered more strongly');
});

test('the whole conversation is stored in order', async () => {
  const h = hero();
  const npc = npcIn('Пепельный лес');
  await say(h.id, 'npc', npc.id, 'Привет.');
  await say(h.id, 'npc', npc.id, 'Как дела?');
  const convo = getConversation(h.id, 'npc', npc.id);
  const speakers = convo.messages.map((m) => m.speaker);
  assert.deepEqual(speakers, ['player', 'other', 'player', 'other']);
  assert.ok(convo.messages.every((m) => m.text.length > 0));
});

test('relationship is clamped between 0 and 100', async () => {
  const h = hero();
  const npc = npcIn('Костяные поля');
  let last = 50;
  for (let i = 0; i < 30; i++) {
    const r = await say(h.id, 'npc', npc.id, 'Ты ничтожный трус и дурак!');
    last = r.relation;
  }
  assert.ok(last >= 0 && last <= 100);
});

test('companions can be talked to through the same engine', async () => {
  const h = hero();
  seedWorld(); seedNpcs();
  const t = companionTemplate('marta_veil');
  const marta = recruit(h.id, 'marta_veil', { source: t.sources[0], goldOffered: 9999 }, () => 0).member;

  const before = getConversation(h.id, 'companion', marta.id).persona.relation;
  const r = await say(h.id, 'companion', marta.id, 'Ты отлично держишься, я восхищён.');
  assert.equal(r.topic, 'compliment');
  assert.ok(r.relation > before, 'the companion warms to praise');
  assert.ok(recallMemory(h.id, 'companion', marta.id).length >= 1);
});

test('empty lines are rejected', async () => {
  const h = hero();
  const npc = npcIn('Чёрный шпиль');
  await assert.rejects(() => say(h.id, 'npc', npc.id, '   '));
});

test('dialogue options list every topic', () => {
  const opts = dialogueOptions();
  assert.ok(opts.length >= 10);
  assert.ok(opts.some((o) => o.key === 'greeting'));
});

// --- LLM drift guard (pure helpers) -----------------------------------------

test('acceptReply rejects stubs, non-Russian and the speaker\'s own name', async () => {
  const { acceptReply } = await import('../src/services/llm.js');
  const b = { name: 'Брокер Сарн' };
  assert.equal(acceptReply('Привет', b, 'Здравствуй.'), false, 'one word is a stub');
  assert.equal(acceptReply('Хорошо', b, 'Как дела?'), false, 'too short');
  assert.equal(acceptReply('И挺好, держусь. Ты?', b, 'Потихоньку.'), false, 'chinese characters');
  assert.equal(acceptReply('Hello there friend', b, 'Приветствую.'), false, 'not Russian');
  assert.equal(acceptReply('Сарн, приветствую тебя.', b, 'Приветствую тебя.'), false, 'own name');
  assert.equal(acceptReply('Здоров, Март.', { name: 'Марта Вейл' }, 'Приветствую.'), false, 'truncated own name');
  assert.equal(acceptReply('Да ничего, держусь. А ты как?', b, 'Да ничего, держусь.'), true, 'a real line');
});

test('tidyReply strips a leading label and wrapping quotes', async () => {
  const { tidyReply } = await import('../src/services/llm.js');
  assert.equal(tidyReply('Ответ: Хорошо, спасибо.'), 'Хорошо, спасибо.');
  assert.equal(tidyReply('«Держусь. Спасибо, что спросил.»'), 'Держусь. Спасибо, что спросил.');
  // Small-model framing and noise.
  assert.equal(tidyReply('Вот мой ответ: Я стала воином из-за города.'), 'Я стала воином из-за города.');
  assert.equal(tidyReply('Мой ответ — я боюсь темноты.'), 'я боюсь темноты.');
  assert.equal(tidyReply('Я верю в rightness своих решений.'), 'Я верю в своих решений.');
  // A line cut off mid-thought is trimmed and closed.
  assert.equal(tidyReply('Я держала ворота, пока город не'), 'Я держала ворота, пока город.');
});

test('an open question is its own beat, answered freely', async () => {
  const { freeAnswer, classifyTopic } = await import('../src/game/dialogue.js');
  assert.equal(classifyTopic('почему ты решила стать воином?'), 'question');
  assert.equal(classifyTopic('чего ты боишься?'), 'question');
  assert.equal(classifyTopic('расскажи о своём прошлом'), 'question');
  assert.equal(freeAnswer('почему ты решила стать воином?', 'question'), true);
  assert.equal(freeAnswer('чего ты боишься?', 'question'), true);
  // A short social beat keeps its reliable canned reply.
  assert.equal(freeAnswer('как ты?', 'wellbeing'), false);
  assert.equal(freeAnswer('привет', 'greeting'), false);
});


// --- battle readiness -------------------------------------------------------

test('"готов к сражению" is a battle topic, not small talk', () => {
  assert.equal(classifyTopic('готов к сражению'), 'battle');
  assert.equal(classifyTopic('Готов к сражению?'), 'battle');
  assert.equal(classifyTopic('Идём в бой'), 'battle');
  assert.equal(classifyTopic('прикрывай меня в драке'), 'battle');
  // Brave characters like it, cowards fear it.
  assert.ok(relationDelta('battle', ['brave'], 50) > 0);
  assert.ok(relationDelta('battle', ['coward'], 50) < 0);
});

test('the drift guard rejects a reply that only echoes the player', async () => {
  const { acceptReply } = await import('../src/services/llm.js');
  const b = { name: 'Брокер Сарн', playerText: 'готов к сражению' };
  assert.equal(acceptReply('Я готов к сражению!', b, 'Готов. Держись рядом.'), false);
  assert.equal(acceptReply('Здоров, готов к сражению!', b, 'Готов. Держись рядом.'), false);
  assert.equal(acceptReply('Готов. Скажи, когда и куда.', b, 'Готов. Держись рядом.'), true);
});


test('every mood answers every topic — no falls through to the battle default', async () => {
  const { MOOD_LINES, TOPICS } = await import('../src/game/dialogue.js');
  for (const [mood, pool] of Object.entries(MOOD_LINES)) {
    for (const topic of Object.keys(TOPICS)) {
      assert.ok(Array.isArray(pool[topic]) && pool[topic].length, `${mood} has no line for ${topic}`);
    }
  }
});


test('answering "как ты" is a mood beat, not small talk or an insult', () => {
  assert.equal(classifyTopic('да также, потихоньку'), 'mood');
  assert.equal(classifyTopic('нормально'), 'mood');
  assert.equal(classifyTopic('да ничего'), 'mood');
  assert.equal(classifyTopic('как обычно'), 'mood');
  assert.equal(classifyTopic('устал, если честно'), 'mood');
  // A plain answer to "how are you" must never cost relationship, whatever the
  // listener's mood. Previously gloomy companions docked -2 for it.
  assert.ok(relationDelta('mood', ['gloomy'], 50) >= 0);
  assert.ok(relationDelta('mood', ['cheerful'], 50) >= 0);
  // Empty chatter is neutral too — it is not an offence.
  assert.ok(relationDelta('smalltalk', ['gloomy', 'paranoid'], 50) >= 0);
});

test('praise still beats the mood patterns', () => {
  // "хорошо/отлично" must not hijack the compliment topic.
  assert.equal(classifyTopic('Ты отлично держишься, я восхищён'), 'compliment');
  assert.equal(classifyTopic('спасибо тебе'), 'compliment');
});

// --- Wave 3E: full conversations with the party -----------------------------

test('companion topics are recognised from free text', () => {
  assert.equal(classifyTopic('Скажи честно, ты мне доверяешь?'), 'bond');
  assert.equal(classifyTopic('Расскажи о своём доме и близких'), 'home');
  assert.equal(classifyTopic('Что нас ждёт дальше?'), 'plan');
  assert.equal(classifyTopic('Что тебе нужно? Чем я могу помочь?'), 'need');
  // And they are not stolen by the broader party/history/lore patterns.
  assert.equal(classifyTopic('Как тебе наш отряд?'), 'party');
  assert.equal(classifyTopic('Расскажи о себе, откуда ты?'), 'history');
});

test('companion topics move the relationship in the right direction', () => {
  // A loyal, kind companion warms to a caring question, a paranoid one resents it.
  assert.ok(relationDelta('need', ['kind', 'loyal'], 50) > 0);
  assert.ok(relationDelta('need', ['paranoid'], 50) < 0);
  assert.ok(relationDelta('bond', ['loyal'], 50) > 0);
  assert.ok(relationDelta('bond', ['paranoid', 'liar'], 50) < 0);
});

test('every persona carries a gender so the model keeps the right voice', async () => {
  const h = hero();
  const npc = npcIn('Сумеречная гавань');
  const npcConvo = getConversation(h.id, 'npc', npc.id);
  assert.ok(['m', 'f'].includes(npcConvo.persona.gender), 'the NPC has a gender');

  const t = companionTemplate('marta_veil');
  const marta = recruit(h.id, 'marta_veil', { source: t.sources[0], goldOffered: 9999 }, () => 0).member;
  const convo = getConversation(h.id, 'companion', marta.id);
  assert.equal(convo.persona.gender, 'f', 'Марта speaks in the feminine');
});

test('the LLM briefing states the gender and carries the conversation history', async () => {
  const { llmBriefing } = await import('../src/game/dialogue.js');
  const b = llmBriefing(
    { name: 'Марта Вейл', role: 'Воин', className: 'fighter', traits: ['brave'], gender: 'f' },
    { topic: 'question', relation: 55, history: [{ speaker: 'player', text: 'Привет.' }, { speaker: 'other', text: 'Рада видеть.' }] },
  );
  assert.match(b.system, /женский/i);
  assert.equal(b.history.length, 2);
});

test('prior turns are fed back to the model as real chat turns', async () => {
  const { historyTurns } = await import('../src/services/llm.js');
  const turns = historyTurns({ history: [
    { speaker: 'player', text: 'Привет.' },
    { speaker: 'other', text: 'Рада видеть.' },
    { speaker: 'player', text: 'Почему ты здесь?' },
  ] });
  assert.deepEqual(turns, [
    { role: 'user', content: 'Привет.' },
    { role: 'assistant', content: 'Рада видеть.' },
    { role: 'user', content: 'Почему ты здесь?' },
  ]);
  // A long conversation is trimmed to the most recent turns.
  const many = historyTurns({ history: Array.from({ length: 20 }, (_, i) => ({ speaker: 'player', text: `line ${i}` })) });
  assert.equal(many.length, 8);
  assert.equal(many[many.length - 1].content, 'line 19');
});

test('a remembered aside is not repeated across consecutive turns', async () => {
  const h = hero();
  const npc = npcIn('Перекрёсток висельников');
  // Build up a strong memory of the greeting, then talk enough for the aside to
  // be eligible. The aside must never appear in two replies in a row.
  for (let i = 0; i < 3; i++) await say(h.id, 'npc', npc.id, 'Привет.');
  for (let i = 0; i < 8; i++) await say(h.id, 'npc', npc.id, 'Как дела?');
  const replies = getConversation(h.id, 'npc', npc.id).messages
    .filter((m) => m.speaker === 'other').map((m) => m.text);
  for (let i = 1; i < replies.length; i++) {
    const asideOf = (t) => (t.match(/Я помню[^.]*\./) || [''])[0];
    const a = asideOf(replies[i - 1]);
    const b = asideOf(replies[i]);
    if (a && b) assert.notEqual(a, b, 'the same aside is not repeated twice in a row');
  }
});

