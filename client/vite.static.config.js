import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shims = path.resolve(here, 'static/shims');
const staticRoot = path.resolve(here, 'static');

// The server is written for Node: it imports `express`, `cors`, `node:sqlite`,
// `node:fs`, `node:path`, `node:url`, and reads `process`. To reuse that code
// unchanged in the browser, rewrite those bare/node specifiers to browser shims.
const shimMap = {
  express: path.join(shims, 'express.js'),
  cors: path.join(shims, 'cors.js'),
  'node:sqlite': path.join(shims, 'node-sqlite.js'),
  'node:fs': path.join(shims, 'node-fs.js'),
  'node:path': path.join(shims, 'node-path.js'),
  'node:url': path.join(shims, 'node-url.js'),
  process: path.join(shims, 'process.js'),
};

function serverShims() {
  return {
    name: 'grimhollow-server-shims',
    enforce: 'pre',
    resolveId(source) {
      if (Object.prototype.hasOwnProperty.call(shimMap, source)) return shimMap[source];
      return null;
    },
  };
}

export default defineConfig({
  root: staticRoot,
  base: './',
  plugins: [serverShims(), react()],
  publicDir: path.resolve(here, 'public'),
  server: { allowedHosts: true },
  preview: { allowedHosts: true, port: 12001 },
  define: {
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  resolve: {
    alias: { '@server': path.resolve(here, '../server/src') },
  },
  build: {
    outDir: path.resolve(here, 'dist-static'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(staticRoot, 'index.html'),
    },
  },
});
