// Dialogue orchestration: ties the pure engine (game/dialogue.js) to the
// database. It records every line, distils durable memories, moves the
// relationship, and asks the optional LLM layer to reword the reply.

import { getDb, transaction } from '../db/index.js';
import {
  TOPICS, classifyTopic, topicInfo, relationDelta, moodFor, extractFacts,
  composeReply, memoryAside, llmBriefing, freeAnswer,
} from '../game/dialogue.js';
import { getNpc } from './npcs.js';
import { getMember } from './party.js';
import { companionTemplate } from '../game/companions.js';
import { getCharacter } from './characters.js';
import { advanceQuest } from './quests.js';
import { rewordReply, answerQuestion } from './llm.js';

const parseJson = (v, fallback) => {
  try { return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

// Relationship toward the leader for a companion (stored in party_relations).
function companionRelation(leaderId, memberId) {
  const row = getDb().prepare(
    'SELECT value FROM party_relations WHERE from_member_id = ? AND to_member_id IS NULL',
  ).get(memberId);
  return row ? row.value : 50;
}

function setCompanionRelation(leaderId, memberId, value) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM party_relations WHERE from_member_id = ? AND to_member_id IS NULL').get(memberId);
  if (row) db.prepare("UPDATE party_relations SET value = ?, updated_at = datetime('now') WHERE id = ?").run(value, row.id);
  else db.prepare('INSERT INTO party_relations (leader_id, from_member_id, to_member_id, value) VALUES (?, ?, NULL, ?)')
    .run(leaderId, memberId, value);
}

// NPC opinion lives in its own table, seeded from the NPC's base opinion.
function npcRelation(leaderId, npcId) {
  const row = getDb().prepare('SELECT value FROM npc_relations WHERE leader_id = ? AND npc_id = ?').get(leaderId, npcId);
  if (row) return row.value;
  return getNpc(npcId)?.baseOpinion ?? 50;
}

function setNpcRelation(leaderId, npcId, value) {
  const db = getDb();
  db.prepare(
    `INSERT INTO npc_relations (leader_id, npc_id, value, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (leader_id, npc_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(leaderId, npcId, value);
}

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

// --- memory -----------------------------------------------------------------

export function recallMemory(leaderId, kind, refId, limit = 12) {
  return getDb().prepare(
    'SELECT * FROM dialogue_memory WHERE leader_id = ? AND kind = ? AND ref_id = ? ORDER BY weight DESC, updated_at DESC LIMIT ?',
  ).all(leaderId, kind, refId, limit).map((r) => ({ key: r.fact_key, text: r.text, weight: r.weight, at: r.updated_at }));
}

function rememberFact(leaderId, kind, refId, { key, text }) {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, weight FROM dialogue_memory WHERE leader_id = ? AND kind = ? AND ref_id = ? AND fact_key = ?',
  ).get(leaderId, kind, refId, key);
  if (row) {
    db.prepare("UPDATE dialogue_memory SET weight = ?, text = ?, updated_at = datetime('now') WHERE id = ?")
      .run(Math.min(5, row.weight + 1), text, row.id);
  } else {
    db.prepare('INSERT INTO dialogue_memory (leader_id, kind, ref_id, fact_key, text) VALUES (?, ?, ?, ?, ?)')
      .run(leaderId, kind, refId, key, text);
  }
}

// Topics the LLM layer may reword. Volatile beats (insult, threat, apology,
// join) keep the engine's exact wording: a small local model drifts off-register
// on those, and getting the tone wrong there is worse than sounding repetitive.
const LLM_TOPICS = new Set([
  'greeting', 'wellbeing', 'mood', 'battle', 'farewell', 'smalltalk', 'lore', 'history',
  'faith', 'party', 'help', 'gold', 'compliment', 'joke',
  'bond', 'home', 'plan', 'need',
]);

// Resolve who is being spoken to, as a uniform persona. `traits` holds raw
// trait keys in both cases so the reaction math is consistent.
function resolvePersona(leaderId, kind, refId) {
  if (kind === 'npc') {
    const npc = getNpc(refId);
    if (!npc) throw new Error('Собеседник не найден');
    return {
      kind, refId, name: npc.name, role: npc.role, className: npc.class,
      backstory: npc.description, traits: npc.traits, gender: npc.gender || null,
      portrait: npc.portrait, description: npc.description,
      relation: npcRelation(leaderId, refId),
    };
  }
  const member = getMember(refId);
  if (!member) throw new Error('Спутник не найден');
  const raw = getDb().prepare('SELECT pluses, minuses FROM party_members WHERE id = ?').get(refId);
  const traits = [...parseJson(raw?.pluses, []), ...parseJson(raw?.minuses, [])];
  return {
    kind, refId, name: member.name, role: member.className, className: member.className,
    backstory: member.history, traits,
    gender: companionTemplate(member.templateKey)?.gender || null,
    portrait: member.portrait, description: member.history,
    relation: companionRelation(leaderId, refId),
  };
}

export function getConversation(leaderId, kind, refId) {
  const leader = getCharacter(leaderId);
  if (!leader) throw new Error('Персонаж не найден');
  const persona = resolvePersona(leaderId, kind, refId);
  const messages = getDb().prepare(
    'SELECT * FROM dialogue_messages WHERE leader_id = ? AND kind = ? AND ref_id = ? ORDER BY id',
  ).all(leaderId, kind, refId).map((r) => ({
    id: r.id, speaker: r.speaker, text: r.text, topic: r.topic, delta: r.delta, at: r.created_at,
  }));
  return {
    persona: { ...persona, relation: clamp(persona.relation), mood: moodFor(persona.relation) },
    messages,
    memory: recallMemory(leaderId, kind, refId),
  };
}

// The player says something; the character answers and the world remembers.
export async function say(leaderId, kind, refId, text) {
  const leader = getCharacter(leaderId);
  if (!leader) throw new Error('Персонаж не найден');
  const clean = String(text || '').trim().slice(0, 500);
  if (!clean) throw new Error('Пустая реплика');

  const persona = resolvePersona(leaderId, kind, refId);
  const traitKeys = persona.traits;
  const topic = classifyTopic(clean);
  const before = clamp(persona.relation);
  const delta = relationDelta(topic, traitKeys, before);
  const after = clamp(before + delta);

  // The recent exchange (oldest first) is fed to the model so it follows the
  // thread of the conversation. Read it before this turn is written.
  const history = getDb().prepare(
    'SELECT speaker, text FROM dialogue_messages WHERE leader_id = ? AND kind = ? AND ref_id = ? ORDER BY id DESC LIMIT 8',
  ).all(leaderId, kind, refId).reverse().filter((m) => m.text);

  // Write both lines, move the relationship, plant the memory.
  const memory = recallMemory(leaderId, kind, refId);
  transaction((db) => {
    const ins = db.prepare(
      'INSERT INTO dialogue_messages (leader_id, kind, ref_id, speaker, text, topic, delta) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    ins.run(leaderId, kind, refId, 'player', clean, topic, 0);
    ins.run(leaderId, kind, refId, 'other', '', topic, delta); // placeholder, updated below
  });

  if (kind === 'npc') setNpcRelation(leaderId, refId, after);
  else setCompanionRelation(leaderId, refId, after);

  for (const fact of extractFacts(topic)) rememberFact(leaderId, kind, refId, fact);

  // Compose the in-character reply, then let the LLM layer reword it if present.
  // The LLM only ever sees the clean spoken line, never the mechanical memory
  // aside — otherwise a small model rewrites the aside and loses the answer.
  const turn = getDb().prepare(
    "SELECT COUNT(*) AS n FROM dialogue_messages WHERE leader_id = ? AND kind = ? AND ref_id = ? AND speaker = 'other'",
  ).get(leaderId, kind, refId).n;
  const reply = composeReply({ topic, traits: traitKeys, relation: after, name: persona.name, facts: memory }, turn + refId);
  const lastReply = getDb().prepare(
    "SELECT text FROM dialogue_messages WHERE leader_id=? AND kind=? AND ref_id=? AND speaker='other' ORDER BY id DESC LIMIT 1",
  ).get(leaderId, kind, refId)?.text || '';
  const briefing = llmBriefing({ ...persona, traits: traitKeys }, { topic, relation: after, memory, playerText: clean, history });
  // An open question ("почему ты стала воином?") is answered by the model itself,
  // so it can talk about anything instead of rephrasing a canned beat about the
  // wrong thing. If no model answers, we fall back to the beat below.
  const free = freeAnswer(clean, topic);
  let llm = null;
  if (free) llm = await answerQuestion(briefing, reply, lastReply);
  if (!llm) {
    llm = LLM_TOPICS.has(topic)
      ? await rewordReply(briefing, reply, lastReply)
      : { text: reply, source: 'engine' };
  }

  // A remembered aside is appended after rewording, occasionally, so the living
  // answer always comes first — and never the same aside twice in a row. We look
  // back over several turns, not just the last one, so it cannot echo either.
  const recentReplies = getDb().prepare(
    "SELECT text FROM dialogue_messages WHERE leader_id=? AND kind=? AND ref_id=? AND speaker='other' ORDER BY id DESC LIMIT 4",
  ).all(leaderId, kind, refId).map((r) => r.text).join(' ');
  const aside = memoryAside(memory, after, clean.length);
  let finalText = llm.text;
  if (aside && !recentReplies.includes(aside) && Math.random() < 0.3) finalText = `${finalText} ${aside}`;

  // Store the final reply text (overwrite the placeholder row).
  getDb().prepare(
    "UPDATE dialogue_messages SET text = ? WHERE id = (SELECT id FROM dialogue_messages WHERE leader_id=? AND kind=? AND ref_id=? AND speaker='other' ORDER BY id DESC LIMIT 1)",
  ).run(finalText, leaderId, kind, refId);

  // Talking to a named NPC reports a `talk` quest event, so an objective like
  // "поговорить со Смотрителем шпиля" advances from the conversation itself.
  // Objectives target the NPC's Latin `key` (e.g. spire_warden), not its Russian
  // display name, so the key is what the event must carry.
  if (kind === 'npc') {
    const npc = getNpc(refId);
    if (npc) {
      try { advanceQuest(leaderId, { type: 'talk', target: npc.key }); }
      catch { /* quests are best-effort */ }
    }
  }

  return {
    topic,
    topicLabel: topicInfo(topic).label,
    delta,
    relation: after,
    mood: moodFor(after),
    reply: finalText,
    llm: llm.source,           // 'local' | 'cloud' | 'template'
    memory: recallMemory(leaderId, kind, refId),
  };
}

// Topics the player can pick from as quick prompts.
export function dialogueOptions() {
  return Object.entries(TOPICS).map(([key, t]) => ({ key, label: t.label }));
}
