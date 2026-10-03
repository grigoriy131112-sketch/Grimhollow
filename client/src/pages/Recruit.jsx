import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { classColor } from '../icons.jsx';

const METHOD_LABEL = {
  free: 'бесплатно', gold: 'за золото', trial: 'испытание', quest: 'за услугу',
  tame: 'приручение', raise: 'некромантия', persuade: 'убеждение', favor: 'просьба',
};

export default function RecruitPage() {
  const { leaderId } = useParams();
  const [sources, setSources] = useState([]);
  const [source, setSource] = useState('');
  const [board, setBoard] = useState([]);
  const [gold, setGold] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  useEffect(() => {
    api.getSources(leaderId).then(setSources).catch((e) => setError(e.message));
    api.getParty(leaderId).then((p) => setGold(p.leader.gold)).catch(() => {});
  }, [leaderId]);

  const loadBoard = () => api.getRecruits(leaderId, source || undefined).then(setBoard).catch((e) => setError(e.message));
  useEffect(() => { loadBoard(); }, [leaderId, source]);

  const affordable = (cand) => cand.method !== 'gold' && cand.method !== 'ransom' ? true : gold >= cand.price;

  const call = async (cand) => {
    setBusyKey(cand.key); setError(''); setResult(null);
    try {
      const payload = { templateKey: cand.key, source: source || cand.sources[0]?.key };
      if (cand.method === 'gold' || cand.method === 'ransom') payload.goldOffered = cand.price;
      const r = await api.recruit(leaderId, payload);
      setResult({ cand, ...r });
      if (r.accepted) {
        loadBoard();
        api.getParty(leaderId).then((p) => setGold(p.leader.gold)).catch(() => {});
      }
    } catch (err) { setError(err.message); }
    finally { setBusyKey(null); }
  };

  return (
    <div>
      <Link to={`/party/${leaderId}`} className="muted">← Отряд</Link>
      <div className="page-head">
        <h1>Набор отряда</h1>
        <span className="badge">💰 {gold} золота</span>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="source-chips">
        <button type="button" className={`chip ${source === '' ? 'selected' : ''}`} onClick={() => setSource('')}>Все</button>
        {sources.map((s) => (
          <button key={s.key} type="button" title={s.blurb}
            className={`chip ${source === s.key ? 'selected' : ''}`} disabled={s.available === 0}
            onClick={() => setSource(s.key)}>
            {s.icon} {s.name} <span className="chip-count">{s.available}</span>
          </button>
        ))}
      </div>

      {result && (
        <div className={`card recruit-result ${result.accepted ? 'ok' : 'no'}`}>
          {result.accepted
            ? `✅ ${result.cand.name} соглашается и вступает в отряд${result.goldPaid ? ` (−${result.goldPaid} золота)` : ''}.`
            : `🚪 ${result.cand.name} отказывается идти с вами (шанс был ${result.chance}%).`}
        </div>
      )}

      <div className="cards">
        {board.map((c) => (
          <div className="card recruit-card" key={c.key} style={{ borderColor: `${classColor(c.class)}55` }}>
            <div className="recruit-head" style={{ borderColor: classColor(c.class) }}>
              <div className="portrait" style={{ borderColor: classColor(c.class) }}>
                <span className="portrait-initial">{c.name[0]}</span>
              </div>
              <div>
                <h3>{c.name}</h3>
                <p className="muted small">{c.className} · {c.level} уровень</p>
              </div>
            </div>
            <p className="member-history">{c.history}</p>
            <div className="trait-cols">
              <div>{c.plus.map((t) => <span key={t.name} className="trait plus" title={t.blurb}>+{t.name}</span>)}</div>
              <div>{c.minus.map((t) => <span key={t.name} className="trait minus" title={t.blurb}>−{t.name}</span>)}</div>
            </div>
            <div className="recruit-meta">
              <span className="badge">{METHOD_LABEL[c.method] || c.method}</span>
              {(c.method === 'gold' || c.method === 'ransom') && <span className="badge">💰 {c.price}</span>}
              <span className="badge" title="шанс согласия при текущих условиях">Согласие ~{c.acceptChance}%</span>
            </div>
            <p className="muted small">Как найти: {c.sources.map((s) => `${s.icon} ${s.name}`).join(' · ')}</p>
            <button type="button" disabled={busyKey === c.key || !affordable(c)} onClick={() => call(c)}
              title={affordable(c) ? 'Позвать в отряд' : 'Не хватает золота'}>
              {busyKey === c.key ? '…' : affordable(c) ? 'Позвать' : 'Не хватает золота'}
            </button>
          </div>
        ))}
        {board.length === 0 && <p className="muted">Здесь некого звать. Выберите другой способ.</p>}
      </div>
    </div>
  );
}
