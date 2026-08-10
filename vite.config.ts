import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Vitest runs in Node; the Cloudflare environment plugin is only needed for dev/build.
  plugins: [react(), ...(mode === 'test' ? [] : [cloudflare()])],
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5173 },
}));
