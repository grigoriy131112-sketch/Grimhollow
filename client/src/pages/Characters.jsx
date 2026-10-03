import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function CharactersPage() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState([]);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', class: 'fighter' });

  const load = () => api.listCharacters().then(setCharacters).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.getOptions().then(setOptions).catch((e) => setError(e.message));
  }, []);

  const selectedClass = options?.classes.find((c) => c.key === form.class);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const created = await api.createCharacter(form);
      navigate(`/characters/${created.id}`);
    } catch (err) { setError(err.message); }
  };

  const remove = async (id, e) => {
    e.preventDefault();
    if (!confirm('Abandon this hero forever?')) return;
    await api.deleteCharacter(id);
    load();
  };

  return (
    <div>
      <div className="page-head">
        <h1>Your Heroes</h1>
        <button type="button" onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : '+ New hero'}</button>
      </div>
      {error && <div className="error">{error}</div>}

      {creating && options && (
        <form className="card" onSubmit={submit}>
          <h2>Forge a hero</h2>
          <div className="grid2">
            <label>Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kael Vane" />
            </label>
            <label>Class
              <select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })}>
                {options.classes.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          </div>
          {selectedClass && (
            <div className="card" style={{ background: '#14101a' }}>
              <p className="muted">{selectedClass.blurb}</p>
              <p className="small"><b>Starting stats:</b> {Object.entries(selectedClass.base).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
              <p className="small"><b>Per level:</b> {selectedClass.growthText}</p>
              <p className="small muted">{selectedClass.abilities.filter((a) => a.unlockLevel === 1).map((a) => `${a.icon} ${a.name}`).join(' · ')} unlocked at level 1.</p>
            </div>
          )}
          <button type="submit">Create hero</button>
        </form>
      )}

      <div className="cards">
        {characters.map((c) => (
          <Link className="card hero-card" key={c.id} to={`/characters/${c.id}`}>
            <div className="hero-top">
              <h3>{c.name}</h3>
              <span className="badge">Lv {c.level}</span>
            </div>
            <p className="muted">{c.className}</p>
            <div className="stat-row">
              <span>❤️ {c.hp}/{c.stats.maxHp}</span>
              <span>🔮 {c.mana}/{c.stats.maxMana}</span>
              <span>⚔️ {c.stats.attack}</span>
              <span>💰 {c.gold}</span>
            </div>
            <div className="hero-actions">
              <span className="muted small">{c.abilities.length} abilities</span>
              <button type="button" className="danger" onClick={(e) => remove(c.id, e)}>Delete</button>
            </div>
          </Link>
        ))}
        {characters.length === 0 && !creating && <p className="muted">No heroes yet. Forge your first.</p>}
      </div>
    </div>
  );
}
