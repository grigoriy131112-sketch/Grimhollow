// Bootstrap for the fully static (GitHub Pages) build of Grimhollow.
//
// It recreates, in the browser, everything the Node server does at boot:
//   1. install a `process` global and register schema.sql into the fs shim,
//   2. preload sql.js and the persisted database image (IndexedDB),
//   3. build the Express router from the real server modules,
//   4. run the world seeds once,
//   5. intercept fetch('/api/...') and answer from the in-browser router,
//   6. render the SPA (HashRouter, so no server-side route fallback is needed).
import '../shims/process.js';
import { registerFile } from '../shims/node-fs.js';
import { preloadSqlite } from '../shims/node-sqlite.js';
import { dispatch } from '../shims/express.js';
import schemaSql from '../../../server/src/db/schema.sql?raw';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import '../../src/styles.css';

registerFile('schema.sql', schemaSql);

async function buildApp() {
  await preloadSqlite();

  const { getDb } = await import('../../../server/src/db/index.js');
  const { createApp } = await import('../../../server/src/index.js');
  const { seedWorld } = await import('../../../server/src/db/seed.js');
  const { seedSettlements } = await import('../../../server/src/db/seed_settlements.js');
  const { seedContinents } = await import('../../../server/src/db/seed_continents.js');
  const { seedMonstersExtra } = await import('../../../server/src/db/seed_monsters_extra.js');
  const { seedQuests } = await import('../../../server/src/db/seed_quests.js');
  const { seedClan } = await import('../../../server/src/db/seed_clan.js');
  const { seedNpcs } = await import('../../../server/src/services/npcs.js');

  getDb();
  // Seeds are idempotent: on a reload with a persisted image they skip.
  for (const seed of [seedWorld, seedNpcs, seedSettlements, seedContinents, seedMonstersExtra, seedQuests, seedClan]) {
    try { seed(); } catch (err) { console.error('[grimhollow] seed failed', err); }
  }

  return createApp();
}

function installFetchBridge(app) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    let parsed;
    try { parsed = new URL(url, location.origin); } catch { return originalFetch(input, init); }
    if (!parsed.pathname.startsWith('/api')) return originalFetch(input, init);

    let body;
    if (init && typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { body = undefined; }
    }
    let response;
    try {
      response = await dispatch(app, init?.method || 'GET', parsed.pathname + parsed.search, body);
    } catch (err) {
      response = { status: 500, body: { error: err?.message || 'Internal error' } };
    }
    if (!response) response = { status: 404, body: { error: 'Не найдено' } };
    // A Response with a null-body status (204/205/304) must not carry a body,
    // or the constructor throws. api.js returns null for 204 without parsing.
    const nullBody = response.status === 204 || response.status === 205 || response.status === 304;
    return new Response(nullBody ? null : JSON.stringify(response.body ?? null), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

async function start() {
  let bootError = null;
  try {
    const app = await buildApp();
    installFetchBridge(app);
  } catch (err) {
    bootError = err;
    console.error('[grimhollow] static bootstrap failed', err);
  }
  const root = document.getElementById('root');
  if (bootError) {
    root.innerHTML =
      `<pre style="color:#f88;background:#1a1014;padding:16px;white-space:pre-wrap;font:13px/1.5 monospace">` +
      `Не удалось запустить игру в браузере:\n${bootError && bootError.stack ? bootError.stack : bootError}</pre>`;
    return;
  }
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  );
}

start();
