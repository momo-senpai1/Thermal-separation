import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/ — the deploy workflow passes it in VITE_BASE.
const base = process.env.VITE_BASE ? `${process.env.VITE_BASE.replace(/\/$/, '')}/` : '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    // the lazy-loaded analysis chunk (Tremor + Recharts) is intentionally large
    chunkSizeWarningLimit: 1000,
  },
});
