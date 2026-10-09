import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../icons.jsx';
import HeroTabs from '../HeroTabs.jsx';

// Журнал заданий (Wave G8). API живёт под /api/quests (routes/quests.js).
// api.js — общий файл других волн, поэтому экран держит свой маленький
// помощник запросов, как pages/Trade.jsx и pages/Settlement.jsx.
async function getJson(path) {
  const res = await fetch(`/api${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Запрос не удался (${res.status})`);
  return data;
}
async function postJson(path, body) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Запрос не удался (${res.status})`);
  return data;
}

// Источник -> существующая SVG-иконка из game-icons.net (без растров).
const SOURCE_ICONS = {
  guild: 'guarded_tower',
  tavern: 'campfire',
  temple: 'church',
  library: 'ancient_columns',
  npc: 'crossroads',
  story: 'black_spire',
};
const sourceIcon = (source) => (SOURCE_ICONS[source] ? `/art/landmarks/${SOURCE_ICONS[source]}.svg` : null);

const STATE_LABELS = { active: 'В работе', completed: 'Выполнено', failed: 'Провалено', available: 'Доступно' };

function QuestCard({ quest, onAccept, onAbandon, onReport, busy }) {
  const [open, setOpen] = useState(false);
  const done = quest.state === 'completed';
  const active = quest.state === 'active';
  const failed = quest.state === 'failed';
  return (
    <div className="card" style={{ borderColor: done ? '#355a37' : failed ? '#5a2f2f' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ display: 'inline-flex' }}><Icon src={sourceIcon(quest.source)} alt={quest.sourceLabel} size={30} /></span>
        <span style={{ flex: 1 }}>
          <b>{quest.title}</b>
          <div className="muted small">
            {quest.sourceLabel}
            {quest.giverName ? ` · ${quest.giverName}` : ''}
            {' · глава '}{quest.chapter}
            {quest.story ? ' · ключевое' : ''}
          </div>
        </span>
        <span className={`badge${done ? ' safe' : ''}`}>{STATE_LABELS[quest.state] || quest.state}</span>
      </div>

      <p className="muted small">{quest.objectiveText}.</p>
      <p className="small muted">{quest.text}</p>

      {active && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.4rem 0' }}>
          <div
            role="progressbar"
            aria-valuenow={quest.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ flex: 1, height: 8, borderRadius: 6, background: '#2a2130', border: '1px solid var(--line)', overflow: 'hidden' }}
          >
            <span style={{ display: 'block', height: '100%', width: `${quest.percent}%`, background: 'var(--gold)' }} />
          </div>
          <span className="muted small">{quest.progress} / {quest.target}</span>
        </div>
      )}

      <p className="small">Награда: <span className="muted">{quest.rewardText || '—'}</span></p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        {quest.state === 'available' && (
          <button type="button" className="btn small" disabled={busy} onClick={() => onAccept(quest.key)}>Взять</button>
        )}
        {active && (
          <>
            <button type="button" className="btn small" disabled={busy} onClick={() => onReport(quest.key)}>Отметить шаг</button>
            <button type="button" className="btn small ghost" disabled={busy} onClick={() => onAbandon(quest.key)}>Отказаться</button>
          </>
        )}
        <button type="button" className="btn small ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Свернуть' : 'Подробнее'}
        </button>
      </div>

      {open && (
        <ul className="stats" style={{ marginTop: '0.5rem' }}>
          <li><span>Цель</span><b>{quest.objective.type}</b></li>
          <li><span>Требуется</span><b>{quest.requires.length ? quest.requires.join(', ') : 'нет'}</b></li>
          <li><span>Ключ</span><b>{quest.key}</b></li>
        </ul>
      )}
    </div>
  );
}

export default function QuestsPage() {
  const { characterId } = useParams();
  const [characters, setCharacters] = useState([]);
  const [heroId, setHeroId] = useState(characterId || '');
  const [log, setLog] = useState(null);
  const [tab, setTab] = useState('available');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getJson('/characters').then((list) => {
      setCharacters(list);
      if (!heroId && list.length) setHeroId(String(list[0].id));
    }).catch((e) => setError(e.message));
  }, []);

  const load = (id) => {
    if (!id) return;
    getJson(`/quests/${id}`).then(setLog).catch((e) => setError(e.message));
  };
  useEffect(() => { load(heroId); }, [heroId]);

  const hero = useMemo(() => characters.find((c) => String(c.id) === String(heroId)) || null, [characters, heroId]);

  const run = async (fn, okMsg) => {
    if (!heroId) return setError('Сначала выберите героя.');
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fn();
      await getJson(`/quests/${heroId}`).then(setLog);
      getJson('/characters').then(setCharacters).catch(() => {});
      if (okMsg) setNotice(typeof okMsg === 'function' ? okMsg(res) : okMsg);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const onAccept = (key) => run(
    () => postJson(`/quests/${heroId}/accept`, { key }),
    (res) => `Взято: «${res.title}»`,
  );
  const onAbandon = (key) => run(
    () => postJson(`/quests/${heroId}/abandon`, { key }),
    'Задание возвращено в выдачу.',
  );
  const onReport = (key) => run(
    () => postJson(`/quests/${heroId}/progress`, { key }),
    (res) => (res.complete ? `Выполнено: «${res.key}»` : `Отмечено: ${res.progress}/${res.target}`),
  );

  if (error && !log) return <div className="error">{error}</div>;

  const lists = {
    available: log?.available || [],
    active: log?.active || [],
    completed: log?.completed || [],
    failed: log?.failed || [],
  };
  const tabs = [
    ['available', 'Доступные', lists.available.length],
    ['active', 'В работе', lists.active.length],
    ['completed', 'Выполнено', lists.completed.length],
    ['failed', 'Провалено', lists.failed.length],
  ];

  return (
    <div>
      <Link to={`/characters/${heroId}`} className="muted">← К герою</Link>
      <HeroTabs characterId={heroId} active="quests" />
      <div className="page-head">
        <h1>📜 Журнал заданий</h1>
        <span className="badge">{hero ? `${hero.name} · ${hero.gold} 🪙` : 'нет героя'}</span>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <p className="muted small">✓ {notice}</p>}

      <div className="card">
        <div className="grid2">
          <div>
            <label className="muted small" htmlFor="quest-hero">Чей журнал</label>
            <select id="quest-hero" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
              {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <span className="muted small">Открыто</span>
            <div className="muted small">
              {(log?.unlocks || []).length
                ? log.unlocks.map((u) => u.label).join(', ')
                : 'пока ничего не открыто'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
        {tabs.map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            className={`btn small${tab === key ? '' : ' ghost'}`}
            onClick={() => setTab(key)}
          >
            {label} · {n}
          </button>
        ))}
      </div>

      <div className="cards">
        {lists[tab].map((q) => (
          <QuestCard
            key={q.key}
            quest={q}
            busy={busy}
            onAccept={onAccept}
            onAbandon={onAbandon}
            onReport={onReport}
          />
        ))}
        {lists[tab].length === 0 && <p className="muted">Здесь пусто.</p>}
      </div>
    </div>
  );
}
