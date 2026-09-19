import { defineConfig } from 'vite';

export default defineConfig({ define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { outDir: 'dist-play', lib: {
  entry: 'src/play-entry.tsx', formats: ['es'], fileName: () => 'game.js', cssFileName: 'game'
} } });
