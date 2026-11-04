import { teamColorManifest } from './generated-team-colors.ts';
import { decodeTeamColors, type TeamColors } from './team-colors.ts';

type ImageEntry = typeof teamColorManifest.packs.human.images[number];
type DecodedImage = { entry: ImageEntry; rgba: Uint8Array; indices: Uint8Array };
export const teamColorRamps = teamColorManifest.ramps;

/** Production packs are bounded and hash-bound; no runtime material inference. */
export async function decodeColorPack(roster: 'human' | 'orc', raw: ArrayBuffer): Promise<Map<string, DecodedImage>> {
  const pack = teamColorManifest.packs[roster];
  if (raw.byteLength !== pack.bytes || raw.byteLength > 3_000_000) throw Error('Invalid color pack size');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== pack.sha256) throw Error('Invalid color pack hash');
  const images = new Map<string, DecodedImage>();
  for (const entry of pack.images) {
    const pixels = entry.width * entry.height;
    if (entry.length !== pixels * 5 || entry.offset + entry.length > raw.byteLength) throw Error('Invalid color image bounds');
    const rgba = new Uint8Array(raw, entry.offset, pixels * 4), indices = new Uint8Array(raw, entry.offset + pixels * 4, pixels);
    for (let pixel = 0; pixel < pixels; pixel++) if (indices[pixel] > 32 || !rgba[pixel * 4 + 3] && indices[pixel]) throw Error('Invalid material index');
    images.set(entry.sourceUrl, { entry: entry as ImageEntry, rgba, indices });
  }
  return images;
}

export function recolorTeamImage(image: Pick<DecodedImage, 'rgba' | 'indices'> & { entry?: { kind: string } }, colors: TeamColors): Uint8ClampedArray<ArrayBuffer> {
  decodeTeamColors(colors);
  const ramps = [colors.primary, colors.secondary].flatMap(id => teamColorRamps.find(ramp => ramp.id === id)!.colors);
  const rgb = ramps.map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
  // Broad glossy helmet highlights otherwise swallow the stripe at picker size.
  // Equal-color kits use distinct tonal ranges, interpolated to retain 16 shades.
  if (image.entry?.kind === 'helmet' && colors.primary === colors.secondary) {
    const original = rgb.map(color => [...color]);
    for (let material = 0; material < 2; material++) for (let shade = 0; shade < 16; shade++) {
      const position = material === 0 ? shade * 10 / 15 : 9 + shade * 6 / 15;
      const low = Math.floor(position), high = Math.ceil(position), mix = position - low;
      rgb[material * 16 + shade] = original[low].map((channel, index) => Math.round(channel * (1 - mix) + original[high][index] * mix));
    }
  }
  const result = new Uint8ClampedArray(image.rgba);
  for (let pixel = 0; pixel < image.indices.length; pixel++) {
    const index = image.indices[pixel];
    if (index) result.set(rgb[index - 1], pixel * 4);
  }
  return result;
}

export class TeamColorArt {
  private images = new Map<string, DecodedImage>();
  private cache = new Map<string, string>();
  private loads = new Map<string, Promise<void>>();
  private abort = new AbortController();
  private listeners = new Set<() => void>();
  private revision = 0;
  private owners = 0;
  readonly limit = 128;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  get diagnostics() { return { images: this.images.size, cached: this.cache.size, limit: this.limit, owners: this.owners }; }
  retain() { this.owners++; return () => { if (--this.owners === 0) this.clear(); }; }
  clear() { this.abort.abort(); this.abort = new AbortController(); this.images.clear(); this.cache.clear(); this.loads.clear(); }
  load(roster: string): Promise<void> {
    if (roster !== 'human' && roster !== 'orc') return Promise.resolve();
    const previous = this.loads.get(roster); if (previous) return previous;
    const signal = this.abort.signal;
    const promise = (async () => {
      try {
        const base = import.meta.env?.BASE_URL ?? '/';
        const response = await fetch(base + teamColorManifest.packs[roster].url.slice(1), { signal });
        if (!response.ok || !response.body) throw Error('Color pack unavailable');
        // Limit both compressed input and decoded output before allocating a full pack.
        const bounded = async (stream: ReadableStream<Uint8Array>, maximum: number) => {
          const reader = stream.getReader(), chunks: Uint8Array[] = []; let length = 0;
          try { while (true) { const { value, done } = await reader.read(); if (done) break;
            length += value.length; if (length > maximum) throw Error('Color pack too large'); chunks.push(value); }
          } finally { await reader.cancel(); }
          const bytes = new Uint8Array(length); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; } return bytes;
        };
        // Some asset servers set Content-Encoding for .gz files; fetch then supplies decoded bytes.
        const compressed = await bounded(response.body, 3_000_000);
        const decoded = compressed[0] === 0x1f && compressed[1] === 0x8b
          ? await bounded(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')), 3_000_000) : compressed;
        const images = await decodeColorPack(roster, decoded.buffer);
        if (signal.aborted) return;
        for (const [key, value] of images) this.images.set(key, value);
        this.revision++; for (const listener of this.listeners) listener();
      } catch (error) {
        if (!signal.aborted) console.warn(`Team colors unavailable for ${roster}; retaining static artwork.`, error);
      }
    })();
    this.loads.set(roster, promise); return promise;
  }
  resolve(source: string | null, colors?: TeamColors): string | null {
    if (!source || !colors) return source;
    const keyStart = source.indexOf('/assets/game/');
    const image = this.images.get(source.slice(keyStart));
    if (!image) return source;
    const key = `${image.entry.id}:${colors.version}:${colors.primary}:${colors.secondary}`;
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return cached; }
    try {
      const canvas = document.createElement('canvas'); canvas.width = image.entry.width; canvas.height = image.entry.height;
      const context = canvas.getContext('2d'); if (!context) return source;
      context.putImageData(new ImageData(recolorTeamImage(image, colors), canvas.width, canvas.height), 0, 0);
      const url = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0;
      this.cache.set(key, url);
      if (this.cache.size > this.limit) this.cache.delete(this.cache.keys().next().value!);
      return url;
    } catch { return source; }
  }
}
export const teamColorArt = new TeamColorArt();
