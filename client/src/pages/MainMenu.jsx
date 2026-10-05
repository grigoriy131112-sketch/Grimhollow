import { Link } from 'react-router-dom';

// The start menu (Wave W-MENU): the first page of the game, like the title
// screen of an old RPG. Every entry is a plain link; the saves list on the
// right is the "Сохранённые игры" column and doubles as "continue".

const MENU_ITEMS = [
  { to: '/characters', title: 'Новая игра', blurb: 'Создать героя и начать заново', icon: '⚔️' },
  { to: '/characters', title: 'Герои', blurb: 'Все ваши герои и их судьбы', icon: '👥' },
  { to: '/world', title: 'Мир', blurb: 'Атлас Гримхоула', icon: '🗺️' },
  { to: '/settings', title: 'Настройки', blurb: 'Звук, интерфейс, сохранения', icon: '⚙️' },
  { to: '/creators', title: 'Создатели', blurb: 'Кто сделал эту игру', icon: '✒️' },
  { to: '/lore', title: 'Лор', blurb: 'Мир и сюжет — канон', icon: '📖' },
];

function recentSaveLabel(save) {
  return save.name || `Сохранение #${save.id}`;
}

export default function MainMenuPage({ characters = [], saves = [] }) {
  return (
    <div className="menu-page">
      <header className="menu-hero">
        <div className="menu-mark">☠</div>
        <h1>Гримхоллоу</h1>
        <p className="menu-tagline">Мрачная низина. Мир, у которого отняли память.</p>
      </header>

      <div className="menu-columns">
        <nav className="menu-list">
          {MENU_ITEMS.map((item) => (
            <Link key={item.title} className="menu-item" to={item.to}>
              <span className="menu-item-icon">{item.icon}</span>
              <span className="menu-item-text">
                <span className="menu-item-title">{item.title}</span>
                <span className="menu-item-blurb">{item.blurb}</span>
              </span>
            </Link>
          ))}
        </nav>

        <aside className="menu-saves card">
          <h2>Сохранённые игры</h2>
          {saves.length === 0 && (
            <p className="muted small">Пока пусто. Начните новую игру — герой появится здесь.</p>
          )}
          <ul className="menu-save-list">
            {saves.slice(0, 8).map((s) => (
              <li key={s.id}>
                <Link to={`/characters/${s.characterId}`} className="menu-save">
                  <span className="menu-save-name">{recentSaveLabel(s)}</span>
                  <span className="menu-save-meta">{s.characterName} · ур. {s.level}</span>
                </Link>
              </li>
            ))}
          </ul>
          {characters.length > 0 && (
            <Link className="btn ghost menu-continue" to={`/characters/${characters[0].id}`}>
              ▶ Продолжить за {characters[0].name}
            </Link>
          )}
        </aside>
      </div>

      <p className="menu-foot muted small">
        {characters.length} гер. · {saves.length} сохр.
      </p>
    </div>
  );
}
