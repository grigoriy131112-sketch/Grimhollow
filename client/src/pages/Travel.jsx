import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

// The road between two places. The party walks it in real time: the bar creeps
// on its own, and when an encounter is due the road stops until it is answered.
const MINUTE_MS = 10_000;

function useNow(active, period = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), period);
    return () => clearInterval(t);
  }, [active, period]);
  return now;
}

export default function TravelPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [travel, setTravel] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Fetch the road, and keep fetching until it is over. Polling must survive a
  // stop: if the loop stopped while an encounter was pending it would never
  // resume after the player answered, leaving the bar frozen mid-road.
  useEffect(() => {
    let alive = true;
    let timer;
    const load = async () => {
      try {
        const view = await api.getTravel(id);
        if (!alive) return;
        // Stamp receipt time so the bar can creep between polls.
        setTravel({ ...view, fetchedAt: Date.now() });
        if (view && !view.arrived) timer = setTimeout(load, 2000);
      } catch (e) {
        if (!alive) return;
        // A finished road answers with `arrived: true`; a vanished one only
        // means the trip is over, so send the party back to the world map
        // instead of freezing on an error.
        if (/не найден/i.test(e.message)) navigate('/world', { replace: true });
        else setError(e.message);
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id, navigate]);

  const walking = !!travel && !travel.arrived && !travel.encounter;
  const now = useNow(walking, 1000);

  const choose = async (choice) => {
    setBusy(true); setError('');
    try {
      const res = await api.chooseTravel(id, choice);
      setOutcome(res.outcome);
      if (res.battleId) { navigate(`/battles/${res.battleId}`); return; }
      setTravel({ ...res.travel, fetchedAt: Date.now() });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error && !travel) return <div className="error">{error}</div>;
  if (!travel) return <div className="muted center">Загрузка…</div>;

  // Local, smooth progress between polls: interpolate from the last snapshot.
  const totalMs = travel.minutes * MINUTE_MS;
  const smooth = travel.paused || travel.arrived
    ? travel.progress
    : Math.min(1, travel.progress + (now - (travel.fetchedAt || now)) / totalMs);
  const pct = Math.round(smooth * 100);
  const minutesLeft = Math.max(0, travel.minutes - travel.minute);
  const eta = travel.arrivesAt ? new Date(travel.arrivesAt) : null;

  return (
    <div>
      <Link to={`/world/locations/${travel.from.id}`} className="muted">← {travel.from.name}</Link>

      <div className="card">
        <div className="page-head">
          <h1 style={{ margin: 0 }}>Дорога</h1>
          <span className="muted">{travel.from.name} → {travel.to.name}</span>
        </div>

        <div className="road-track">
          <div className="road-fill" style={{ width: `${pct}%` }} />
          <span className="road-here" style={{ left: `${pct}%` }} />
        </div>
        <div className="road-meta">
          <span>{travel.minute} мин</span>
          <span className="muted">из {travel.minutes} мин пути</span>
          {walking && <span className="muted small">в пути · осталось ~{minutesLeft} мин</span>}
        </div>

        {error && <div className="error">{error}</div>}

        {travel.arrived ? (
          <div className="road-arrived">
            <p>Отряд доходит до места.</p>
            <div className="actions">
              <button type="button" onClick={() => navigate(`/world/locations/${travel.to.id}`)}>
                Войти в {travel.to.name}
              </button>
            </div>
          </div>
        ) : travel.encounter ? (
          <div className="road-event">
            <h2>{travel.encounter.title}</h2>
            <p className="muted small">На {travel.pending?.minute}-й минуте пути. Дорога ждёт вашего решения.</p>
            <div className="actions">
              {travel.encounter.options.map((o) => (
                <button key={o.id} type="button" disabled={busy} onClick={() => choose(o.id)}>{o.label}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="road-walking">
            <p className="muted">Отряд идёт. Дорога сама приведёт к месту — следите за полосой пути.</p>
            <p className="muted small">
              {travel.stopsLeft > 0
                ? `Впереди переходов: ${travel.stopsLeft}`
                : 'Впереди пусто — только дорога'}
              {eta ? ` · прибытие около ${eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          </div>
        )}

        {outcome && <p className="road-outcome">{outcome.text}</p>}
      </div>
    </div>
  );
}
