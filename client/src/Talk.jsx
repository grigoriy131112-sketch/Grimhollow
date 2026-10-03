import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { classColor, Icon } from './icons.jsx';

// A reusable conversation panel. It works for NPCs (kind="npc") and for party
// companions (kind="companion"): same API, same memory, same relationship meter.

const MOOD_LABEL = { hostile: 'враждебно', cold: 'холодно', neutral: 'ровно', warm: 'тепло', devoted: 'предано' };

function RelationMeter({ value, mood }) {
  const cls = value < 25 ? 'bad' : value < 55 ? 'warn' : 'good';
  return (
    <div className="rel-block">
      <div className="rel-row">
        <span className="muted small">Отношение: {MOOD_LABEL[mood] || mood}</span>
        <div className="rel-bar"><div className={`rel-fill ${cls}`} style={{ width: `${value}%` }} /><span className="rel-num">{value}</span></div>
      </div>
    </div>
  );
}

export default function Talk({ leaderId, kind, refId, onClose, onRelationChange }) {
  const [convo, setConvo] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastLlm, setLastLlm] = useState(null);
  const [topics, setTopics] = useState([]);
  const feedRef = useRef(null);

  useEffect(() => {
    api.dialogueOptions().then((o) => setTopics(o.topics || [])).catch(() => {});
  }, []);

  const load = () => api.getConversation(leaderId, kind, refId)
    .then(setConvo).catch((e) => setError(e.message));

  useEffect(() => { setConvo(null); setError(''); load(); }, [leaderId, kind, refId]);

  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [convo]);

  const send = async (line) => {
    const value = (line ?? text).trim();
    if (!value || busy) return;
    setBusy(true); setError('');
    // Show the player's line immediately, then reconcile with the server.
    setConvo((c) => ({ ...c, messages: [...c.messages, { speaker: 'player', text: value, topic: null, delta: 0 }] }));
    setText('');
    try {
      const res = await api.say(leaderId, kind, refId, value);
      setLastLlm(res.llm);
      await load();
      onRelationChange?.(res.relation);
    } catch (err) { setError(err.message); await load(); }
    finally { setBusy(false); }
  };

  if (!convo) return <div className="card talk"><div className="muted">Загрузка собеседника…</div></div>;
  const p = convo.persona;
  const color = classColor(p.class) || '#a08a6a';

  return (
    <div className="card talk">
      <div className="talk-head">
        <div className="portrait" style={{ borderColor: color, width: 48, height: 48 }}>
          {p.portrait ? <Icon src={p.portrait} alt={p.name} size={40} />
            : <span className="portrait-initial" style={{ fontSize: '1.1rem' }}>{p.name?.[0]}</span>}
        </div>
        <div className="talk-id">
          <h3>{p.name}</h3>
          <span className="muted small">{p.role}</span>
        </div>
        {onClose && <button type="button" className="linklike" onClick={onClose}>закрыть</button>}
      </div>

      <RelationMeter value={p.relation} mood={p.mood} />
      {p.description && <p className="muted small talk-desc">{p.description}</p>}

      {convo.memory.length > 0 && (
        <div className="memory-hints">
          <span className="muted small">Помнит: </span>
          {convo.memory.slice(0, 4).map((m) => (
            <span key={m.key} className={`chip memory ${m.weight >= 2 ? 'strong' : ''}`} title={`вес ${m.weight}`}>{m.text}</span>
          ))}
        </div>
      )}

      <div className="talk-feed" ref={feedRef}>
        {convo.messages.length === 0 && <p className="muted small center">Скажите что-нибудь.</p>}
        {convo.messages.map((m, i) => (
          <div key={i} className={`bubble ${m.speaker === 'player' ? 'me' : 'them'}`}>
            <span className="bubble-text">{m.text || '…'}</span>
            {m.delta !== 0 && m.speaker === 'other' && (
              <span className={`delta-chip ${m.delta > 0 ? 'gain' : 'drop'}`}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
            )}
          </div>
        ))}
        {busy && <div className="bubble them typing">…</div>}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="talk-topics">
        {topics.map((t) => (
          <button key={t.key} type="button" className="chip" disabled={busy} onClick={() => send(promptFor(t.key))}>{t.label}</button>
        ))}
      </div>

      <form className="talk-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ваша реплика…" disabled={busy} />
        <button type="submit" disabled={busy || !text.trim()}>Сказать</button>
      </form>
      {lastLlm && <div className="muted small llm-badge">ответ: {lastLlm === 'local' ? 'локальный ИИ (Qwen)' : lastLlm === 'cloud' ? 'облачный ИИ' : 'движок (характер)'}</div>}
    </div>
  );
}

// Ready-made prompts behind the topic chips, so a click produces a real line the
// engine can classify.
function promptFor(topic) {
  return {
    greeting: 'Приветствую тебя.',
    wellbeing: 'Привет, как ты? Как себя чувствуешь?',
    farewell: 'Прощай, увидимся.',
    compliment: 'Ты отлично держишься, я восхищён.',
    insult: 'Ты жалкий трус и дурак.',
    threat: 'Если предашь — убью.',
    battle: 'Готов к сражению?',
    joke: 'Слышал шутку? Смешно, правда?',
    apology: 'Прости меня, я был неправ.',
    history: 'Расскажи о себе, откуда ты?',
    party: 'Как тебе наш отряд?',
    join: 'Пойдём со мной, вступай в отряд.',
    help: 'Помоги мне, нужна твоя помощь.',
    gold: 'Я заплачу золотом, называй цену.',
    faith: 'Скажи, ты веришь в богов?',
    lore: 'Что ты знаешь об этих местах?',
    smalltalk: 'Ну, как дела?',
  }[topic] || 'Расскажи что-нибудь.';
}
