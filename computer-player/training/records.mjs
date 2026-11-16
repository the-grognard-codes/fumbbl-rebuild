import { mkdir, writeFile, rename } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}
export class Shards {
  constructor(directory, prefix, limit = 8 * 1048576, cap = Infinity) { Object.assign(this, { directory, prefix, limit, cap, bytes: 0, total: 0, pending: [], index: [] }); }
  async add(record) {
    const line = `${JSON.stringify(record)}\n`, size = Buffer.byteLength(line);
    if (size > this.limit || this.total + size > this.cap) return false;
    if (this.bytes + size > this.limit) await this.flush();
    this.pending.push(line); this.bytes += size; this.total += size;
    return true;
  }
  async flush() {
    if (!this.pending.length) return;
    await mkdir(this.directory, { recursive: true });
    const file = `${this.prefix}-${String(this.index.length).padStart(5, '0')}.jsonl.gz`;
    const compressed = gzipSync(this.pending.join(''));
    await writeFile(join(this.directory, `${file}.tmp`), compressed);
    await rename(join(this.directory, `${file}.tmp`), join(this.directory, file));
    this.index.push({ file, rows: this.pending.length, bytes: this.bytes, compressedBytes: compressed.length, sha256: hash(compressed) });
    this.pending = []; this.bytes = 0;
    await atomicJson(join(this.directory, `${this.prefix}-index.json`), { schemaVersion: 1, shards: this.index });
  }
}
