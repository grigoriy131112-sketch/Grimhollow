import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: process.env.API_URL || 'http://localhost:3001', changeOrigin: true },
    },
  },
});
