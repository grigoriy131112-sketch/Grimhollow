// The Creators page (Wave W-MENU). Credits for the people and the free
// collections the game is built on. Kept in one place with the art credits.

const CORE = [
  { role: 'Замысел, мир и канон', who: 'Автор Grimhollow' },
  { role: 'Код и сборка', who: 'OpenHands' },
];

const STACK = [
  { name: 'React', note: 'интерфейс' },
  { name: 'Vite', note: 'сборка клиента' },
  { name: 'Express', note: 'сервер' },
  { name: 'SQLite (node:sqlite)', note: 'хранение мира' },
];

const ASSETS = [
  { name: 'game-icons.net', note: 'иконки, CC BY 3.0', href: 'https://game-icons.net/' },
  { name: 'Azgaar Fantasy Map Generator', note: 'основа карты мира, MIT', href: 'https://azgaar.github.io/Fantasy-Map-Generator/' },
  { name: 'Membeth / Wikimedia Commons', note: 'текстура пергамента, CC0', href: 'https://commons.wikimedia.org/wiki/File:Pergament.1.jpg' },
];

export default function CreatorsPage() {
  return (
    <div>
      <div className="page-head">
        <h1>Создатели</h1>
        <span className="badge">благодарности</span>
      </div>

      <div className="card">
        <h2>Кто сделал игру</h2>
        <ul className="plain-list">
          {CORE.map((c) => (
            <li key={c.role}><b>{c.who}</b> — {c.role}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>На чём стоит</h2>
        <ul className="plain-list">
          {STACK.map((s) => (
            <li key={s.name}><b>{s.name}</b> — {s.note}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Чужой труд и лицензии</h2>
        <p className="muted small">
          Игра собрана на свободных материалах. Полный список по каждому файлу — в
          <code> client/public/art/CREDITS.txt</code>.
        </p>
        <ul className="plain-list">
          {ASSETS.map((a) => (
            <li key={a.name}>
              <a href={a.href} target="_blank" rel="noreferrer noopener">{a.name}</a> — {a.note}
            </li>
          ))}
        </ul>
      </div>

      <p className="muted small">Спасибо всем, кто выкладывает своё под свободными лицензиями.</p>
    </div>
  );
}
