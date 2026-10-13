import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Preserve watched files when a build produces the same bytes. */
export class AssetOutput {
  async write(path, content) {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    try {
      if ((await readFile(path)).equals(bytes)) return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await mkdir(dirname(path instanceof URL ? fileURLToPath(path) : path), { recursive: true });
    await writeFile(path, bytes);
  }
}
