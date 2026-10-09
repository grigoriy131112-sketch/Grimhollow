import { NavLink } from 'react-router-dom';

// One strip of tabs across every per-hero screen (Wave W-HERO-TABS), so the
// scattered per-page buttons become a single spine: Статистика · Снаряжение ·
// Отряд · Квесты · Лагерь · Клан. The Codex («Дневник») is the one global link.
const TABS = [
  { key: 'sheet', label: 'Статистика', to: (id) => `/characters/${id}` },
  { key: 'gear', label: 'Снаряжение', to: (id) => `/inventory/${id}` },
  { key: 'party', label: 'Отряд', to: (id) => `/party/${id}` },
  { key: 'quests', label: 'Квесты', to: (id) => `/quests/${id}` },
  { key: 'camp', label: 'Лагерь', to: (id) => `/upgrades/${id}` },
  { key: 'clan', label: 'Клан', to: (id) => `/clan/${id}` },
];

export default function HeroTabs({ characterId, active }) {
  if (characterId == null) return null;
  return (
    <nav className="hero-tabs" aria-label="Герой">
      {TABS.map((t) => (
        <NavLink
          key={t.key}
          to={t.to(characterId)}
          className={`hero-tab${active === t.key ? ' active' : ''}`}
        >
          {t.label}
        </NavLink>
      ))}
      <NavLink to="/codex" className="hero-tab hero-tab-codex" title="Дневник героя">📖 Дневник</NavLink>
    </nav>
  );
}
