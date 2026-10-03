import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db/index.js';
import { seedWorld } from './db/seed.js';
import characterRoutes from './routes/characters.js';
import worldRoutes from './routes/world.js';
import battleRoutes from './routes/battles.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/characters', characterRoutes);
  app.use('/api/world', worldRoutes);
  app.use('/api/battles', battleRoutes);

  // Serve the built SPA when present (production / work-host preview).
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  app.use(express.static(clientDist, { index: false }));
  // index.html must never be cached so a fresh build's asset hashes are picked up.
  app.get(/^\/(?!api).*/, (req, res, next) => {
    res.sendFile(path.join(clientDist, 'index.html'),
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
      (err) => (err ? next() : undefined));
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });
  return app;
}

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  getDb();
  seedWorld();
  const port = Number(process.env.PORT || 3001);
  createApp().listen(port, () => console.log(`Grimhollow server listening on http://localhost:${port}`));
}
