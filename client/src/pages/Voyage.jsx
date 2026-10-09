import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import SceneBackdrop from '../scenes.jsx';
import Talk from '../Talk.jsx';

// W-SEA: the voyage screen. A sea crossing is opened up here: the party sails
// from the port, the sea shows its stops one by one (a Fortune island to note,
// or pirates / a monster to fight), and once the list runs out the party has
// landed at the far port.
export default function VoyagePage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const [voyage, setVoyage] = useState(null);
  const [party, setParty] = useState(null);
  const [talking, setTalking] = useState(null);
  const [relation, setRelation] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.getVoyage(characterId).then(setVoyage).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [characterId]);
  useEffect(() => { api.getParty(characterId).then(setParty).catch(() => {}); }, [characterId]);

  const resolve = async () => {
    setBusy(true); setError('');
    try {
      const res = await api.resolveVoyage(characterId);
      setVoyage(res.voyage);
      if (res.battleId) navigate(`/sea/${res.battleId}`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error && !voyage) return <div className="error">{error}</div>;
  if (!voyage) return <div className="muted center">Загрузка…</div>;

  const stop = voyage.stop;
  const total = voyage.stops.length;
  const members = party?.members || [];

  return (
    <div>
      <Link to={`/world/locations/${voyage.to}`} className="muted">← Порт</Link>
      <div className="scene-hero">
        <SceneBackdrop scene="sea" biome="coast" danger={2} name={`Море: ${voyage.from} → ${voyage.to}`} />
        <div className="scene-caption">
          <h1>Морской путь</h1>
          <p className="muted">{voyage.from} → {voyage.to} · остановок: {total}</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Плавание</h2>
        {total === 0 && <p className="muted">Море спокойно — ни паруса, ни тени на горизонте.</p>}
        {stop && (
          <div className="road-encounter">
            <h3>{stop.title}</h3>
            {stop.kind === 'island' && (
              <p className="muted">{stop.island?.name} — {stop.island?.description}</p>
            )}
            {stop.kind === 'pirates' && (
              <p className="muted">Пиратский корабль яруса {stop.tier} идёт на сближение. Отряд пойдёт на абордаж, пушки бьют по корпусу врага.</p>
            )}
            {stop.kind === 'sea_monster' && (
              <p className="muted">Из глубины поднимается чудовище яруса {stop.tier}. Корабль бьётся один — отряд остаётся на палубе.</p>
            )}
            <div className="actions">
              <button type="button" disabled={busy} onClick={resolve}>
                {stop.kind === 'island' ? 'Занести в бумаги' : 'К бою!'}
              </button>
            </div>
          </div>
        )}
        {!stop && voyage.done && (
          <div className="road-arrived">
            <p className="road-outcome">Плавание окончено. Отряд стоит в порту {voyage.to}.</p>
            <div className="actions">
              <button type="button" onClick={() => navigate(`/world/locations/${voyage.to}`)}>Сойти на берег</button>
            </div>
          </div>
        )}
      </div>

      <p className="muted small">
        <Link to={`/papers/${characterId}`}>Судовой журнал и бумаги →</Link>
      </p>

      <div className="card">
        <h2>Поговорить с отрядом</h2>
        <p className="muted small">Долгий переход — время для разговоров. Спросите любого, пока корабль идёт.</p>
        {members.length === 0 && <p className="muted">Сейчас в отряде никого нет.</p>}
        <div className="cards">
          {members.map((m) => (
            <div className="card" key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ flex: 1 }}>
                <b>{m.name}</b>
                <div className="muted small">{m.className} · ур. {m.level}</div>
              </span>
              <button
                type="button"
                className={`btn small${talking === m.id ? '' : ' ghost'}`}
                onClick={() => setTalking((cur) => (cur === m.id ? null : m.id))}
              >
                {talking === m.id ? 'Свернуть' : 'Поговорить'}
              </button>
            </div>
          ))}
        </div>
        {talking != null && (
          <Talk
            leaderId={characterId}
            kind="companion"
            refId={talking}
            onClose={() => setTalking(null)}
            onRelationChange={setRelation}
          />
        )}
        {relation != null && talking == null && <p className="muted small">Отношение: {relation}</p>}
      </div>
    </div>
  );
}
