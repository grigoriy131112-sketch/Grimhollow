import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const STAT_RU = { hp: 'здоровье', mana: 'мана', stamina: 'выносливость', attack: 'атака', defense: 'защита', accuracy: 'точность', evasion: 'уклонение', speed: 'скорость' };

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
    if (!confirm('Оставить этого героя навсегда?')) return;
    await api.deleteCharacter(id);
    load();
  };

  return (
    <div>
      <div className="page-head">
        <h1>Ваши герои</h1>
        <button type="button" onClick={() => setCreating((v) => !v)}>{creating ? 'Отмена' : '+ Новый герой'}</button>
      </div>
      {error && <div className="error">{error}</div>}

      {creating && options && (
        <form className="card" onSubmit={submit}>
          <h2>Создать героя</h2>
          <div className="grid2">
            <label>Имя
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="напр. Каэль Вейн" />
            </label>
            <label>Класс
              <select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })}>
                {options.classes.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          </div>
          {selectedClass && (
            <div className="card" style={{ background: '#14101a' }}>
              <p className="muted">{selectedClass.blurb}</p>
              <p className="small"><b>Начальные характеристики:</b> {Object.entries(selectedClass.base).map(([k, v]) => `${STAT_RU[k] || k} ${v}`).join(' · ')}</p>
              <p className="small"><b>За уровень:</b> {selectedClass.growthText}</p>
              <p className="small muted">{selectedClass.abilities.filter((a) => a.unlockLevel === 1).map((a) => `${a.icon} ${a.name}`).join(' · ')} — открываются на 1 уровне.</p>
            </div>
          )}
          <button type="submit">Создать героя</button>
        </form>
      )}

      <div className="cards">
        {characters.map((c) => (
          <Link className="card hero-card" key={c.id} to={`/characters/${c.id}`}>
            <div className="hero-top">
              <h3>{c.name}</h3>
              <span className="badge">Ур. {c.level}</span>
            </div>
            <p className="muted">{c.className}</p>
            <div className="stat-row">
              <span>❤️ {c.hp}/{c.stats.maxHp}</span>
              <span>🔮 {c.mana}/{c.stats.maxMana}</span>
              <span>⚔️ {c.stats.attack}</span>
              <span>💰 {c.gold}</span>
            </div>
            <div className="hero-actions">
              <span className="muted small">{c.abilities.length} способностей</span>
              <button type="button" className="danger" onClick={(e) => remove(c.id, e)}>Удалить</button>
            </div>
          </Link>
        ))}
        {characters.length === 0 && !creating && <p className="muted">Героев пока нет. Создайте первого.</p>}
      </div>
    </div>
  );
}
