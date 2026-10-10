import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { installUnlock, bindUiSounds, playMusic, resolveContext, setVolumes } from './audio.js';
import { loadPrefs, subscribePrefs } from './prefs.js';
import Atmosphere from './Atmosphere.jsx';
import CharactersPage from './pages/Characters.jsx';
import CharacterSheetPage from './pages/CharacterSheet.jsx';
import WorldPage from './pages/World.jsx';
import LocationPage from './pages/Location.jsx';
import BattlePage from './pages/Battle.jsx';
import PartyPage from './pages/Party.jsx';
import RecruitPage from './pages/Recruit.jsx';
import TravelPage from './pages/Travel.jsx';
import UpgradesPage from './pages/Upgrades.jsx';
import ShipyardPage from './pages/Shipyard.jsx';
import VoyagePage from './pages/Voyage.jsx';
import SeaBattlePage from './pages/SeaBattle.jsx';
import PapersPage from './pages/Papers.jsx';
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
import CodexPage from './pages/Codex.jsx';
import { api } from './api.js';

// The old text bar (Меню · Герои · Мир · Лор · Настройки) is gone. What is left is
// a small icon strip in the corner: the Codex («Дневник») holds the lore, the
// world map, the settings and the credits in one book.
function Nav() {
  const { pathname } = useLocation();
  if (pathname === '/') return null; // the title screen is full-viewport
  return (
    <nav className="nav nav-compact">
      <NavLink to="/codex" className="nav-ico" title="Дневник">
        <span aria-hidden="true">☰</span> Дневник
      </NavLink>
      <NavLink to="/settings" className="nav-ico" title="Настройки">
        <span aria-hidden="true">⚙</span> Настройки
      </NavLink>
      <NavLink to="/" end className="nav-ico" title="В главное меню">
        <span aria-hidden="true">☠</span> В меню
      </NavLink>
      <span className="muted small build-id" title="версия сборки">
        сборка {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}
      </span>
    </nav>
  );
}

// Route plus the location/settlement a screen hints at decide the music context.
// Pages call `hintScene({ location | settlement | type })` after they load their
// data, so the map screen and a place's own screen can differ.
function useAudioContext() {
  const { pathname } = useLocation();
  const [hint, setHint] = useState(null);

  useEffect(() => {
    setVolumes(loadPrefs());
    installUnlock();
    const off = bindUiSounds();
    const unsubscribe = subscribePrefs(setVolumes);
    return () => { off(); unsubscribe(); };
  }, []);

  useEffect(() => {
    const onHint = (e) => setHint(e.detail || null);
    window.addEventListener('grimhollow:scene', onHint);
    return () => window.removeEventListener('grimhollow:scene', onHint);
  }, []);

  useEffect(() => { setHint(null); }, [pathname]);

  useEffect(() => {
    playMusic(resolveContext({ pathname, location: hint && hint.location, settlement: hint && hint.settlement }));
  }, [pathname, hint]);

  // The atmosphere tone follows the same scene hint as the music, so a battle
  // glows red and the sea turns cold blue without every page wiring it by hand.
  return resolveTone(pathname, hint);
}

// Battle routes run hot; a place/port runs by its biome/type; everything else
// keeps the default ember.
function resolveTone(pathname, hint) {
  if (/^\/(battles|sea)\//.test(pathname)) return 'ember';
  const biome = hint && hint.location && hint.location.biome;
  if (biome === 'coast' || biome === 'marsh' || (hint && hint.settlement && hint.settlement.kind === 'port')) return 'sea';
  if (biome === 'bonefield' || biome === 'forest') return 'cold';
  return 'ember';
}

export default function App() {
  const { pathname } = useLocation();
  const tone = useAudioContext();
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
      <main className={pathname === '/' ? 'menu-host' : 'container screen-atmos'}>
        {pathname !== '/' && <Atmosphere tone={tone} />}
        <Routes>
          <Route path="/" element={<MainMenuPage characters={menu.characters} saves={menu.saves} onRefresh={refreshMenu} />} />
          <Route path="/creators" element={<CreatorsPage />} />
          <Route path="/lore" element={<LorePage />} />
          <Route path="/lore/:key" element={<LorePage />} />
          <Route path="/codex" element={<CodexPage />} />
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
          <Route path="/shipyard/:characterId" element={<ShipyardPage />} />
          <Route path="/voyage/:characterId" element={<VoyagePage />} />
          <Route path="/sea/:id" element={<SeaBattlePage />} />
          <Route path="/papers/:characterId" element={<PapersPage />} />
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
