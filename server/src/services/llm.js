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
  localModelPath: process.env.LLM_MODEL_PATH || path.join(repoRoot, 'models', 'qwen2.5-1.5b-instruct-q4_k_m.gguf'),
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

async function chat(url, { key, model, messages, timeout }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages, max_tokens: 80, temperature: 0.4, top_p: 0.85 }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } finally { clearTimeout(t); }
}

function tidy(text) {
  return String(text || '')
    .trim()
    .replace(/^["«'\-—\s]+|["»'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 400);
}

// Reject model output that drifted: empty, absurdly short/long, containing
// markup or Latin chatter, or addressing the listener by the speaker's own name
// (a small-model confusion). On rejection the caller keeps the template line.
function accept(text, briefing, draft = '') {
  if (!text) return false;
  if (text.length < 2 || text.length > 300) return false;
  if (/[<>{}|\\]/.test(text)) return false;
  if (briefing?.name) {
    const parts = briefing.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
    const low = text.toLowerCase();
    if (parts.some((p) => low.includes(p))) return false; // never use the speaker's own name
  }
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (latin > text.length * 0.3) return false; // a Russian line should not be mostly Latin
  // A short line may differ freely; a longer one must stay on the draft's topic,
  // which we approximate by sharing at least one substantial word.
  if (text.length > 25 && draft) {
    const words = (s) => new Set(s.toLowerCase().replace(/[^a-zа-яё0-9 ]/gi, ' ').split(/\s+/).filter((w) => w.length >= 5));
    const dw = words(draft);
    if (dw.size && ![...words(text)].some((w) => dw.has(w))) return false;
  }
  return true;
}

// Reword a template reply with whichever model is available. Always returns a
// usable line: on any failure the template text comes back untouched.
export async function rewordReply(briefing, fallbackText) {
  if (config.provider === 'off') return { text: fallbackText, source: 'template' };

  const messages = [
    {
      role: 'system',
      content: `${briefing.system}\n\nЧерновая реплика ниже — правильная по смыслу и настроению. Перепиши её своими словами, сохранив смысл и настроение. Ответь ТОЛЬКО одной короткой фразой на русском, без кавычек и пояснений.`,
    },
    { role: 'user', content: `Черновик: «${fallbackText}»\nТема разговора: ${briefing.topic}.` },
  ];

  if (await localHealthy()) {
    try {
      const out = tidy(await chat(`${config.localUrl}/v1/chat/completions`, {
        key: '', model: 'local', messages, timeout: config.timeoutMs,
      }));
      if (accept(out, briefing, fallbackText)) return { text: out, source: 'local' };
    } catch { localHealth = { ok: false, at: Date.now() }; }
  }

  if (config.cloudKey && config.provider !== 'local') {
    try {
      const out = tidy(await chat(`${config.cloudBase}/chat/completions`, {
        key: config.cloudKey, model: config.cloudModel, messages, timeout: config.timeoutMs,
      }));
      if (accept(out, briefing, fallbackText)) return { text: out, source: 'cloud' };
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
