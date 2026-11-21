import { mkdir, writeFile, rename, unlink, open } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx');
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await file.close();
    await rename(temporary, path);
  } finally {
    await file.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
export class Shards {
  constructor(directory, prefix, limit = 8 * 1048576, cap = Infinity) { Object.assign(this, { directory, prefix, limit, cap, bytes: 0, total: 0, pending: [], index: [], droppedRows: 0 }); }
  async add(record) {
    const line = `${JSON.stringify(record)}\n`, size = Buffer.byteLength(line);
    if (size > this.limit || this.total + size > this.cap) { this.droppedRows++; return false; }
    if (this.bytes + size > this.limit) await this.flush();
    this.pending.push(line); this.bytes += size; this.total += size;
    return true;
  }
  async flush() {
    await mkdir(this.directory, { recursive: true });
    if (!this.pending.length) { await this.saveIndex(); return; }
    const file = `${this.prefix}-${String(this.index.length).padStart(5, '0')}.jsonl.gz`;
    const compressed = gzipSync(this.pending.join(''));
    await writeFile(join(this.directory, `${file}.tmp`), compressed);
    await rename(join(this.directory, `${file}.tmp`), join(this.directory, file));
    this.index.push({ file, rows: this.pending.length, bytes: this.bytes, compressedBytes: compressed.length, sha256: hash(compressed) });
    this.pending = []; this.bytes = 0;
    await this.saveIndex();
  }
  saveIndex() { return atomicJson(join(this.directory, `${this.prefix}-index.json`), { schemaVersion: 1, shards: this.index, droppedRows: this.droppedRows,
    retainedBytes: this.total, capBytes: Number.isFinite(this.cap) ? this.cap : null }); }
}
