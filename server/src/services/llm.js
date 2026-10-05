// Optional LLM layer. The game never depends on it: if no model is reachable,
// rewordReply returns the deterministic template line unchanged. Order is
// local (llama.cpp / Qwen, no key) -> cloud (OpenAI-compatible, needs a key)
// -> template. This is what makes the dialogue "eternal": the local model has
// no key and no expiry, and the template is always there beneath it.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

export const config = {
  provider: (process.env.LLM_PROVIDER || 'auto').toLowerCase(), // auto | local | cloud | off
  localUrl: process.env.LLM_LOCAL_URL || 'http://127.0.0.1:8080',
  localModelPath: process.env.LLM_MODEL_PATH || path.join(repoRoot, 'models', 'qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf'),
  llamaBin: process.env.LLM_LLAMA_BIN || path.join(repoRoot, 'models', 'llama', 'llama-server'),
  cloudKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
  cloudBase: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  cloudModel: process.env.LLM_MODEL || 'gpt-4o-mini',
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 30000),
};

const localModelPresent = () => { try { return fs.existsSync(config.localModelPath); } catch { return false; } };

// Cache the local health probe briefly so a chatty conversation doesn't probe
// the model on every single line.
let localHealth = { ok: false, at: 0 };
async function localHealthy() {
  if (config.provider === 'off' || config.provider === 'cloud') return false;
  if (!localModelPresent() && !process.env.LLM_LOCAL_URL) return false;
  if (Date.now() - localHealth.at < 8000) return localHealth.ok;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${config.localUrl}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    localHealth = { ok: res.ok, at: Date.now() };
  } catch {
    localHealth = { ok: false, at: Date.now() };
  }
  return localHealth.ok;
}

async function chat(url, { key, model, messages, timeout, maxTokens = 80, temperature = 0.65, topP = 0.9 }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, top_p: topP }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } finally { clearTimeout(t); }
}

