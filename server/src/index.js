import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db/index.js';
import { seedWorld } from './db/seed.js';
import { seedSettlements } from './db/seed_settlements.js';
import { seedContinents } from './db/seed_continents.js';
import { seedMonstersExtra } from './db/seed_monsters_extra.js';
import { seedQuests } from './db/seed_quests.js';
import { seedClan } from './db/seed_clan.js';
import { seedNpcs } from './services/npcs.js';
import characterRoutes from './routes/characters.js';
import worldRoutes from './routes/world.js';
import battleRoutes from './routes/battles.js';
import partyRoutes from './routes/party.js';
import dialogueRoutes from './routes/dialogue.js';
import travelRoutes from './routes/travel.js';
import upgradeRoutes from './routes/upgrades.js';
import resurrectionRoutes from './routes/resurrections.js';
import saveRoutes from './routes/saves.js';
import itemRoutes from './routes/items.js';
import settlementRoutes from './routes/settlements.js';
import survivalRoutes from './routes/survival.js';
import tradeRoutes from './routes/trade.js';
import continentRoutes from './routes/continents.js';
import questRoutes from './routes/quests.js';
import campaignRoutes from './routes/campaign.js';
import clanRoutes from './routes/clan.js';
import shipRoutes from './routes/ship.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/characters', characterRoutes);
  app.use('/api/world', worldRoutes);
  app.use('/api/battles', battleRoutes);
  app.use('/api/party', partyRoutes);
  app.use('/api/dialogue', dialogueRoutes);
  app.use('/api/travel', travelRoutes);
  app.use('/api/upgrades', upgradeRoutes);
  app.use('/api/resurrections', resurrectionRoutes);
  app.use('/api/saves', saveRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/settlements', settlementRoutes);
  app.use('/api/survival', survivalRoutes);
  app.use('/api/trade', tradeRoutes);
  app.use('/api/continents', continentRoutes);
  app.use('/api/quests', questRoutes);
  app.use('/api/campaign', campaignRoutes);
  app.use('/api/clan', clanRoutes);
  app.use('/api/ship', shipRoutes);

  // Serve the built SPA when present (production / work-host preview).
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  app.use(express.static(clientDist, { index: false }));
  // index.html must never be cached so a fresh build's asset hashes are picked up.
  app.get(/^\/(?!api).*/, (req, res, next) => {
    res.sendFile(path.join(clientDist, 'index.html'),
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
      (err) => (err ? next() : undefined));
  });

  app.use((req, res) => res.status(404).json({ error: 'Не найдено' }));
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });
  return app;
}

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  getDb();
  seedWorld();
  seedNpcs();
  seedSettlements();
  seedContinents();
  seedMonstersExtra();
  seedQuests();
  seedClan();
  const port = Number(process.env.PORT || 3001);
  createApp().listen(port, () => console.log(`Grimhollow server listening on http://localhost:${port}`));
}
