import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Development keeps the existing local routes. The production artifact is mounted
  // below /play by Firebase Hosting.
  base: command === 'build' ? '/play/' : '/'
}));
