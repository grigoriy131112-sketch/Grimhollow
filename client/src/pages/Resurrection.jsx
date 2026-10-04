import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { classColor } from '../icons.jsx';

// Ритуал воскрешения: не жертва и не плата, а путь в царство мёртвых.
// Игрок выбирает павшего спутника, открывает врата и бьётся с пастухом.
export default function ResurrectionPage() {
  const { leaderId } = useParams();
  const navigate = useNavigate();
  const [ritual, setRitual] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.getRitual(leaderId)
    .then(setRitual)
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, [leaderId]);

  const openGate = (memberId) => {
    setBusy(true);
    setError('');
    api.startResurrection(leaderId, memberId)
      .then(({ battleId }) => navigate(`/battles/${battleId}`))
      .catch((e) => { setError(e.message); setBusy(false); });
  };

  if (error && !ritual) return <div className="error">{error}</div>;
  if (!ritual) return <div className="muted center">Загрузка…</div>;

  return (
    <div>
      <Link to={`/party/${leaderId}`} className="muted">← Отряд</Link>
      <div className="page-head">
        <h1>🕯 Ритуал воскрешения</h1>
        <span className="badge">{ritual.fallen.length} павших</span>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>{ritual.realm.name}</h2>
        <p className="muted">{ritual.realm.description}</p>
        <p className="small">
          Цена возвращения — не жертва и не золото, а сам путь: место, ключ и живой отряд за спиной.
          Победите владыку царства мёртвых, и он отпустит одного павшего.
        </p>
        {ritual.realm.boss && (
          <div className="enemy-line">
            <b>{ritual.realm.boss.name}</b>
            <span className="muted small"> · {ritual.realm.boss.level} уровень · ❤️ {ritual.realm.boss.maxHp} · ⚔️ {ritual.realm.boss.attack}</span>
            <p className="muted small">{ritual.realm.boss.description}</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Условия ритуала</h2>
        <ul className="stats">
          {ritual.requirements.map((r) => (
            <li key={r.key}>
              <span>{r.met ? '✅' : '⬜'} {r.label}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Место: {ritual.site.name}
          {ritual.site.current ? ' — вы здесь.' : ritual.site.visited ? ' — вы бывали здесь, но сейчас не стоите в ней.' : ' — вы ещё не находили это место.'}
          {' '}Ключ: «{ritual.item.name}» — {ritual.item.have ? 'у вас есть.' : 'нужно добыть, впервые войдя в часовню.'}
        </p>
      </div>

      {ritual.gate && (
        <div className="card">
          <p className="good-tag">Врата уже открыты. Начатый бой нужно закончить.</p>
          <button type="button" className="btn" onClick={() => navigate(`/battles/${ritual.gate.battleId}`)}>
            Вернуться к бою
          </button>
        </div>
      )}

      {ritual.fallen.length === 0 ? (
        <div className="card">
          <p className="muted">В отряде нет павших. Никто не ждёт возвращения — и это хорошо.</p>
        </div>
      ) : (
        <div className="cards">
          {ritual.fallen.map((m) => (
            <div className="card" key={m.id} style={{ borderColor: `${classColor(m.class)}55` }}>
              <h3>{m.name}</h3>
              <p className="muted small">{m.className} · {m.level} уровень · погиб(ла)</p>
              <p className="small">{m.history}</p>
              <button
                type="button"
                className="btn"
                disabled={busy || !ritual.canOpen}
                title={ritual.canOpen ? '' : 'Не все условия выполнены'}
                onClick={() => openGate(m.id)}
              >
                Открыть врата за {m.name}
              </button>
              {!ritual.canOpen && (
                <p className="muted small">Пока нельзя: {ritual.requirements.filter((r) => !r.met).map((r) => r.label.toLowerCase()).join('; ')}.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
