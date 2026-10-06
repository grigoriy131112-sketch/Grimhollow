import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import CharactersPage from './pages/Characters.jsx';
import CharacterSheetPage from './pages/CharacterSheet.jsx';
import WorldPage from './pages/World.jsx';
import LocationPage from './pages/Location.jsx';
import BattlePage from './pages/Battle.jsx';
import PartyPage from './pages/Party.jsx';
import RecruitPage from './pages/Recruit.jsx';
import TravelPage from './pages/Travel.jsx';
import UpgradesPage from './pages/Upgrades.jsx';
import ResurrectionPage from './pages/Resurrection.jsx';
import SettingsPage from './pages/Settings.jsx';
import InventoryPage from './pages/Inventory.jsx';
import SettlementPage from './pages/Settlement.jsx';
import TradePage from './pages/Trade.jsx';
import QuestsPage from './pages/Quests.jsx';
import CampaignPage from './pages/Campaign.jsx';
import ClanPage from './pages/Clan.jsx';
import MainMenuPage from './pages/MainMenu.jsx';
import CreatorsPage from './pages/Creators.jsx';
import LorePage from './pages/Lore.jsx';
import { api } from './api.js';

function Nav() {
  const { pathname } = useLocation();
  if (pathname === '/') return null; // the title screen is full-viewport
  return (
    <nav className="nav">
      <div className="brand">☠ Grimhollow</div>
      <div className="links">
        <NavLink to="/" end>Меню</NavLink>
        <NavLink to="/characters">Герои</NavLink>
        <NavLink to="/world">Мир</NavLink>
        <NavLink to="/lore">Лор</NavLink>
        <NavLink to="/settings">Настройки</NavLink>
        <span className="muted small" style={{ marginLeft: 'auto', opacity: 0.6 }} title="версия сборки">
          сборка {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}
        </span>
      </div>
    </nav>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const [menu, setMenu] = useState({ characters: [], saves: [] });

  const refreshMenu = useCallback(
    () => Promise.all([api.listCharacters(), api.listAllSaves()])
      .then(([characters, saves]) => setMenu({ characters, saves }))
      .catch(() => { /* menu still renders without the lists */ }),
    [],
  );
  // Reload the lists every time the title screen is shown, so a fresh hero or
  // save is there when the player comes back.
  useEffect(() => { if (pathname === '/') refreshMenu(); }, [pathname, refreshMenu]);

  return (
    <div className="app">
      <Nav />
      <main className={pathname === '/' ? 'menu-host' : 'container'}>
        <Routes>
          <Route path="/" element={<MainMenuPage characters={menu.characters} saves={menu.saves} onRefresh={refreshMenu} />} />
          <Route path="/creators" element={<CreatorsPage />} />
          <Route path="/lore" element={<LorePage />} />
          <Route path="/lore/:key" element={<LorePage />} />
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
          <Route path="/party/:leaderId" element={<PartyPage />} />
          <Route path="/party/:leaderId/recruit" element={<RecruitPage />} />
          <Route path="/world" element={<WorldPage />} />
          <Route path="/world/atlas" element={<WorldPage />} />
          <Route path="/world/continents/:continentName" element={<WorldPage />} />
          <Route path="/world/locations/:id" element={<LocationPage />} />
          <Route path="/travel/:id" element={<TravelPage />} />
          <Route path="/upgrades/:leaderId" element={<UpgradesPage />} />
          <Route path="/resurrection/:leaderId" element={<ResurrectionPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/inventory/:id" element={<InventoryPage />} />
          <Route path="/settlements/:id" element={<SettlementPage />} />
          <Route path="/trade/:buildingId" element={<TradePage />} />
          <Route path="/quests/:characterId" element={<QuestsPage />} />
          <Route path="/campaign/:characterId" element={<CampaignPage />} />
          <Route path="/clan/:leaderId" element={<ClanPage />} />
          <Route path="/battles/:id" element={<BattlePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
