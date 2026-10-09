import { useSearchParams } from 'react-router-dom';
import LorePage from './Lore.jsx';
import WorldPage from './World.jsx';
import SettingsPage from './Settings.jsx';
import CreatorsPage from './Creators.jsx';

// The Codex — the hero's journal, a book with four sections (Wave W-CODEX/W-SHELL).
// It opens from the small nav strip and from a bookmark in the character's
// inventory, and it reuses the existing pages so there is one implementation of
// each section and never a second copy to drift.

const SECTIONS = [
  { key: 'lore', label: 'Лор', page: LorePage },
  { key: 'map', label: 'Карта мира', page: WorldPage },
  { key: 'settings', label: 'Настройки', page: SettingsPage },
  { key: 'creators', label: 'Создатели', page: CreatorsPage },
];

const TAB_KEY = 'grimhollow.codex.tab';
const isSection = (key) => SECTIONS.some((s) => s.key === key);

export default function CodexPage() {
  const [params, setParams] = useSearchParams();
  // A nested section (Настройки) writes its own query params, which would drop
  // ?tab and bounce the reader to the first page. Remember the open section so a
  // round-trip through a section keeps the reader where they were.
  const fromUrl = params.get('tab');
  const remembered = sessionStorage.getItem(TAB_KEY);
  const active = isSection(fromUrl) ? fromUrl : isSection(remembered) ? remembered : SECTIONS[0].key;
  const Section = SECTIONS.find((s) => s.key === active).page;

  const openTab = (key) => {
    sessionStorage.setItem(TAB_KEY, key);
    // Merge, so a section's own params (e.g. Настройки's characterId) survive.
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', key);
      return next;
    }, { replace: true });
  };

  if (active !== fromUrl) sessionStorage.setItem(TAB_KEY, active);

  return (
    <div className="codex">
      <nav className="codex-tabs" aria-label="Разделы дневника">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`codex-tab ${active === s.key ? 'active' : ''}`}
            onClick={() => openTab(s.key)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="codex-page">
        <Section />
      </div>
    </div>
  );
}
