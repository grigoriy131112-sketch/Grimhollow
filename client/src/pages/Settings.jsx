import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { DEFAULT_PREFS, applyPrefs, loadPrefs, savePrefs } from '../prefs.js';
import { playSfx } from '../audio.js';

const formatDate = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) : '');

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [characters, setCharacters] = useState([]);
  const [saves, setSaves] = useState([]);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const leaderId = params.get('characterId') || '';

  // Apply preferences immediately, then persist them.
  useEffect(() => { applyPrefs(prefs); }, [prefs]);

  useEffect(() => {
    api.listCharacters().then(setCharacters).catch((e) => setError(e.message));
  }, []);

  const loadSaves = (id) => {
    if (!id) { setSaves([]); return; }
    api.listSaves(id).then(setSaves).catch((e) => setError(e.message));
  };
  useEffect(() => { loadSaves(leaderId); }, [leaderId]);

  const flash = (msg) => { setNotice(msg); setError(''); };
  const selectLeader = (id) => setParams(id ? { characterId: id } : {});

  const updatePref = (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
  };

  const createSlot = async (e) => {
    e.preventDefault();
    if (!leaderId) { setError('Сначала выберите героя.'); return; }
    setBusy(true);
    try {
      await api.createSave(leaderId, saveName);
      setSaveName('');
      loadSaves(leaderId);
      flash('Сохранение создано.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const loadSlot = async (save) => {
    if (!confirm(`Загрузить сохранение «${save.name}»? Текущее состояние героя будет заменено.`)) return;
    setBusy(true);
    try {
      await api.loadSave(save.id);
      flash('Герой восстановлен из сохранения.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const removeSlot = async (save) => {
    if (!confirm(`Удалить сохранение «${save.name}»?`)) return;
    setBusy(true);
    try {
      await api.deleteSave(save.id);
      loadSaves(leaderId);
      flash('Сохранение удалено.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const exportSlot = async (save) => {
    try {
      const data = await api.exportSave(save.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grimhollow-${save.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flash('Сохранение выгружено в файл.');
    } catch (err) { setError(err.message); }
  };

  const selected = characters.find((c) => String(c.id) === leaderId);

  return (
    <div>
      <Link to="/characters" className="muted">← Герои</Link>
      <div className="page-head">
        <h1>Настройки</h1>
        <span className="badge">игра и сохранения</span>
      </div>
      {error && <div className="error">{error}</div>}
      {notice && <div className="card" style={{ borderColor: 'var(--gold)' }}>{notice}</div>}

      <div className="card">
        <h2>Звук и интерфейс</h2>
        <p className="muted small">Настройки хранятся в этом браузере и не уходят на сервер.</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <input
            type="checkbox"
            style={{ width: 'auto', margin: 0 }}
            checked={prefs.sfx}
            onChange={(e) => updatePref('sfx', e.target.checked)}
          />
          Звуковые эффекты
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <input
            type="checkbox"
            style={{ width: 'auto', margin: 0 }}
            checked={prefs.music}
            onChange={(e) => updatePref('music', e.target.checked)}
          />
          Фоновая музыка
        </label>
        <label className="slider-row">
          Громкость музыки
          <input
            type="range" min="0" max="1" step="0.05"
            value={prefs.musicVolume}
            onChange={(e) => updatePref('musicVolume', Number(e.target.value))}
            onInput={() => playSfx('ui_click')}
          />
        </label>
        <label className="slider-row">
          Громкость эффектов
          <input
            type="range" min="0" max="1" step="0.05"
            value={prefs.sfxVolume}
            onChange={(e) => updatePref('sfxVolume', Number(e.target.value))}
            onInput={() => playSfx('ui_click')}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <input
            type="checkbox"
            style={{ width: 'auto', margin: 0 }}
            checked={prefs.animations}
            onChange={(e) => updatePref('animations', e.target.checked)}
          />
          Анимации боя
        </label>
        <label>Масштаб интерфейса
          <select value={prefs.uiScale} onChange={(e) => updatePref('uiScale', Number(e.target.value))}>
            <option value={0.9}>Мелкий</option>
            <option value={1}>Обычный</option>
            <option value={1.15}>Крупный</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h2>Сохранения</h2>
        <p className="muted small">
          Слот замораживает состояние героя: здоровье, ману, выносливость, золото, опыт,
          уровень, место, отряд, предметы и улучшения. Игра сохраняется сама — слоты нужны,
          чтобы вернуться к прежнему моменту.
        </p>

        <label>Герой
          <select value={leaderId} onChange={(e) => selectLeader(e.target.value)}>
            <option value="">— выберите героя —</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · ур. {c.level} · {c.className}{c.fate === 'dead' ? ' · пал' : ''}
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <form onSubmit={createSlot} className="grid2" style={{ alignItems: 'end' }}>
            <label>Имя сохранения
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={`напр. Перед походом в часовню`}
              />
            </label>
            <button type="submit" disabled={busy}>Создать сохранение</button>
          </form>
        )}
        {!selected && characters.length > 0 && (
          <p className="muted small">Выберите героя, чтобы увидеть его сохранения.</p>
        )}
        {characters.length === 0 && <p className="muted">Героев пока нет — создайте первого на странице «Герои».</p>}

        {selected && (
          <div className="cards" style={{ marginTop: '1rem' }}>
            {saves.map((s) => (
              <div className="card" key={s.id}>
                <div className="hero-top">
                  <h3>{s.name}</h3>
                  <span className="badge">{formatDate(s.updatedAt)}</span>
                </div>
                <div className="hero-actions">
                  <button type="button" disabled={busy} onClick={() => loadSlot(s)}>Загрузить</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => exportSlot(s)}>Скачать</button>
                  <button type="button" className="danger" disabled={busy} onClick={() => removeSlot(s)}>Удалить</button>
                </div>
              </div>
            ))}
            {saves.length === 0 && <p className="muted">Сохранений пока нет.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