export function tidyReply(text) {
  let out = String(text || '')
    .trim()
    .replace(/^(ответ|ассистент|персонаж|реплика|assistant)\s*[:\-—]\s*/i, '')
    // Small models like to frame their line: "Вот мой ответ: ...", "Мой ответ: ...".
    .replace(/^(вот\s+)?(мой|твой|это\s+мой|это\s+твой)\s+ответ\s*[:\-—]\s*/i, '')
    .replace(/^["«'\-—\s]+|["»'\s]+$/g, '')
    // A lone Latin word dropped into a Russian line ("...верю в rightness...")
    // is model noise; strip it.
    .replace(/\b[A-Za-z]{2,}\b/g, ' ')
    .replace(/\s+/g, ' ');
  // A cut-off line ends on a conjunction, preposition or comma. Trim it back to
  // the last complete sentence so the reply never trails off mid-thought.
  out = out.replace(/\s+(и|а|но|что|как|чтобы|если|или|же|ли|бы|не|в|на|с|к|по|от|до|за|из|о|об)\s*$/i, '');
  out = out.replace(/[,;:\-—\s]+$/, '');
  if (out && !/[.!?…]$/.test(out)) out += '.';
  return out.slice(0, 420);
}

// Reject model output that drifted: empty, absurdly short/long, containing
// markup or Latin chatter, or addressing the listener by the speaker's own name
// (a small-model confusion). On rejection the caller keeps the template line.
export function acceptReply(text, briefing, draft = '') {
  if (!text) return false;
  // A reply must carry at least a couple of words; one-word answers ("Привет")
  // sound like a bug, not a character.
  if (text.length < 10) return false;
  // Free-form answers (a question about the character's own past) may run longer
  // than the terse template beat, so give them more room.
  const cap = briefing?.free ? 420 : 300;
  if (text.length > cap) return false;
  if (text.split(/\s+/).filter(Boolean).length < 2) return false;
  if (/[<>{}|\\]/.test(text)) return false;
  // The local Qwen model occasionally slips into Chinese. Require the line to be
  // Russian and reject other scripts (CJK, fullwidth, Arabic, Hebrew, Greek).
  if (!/[\u0400-\u04ff]/.test(text)) return false;
  if (/[\u3000-\u9fff\uff00-\uffef\u0590-\u05ff\u0600-\u06ff\u0370-\u03ff]/.test(text)) return false;
  if (briefing?.name) {
    const parts = briefing.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
    const low = text.toLowerCase();
    if (parts.some((p) => low.includes(p))) return false; // never use the speaker's own name
    // ...nor a truncated form of it: "Март" for "Марта Вейл".
    const tokens = low.replace(/[^a-zа-яё ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4);
    if (tokens.some((w) => parts.some((p) => p.startsWith(w) || w.startsWith(p)))) return false;
  }
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (latin > text.length * 0.3) return false; // a Russian line should not be mostly Latin
  // A short reply that only mirrors the player's own words is not an answer
  // ("готов к сражению" -> "Я готов к сражению!"): reject short echoes.
  if (briefing?.playerText) {
    const norm = (s) => new Set(s.toLowerCase().replace(/[^a-zа-яё0-9 ]/gi, ' ').split(/\s+/).filter((w) => w.length >= 4));
    const said = norm(briefing.playerText);
    const words = [...norm(text)];
    if (said.size && words.length && words.length <= 6
      && words.filter((w) => said.has(w)).length >= Math.ceil(words.length * 0.6)) return false;
  }
  // The reply must stay on the draft's topic. We approximate that by sharing a
  // stem (first four letters) with the draft, which tolerates synonyms
  // ("привет" ~ "приветствую") while catching hallucinated non-answers.
  if (draft) {
    const stems = (s) => new Set(s.toLowerCase().replace(/[^a-zа-яё0-9 ]/gi, ' ').split(/\s+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 4)));
    const dw = stems(draft);
    if (dw.size && ![...stems(text)].some((w) => dw.has(w))) return false;
  }
  return true;
}

// Build the chat turns for a request. Prior exchanges are fed back as real
// user/assistant turns (trimmed to the last few), so the model keeps the thread
// of the conversation instead of answering every line as if it were the first.
export function historyTurns(briefing, limit = 8) {
  const turns = (briefing?.history || []).filter((h) => h && h.text).slice(-limit);
  return turns.map((h) => ({
    role: h.speaker === 'player' ? 'user' : 'assistant',
    content: h.text,
  }));
}

// Answer an open question from the player in the character's own words. This is
// the "living dialogue" path: the model is the author, not a reworder, so it can
// speak about anything — the character's past, the world, the player. The engine
// draft is only a fallback, kept if the model drifts, and is NOT shown to the
// model (so it cannot echo a wrong template). Returns null if no model is
// reachable, letting the caller fall back to the template beat.
export async function answerQuestion(briefing, fallbackText = '', avoid = '') {
  if (config.provider === 'off') return null;
  const same = (t) => (avoid && t.trim().toLowerCase() === avoid.trim().toLowerCase())
    || (fallbackText && t.trim().toLowerCase() === fallbackText.trim().toLowerCase());

  const messages = [
    { role: 'system', content: briefing.system },
    ...historyTurns(briefing),
    {
      role: 'user',
      content: `Собеседник говорит: «${briefing.playerText}».\nОтветь ему одной живой репликой от лица ${briefing.name}.`,
    },
  ];

  if (await localHealthy()) {
    try {
      const out = tidyReply(await chat(`${config.localUrl}/v1/chat/completions`, {
        key: '', model: 'local', messages, timeout: config.timeoutMs,
        maxTokens: 120, temperature: 0.75, topP: 0.9,
      }));
      if (acceptReply(out, { ...briefing, free: true }, '') && !same(out)) return { text: out, source: 'local' };
      const retry = [...messages, {
        role: 'user',
        content: 'Ответь одной живой фразой по-русски, не короче трёх слов, по существу вопроса.',
      }];
      const out2 = tidyReply(await chat(`${config.localUrl}/v1/chat/completions`, {
        key: '', model: 'local', messages: retry, timeout: config.timeoutMs,
        maxTokens: 120, temperature: 0.75, topP: 0.9,
      }));
      if (acceptReply(out2, { ...briefing, free: true }, '') && !same(out2)) return { text: out2, source: 'local' };
    } catch { localHealth = { ok: false, at: Date.now() }; }
  }

  if (config.cloudKey && config.provider !== 'local') {
    try {
      const out = tidyReply(await chat(`${config.cloudBase}/chat/completions`, {
        key: config.cloudKey, model: config.cloudModel, messages, timeout: config.timeoutMs,
        maxTokens: 120, temperature: 0.75, topP: 0.9,
      }));
      if (acceptReply(out, { ...briefing, free: true }, '')) return { text: out, source: 'cloud' };
    } catch { /* fall through to the template beat */ }
  }

  return null;
}

// Reword a template reply with whichever model is available. Always returns a
// usable line: on any failure the template text comes back untouched.
export async function rewordReply(briefing, fallbackText, avoid = '') {
  if (config.provider === 'off') return { text: fallbackText, source: 'template' };
  const same = (t) => avoid && t.trim().toLowerCase() === avoid.trim().toLowerCase();

  const messages = [
    {
      role: 'system',
      content: `${briefing.system}\n\nНиже дана черновая реплика — она верна по смыслу и настроению. Перепиши её своими словами, живой разговорной речью, сохранив смысл и настроение. Ответь ТОЛЬКО одной короткой фразой на русском, без кавычек и пояснений.`,
    },
    ...historyTurns(briefing),
    {
      role: 'user',
      content: `${briefing.playerText ? `Собеседник сказал: «${briefing.playerText}».\n` : ''}Черновик ответа: «${fallbackText}»\nТема разговора: ${briefing.topic}.`,
    },
  ];

  if (await localHealthy()) {
    try {
      const out = tidyReply(await chat(`${config.localUrl}/v1/chat/completions`, {
        key: '', model: 'local', messages, timeout: config.timeoutMs,
      }));
      if (acceptReply(out, briefing, fallbackText) && !same(out)) return { text: out, source: 'local' };
      // One retry with a nudge: small models often produce a one-word stub, slip
      // into another language, or repeat the previous line on the first go.
      const retry = [...messages, {
        role: 'user',
        content: `${same(out) ? `Не повторяй это же. ` : ''}Ответь одной живой фразой по-русски, не короче трёх слов.`,
      }];
      const out2 = tidyReply(await chat(`${config.localUrl}/v1/chat/completions`, {
        key: '', model: 'local', messages: retry, timeout: config.timeoutMs,
      }));
      if (acceptReply(out2, briefing, fallbackText) && !same(out2)) return { text: out2, source: 'local' };
    } catch { localHealth = { ok: false, at: Date.now() }; }
  }

  if (config.cloudKey && config.provider !== 'local') {
    try {
      const out = tidyReply(await chat(`${config.cloudBase}/chat/completions`, {
        key: config.cloudKey, model: config.cloudModel, messages, timeout: config.timeoutMs,
      }));
      if (acceptReply(out, briefing, fallbackText)) return { text: out, source: 'cloud' };
    } catch { /* fall through to template */ }
  }

  return { text: fallbackText, source: 'template' };
}

export async function llmStatus() {
  const local = await localHealthy();
  return {
    provider: config.provider,
    local: { available: local, model: path.basename(config.localModelPath), weightsPresent: localModelPresent() },
    cloud: { configured: !!config.cloudKey, model: config.cloudModel },
    mode: local ? 'local' : (config.cloudKey ? 'cloud' : 'template'),
  };
}
