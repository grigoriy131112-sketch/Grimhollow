import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SceneBackdrop from '../scenes.jsx';
import Atmosphere from '../Atmosphere.jsx';
import { api } from '../api.js';

// The title screen (Wave W-MENU, restyled; W-ATMOSPHERE). A full-viewport menu
// like a classic RPG: a big letter-spaced title over a layered, breathing scene,
// a column of buttons, and the saves as a slide-up sheet.

function SavesSheet({ saves, busy, onClose, onResume, onDelete }) {
  return (
    <div className="menu-sheet open" role="dialog" aria-label="Сохранённые игры">
      <div className="sheet-inner">
        <h2>Сохранённые игры</h2>
        {saves.length === 0 && (
          <p className="muted">Пока пусто. Начните новую игру — сохранение появится здесь.</p>
        )}
        <ul className="save-list">
          {saves.map((s) => (
            <li className="save-row" key={s.id}>
              <div className="save-info">
                <span className="save-name">{s.name}</span>
                <span className="save-meta muted small">
                  {s.characterName} · ур. {s.level} · {String(s.updatedAt).replace('T', ' ').slice(0, 16)}
                </span>
              </div>
              <div className="save-acts">
                <button className="btn small" disabled={busy} onClick={() => onResume(s.id)}>Продолжить</button>
                <button className="btn small danger" disabled={busy} onClick={() => onDelete(s.id)}>Удалить</button>
              </div>
            </li>
          ))}
        </ul>
        <div className="sheet-acts">
          <button className="btn ghost" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

export default function MainMenuPage({ characters = [], saves = [], onRefresh }) {
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const last = characters[0];

  const resume = async (saveId) => {
    setBusy(true);
    try {
      const result = await api.loadSave(saveId);
      navigate(`/characters/${result.characterId}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (saveId) => {
    if (!confirm('Стереть это сохранение?')) return;
    setBusy(true);
    try {
      await api.deleteSave(saveId);
      await onRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="menu">
      <div className="menu-bg" aria-hidden="true">
        <SceneBackdrop scene="crossroads" biome="waste" danger={1} name="Гримхоллоу" />
      </div>
      <Atmosphere tone="ember" intensity={1.15} />

      <div className="menu-inner">
        <div className="menu-crest" aria-hidden="true">
          <span className="menu-crest-line" />
          <span className="menu-crest-mark">✦</span>
          <span className="menu-crest-line" />
        </div>
        <h1 className="menu-title">ГРИМХОЛЛОУ</h1>
        <div className="menu-sub">Мрачная низина · мир, у которого отняли память</div>

        <div className="menu-btns">
          {last && (
            <button className="menu-btn primary" onClick={() => navigate(`/characters/${last.id}`)}>
              <span className="menu-btn-glyph" aria-hidden="true">➤</span>
              Продолжить
              <span className="menu-btn-tail muted small">ур. {last.level} · {last.className || last.class}</span>
            </button>
          )}
          <button className="menu-btn" onClick={() => navigate('/characters')}>
            <span className="menu-btn-glyph" aria-hidden="true">✧</span>Новая игра
          </button>
          <button className="menu-btn" onClick={() => setSheet(true)}>
            <span className="menu-btn-glyph" aria-hidden="true">❐</span>Сохранённые игры
          </button>
          <button className="menu-btn" onClick={() => navigate('/settings')}>
            <span className="menu-btn-glyph" aria-hidden="true">⚙</span>Настройки
          </button>
          <button className="menu-btn" onClick={() => navigate('/creators')}>
            <span className="menu-btn-glyph" aria-hidden="true">✥</span>Создатели
          </button>
          <button className="menu-btn" onClick={() => navigate('/lore')}>
            <span className="menu-btn-glyph" aria-hidden="true">◈</span>Лор
          </button>
        </div>

        <div className="menu-foot muted small">
          <span className="menu-foot-dot" aria-hidden="true" />
          {characters.length} гер. · {saves.length} сохр.
          <span className="menu-foot-dot" aria-hidden="true" />
        </div>
      </div>

      {sheet && (
        <SavesSheet
          saves={saves}
          busy={busy}
          onClose={() => setSheet(false)}
          onResume={resume}
          onDelete={remove}
        />
      )}
    </section>
  );
}
