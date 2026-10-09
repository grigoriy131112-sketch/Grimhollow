import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';

// W-SEA: the ship's papers. A free-form journal the player writes, plus an
// automatic event log the game fills (won sea battles, discovered islands) and
// the lore notes learned along the way. Everything lives under /papers/:id.
export default function PapersPage() {
  const { characterId } = useParams();
  const [papers, setPapers] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getPapers(characterId)
      .then((p) => { setPapers(p); setNotes(p.notes || ''); })
      .catch((e) => setError(e.message));
  }, [characterId]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      const p = await api.savePapers(characterId, notes);
      setPapers(p); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error && !papers) return <div className="error">{error}</div>;
  if (!papers) return <div className="muted center">Загрузка…</div>;

  return (
    <div>
      <Link to={`/shipyard/${characterId}`} className="muted">← Корабль</Link>
      <div className="page-head">
        <h1>Судовой журнал</h1>
        <span className="muted small">бумаги, заметки и то, что море записало за вас</span>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Заметки</h2>
        <p className="muted small">Пишите своё: цели, долги, места, куда вернуться.</p>
        <textarea
          className="paper-notes"
          rows={8}
          value={notes}
          onChange={(ev) => setNotes(ev.target.value)}
          placeholder="Например: вернуться к Стеклянному маяку, когда корабль окрепнет…"
        />
        <div className="actions">
          <button type="button" disabled={busy} onClick={save}>Сохранить</button>
          {saved && <span className="good-tag">Записано.</span>}
        </div>
      </div>

      {papers.lore?.length > 0 && (
        <div className="card">
          <h2>Что мы узнали</h2>
          <ul className="stats">
            {papers.lore.map((l, i) => <li key={i}><span className="muted">{l.text}</span></li>)}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Хроника плаваний</h2>
        {papers.log.length === 0
          ? <p className="muted">Пока пусто. Море запишет, когда будет что.</p>
          : (
            <ul className="stats">
              {papers.log.map((entry, i) => (
                <li key={i}>
                  <span>
                    <span className="muted small">{new Date(entry.at).toLocaleString('ru-RU')} · </span>
                    {entry.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  );
}
