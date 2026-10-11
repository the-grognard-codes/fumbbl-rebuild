import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';

/** Parallel local shards must never write to the same Vite dependency cache. */
export function createServer(options) {
  const cacheDirectory = process.env.FFB_BROWSER_TEST_CACHE_DIR;
  return createViteServer(cacheDirectory ? { ...options, cacheDir: resolve(cacheDirectory) } : options);
}
