import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import CharactersPage from './pages/Characters.jsx';
import CharacterSheetPage from './pages/CharacterSheet.jsx';
import WorldPage from './pages/World.jsx';
import LocationPage from './pages/Location.jsx';
import BattlePage from './pages/Battle.jsx';

function Nav() {
  return (
    <nav className="nav">
      <div className="brand">☠ Grimhollow</div>
      <div className="links">
        <NavLink to="/characters">Heroes</NavLink>
        <NavLink to="/world">World</NavLink>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <div className="app">
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
          <Route path="/world" element={<WorldPage />} />
          <Route path="/world/locations/:id" element={<LocationPage />} />
          <Route path="/battles/:id" element={<BattlePage />} />
          <Route path="*" element={<Navigate to="/characters" replace />} />
        </Routes>
      </main>
    </div>
  );
}
