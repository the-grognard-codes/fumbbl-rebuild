/** Version 2: index 0 preserves RGBA; 1–16/17–32 select uniform shades. */
export type ProofRamp = { id: string; name: string; colors: string[] };
export type ProofImage = {
  id: string; kind: 'body' | 'bust' | 'helmet'; sourceUrl: string; sourceSha256: string;
  width: number; height: number; rgba: number[]; indices: number[][];
};
export type SpriteProofPack = { version: 2; status: 'palette-review'; ramps: ProofRamp[]; images: ProofImage[] };

export function decodeSpriteProof(value: unknown): SpriteProofPack {
  const fail = (): never => { throw new Error('Invalid sprite proof pack'); };
  const object = (item: unknown): Record<string, unknown> =>
    item !== null && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : fail();
  const root = object(value);
  if (root.version !== 2 || root.status !== 'palette-review' || !Array.isArray(root.ramps) || root.ramps.length !== 16
    || !Array.isArray(root.images) || root.images.length < 1 || root.images.length > 64) fail();
  const ramps = (root.ramps as unknown[]).map(entry => {
    const ramp = object(entry);
    if (typeof ramp.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(ramp.id) || typeof ramp.name !== 'string' || !ramp.name
      || !Array.isArray(ramp.colors) || ramp.colors.length !== 16 || !ramp.colors.every(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
      || new Set(ramp.colors).size !== 16) fail();
    return { id: ramp.id, name: ramp.name, colors: [...ramp.colors as string[]] } as ProofRamp;
  });
  const images = (root.images as unknown[]).map(entry => {
    const record = object(entry);
    const { id, kind, sourceUrl, sourceSha256, width, height, rgba, indices } = record;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id) || !['body', 'bust', 'helmet'].includes(String(kind))
      || typeof sourceUrl !== 'string' || !(kind === 'helmet'
        ? sourceUrl === '/assets/game/ui/match-ui-icon-atlas-v1.png#human'
        : /^\/assets\/game\/(teams\/[a-z0-9/-]+|proofs\/shared-sprite-v1\/frames\/[a-z0-9-]+)\.png$/.test(sourceUrl))
      || typeof sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sourceSha256)
      || !Number.isInteger(width) || !Number.isInteger(height) || Number(width) < 1 || Number(width) > 512 || Number(height) < 1 || Number(height) > 512) fail();
    const w = width as number, h = height as number;
    if (!Array.isArray(rgba) || rgba.length !== w * h * 4 || !rgba.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
      || !Array.isArray(indices) || indices.length !== h || !indices.every(row => Array.isArray(row) && row.length === w
        && row.every(index => Number.isInteger(index) && index >= 0 && index <= 32))) fail();
    const pixels = rgba as number[], rows = indices as number[][];
    for (let pixel = 0; pixel < w * h; pixel++) {
      if (pixels[pixel * 4 + 3] === 0 && rows[Math.floor(pixel / w)][pixel % w] !== 0) fail();
    }
    if (!rows.some(row => row.some(index => index >= 1 && index <= 16)) || !rows.some(row => row.some(index => index >= 17))) fail();
    return { id, kind, sourceUrl, sourceSha256, width: w, height: h, rgba: [...pixels], indices: rows.map(row => [...row]) } as ProofImage;
  });
  if (new Set(ramps.map(ramp => ramp.id)).size !== ramps.length || new Set(images.map(record => record.id)).size !== images.length
    || new Set(images.map(record => record.sourceUrl)).size !== images.length) fail();
  return { version: 2, status: 'palette-review', ramps, images };
}

/** Returns a new buffer; never changes source pixels, alpha, dimensions or index assignments. */
export function recolorProofImage(image: ProofImage, primary: ProofRamp, secondary: ProofRamp): Uint8ClampedArray {
  const rgb = [...primary.colors, ...secondary.colors].map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
  const output = new Uint8ClampedArray(image.rgba);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const index = Number(image.indices[y][x]);
    if (index === 0) continue;
    const offset = (y * image.width + x) * 4;
    output.set(rgb[index - 1], offset);
  }
  return output;
}

/** Bounded per-fixture cache; an unmatched source retains the existing static fallback URL. */
export class SpriteProofTextures {
  private readonly cache = new Map<string, string>();
  private readonly pack: SpriteProofPack;
  private readonly encode: (image: ProofImage, pixels: Uint8ClampedArray) => string;
  private readonly limit: number;

  constructor(pack: SpriteProofPack, encode: (image: ProofImage, pixels: Uint8ClampedArray) => string, limit = 32) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 256) throw new RangeError('Invalid texture cache limit');
    this.pack = pack; this.encode = encode; this.limit = limit;
  }

  get size(): number { return this.cache.size; }

  resolve(sourceUrl: string | null, primaryId: string, secondaryId: string): string | null {
    const primary = this.pack.ramps.find(ramp => ramp.id === primaryId), secondary = this.pack.ramps.find(ramp => ramp.id === secondaryId);
    if (!primary || !secondary) throw new RangeError('Unknown proof palette');
    if (!sourceUrl) return null;
    const image = this.pack.images.find(image => sourceUrl.endsWith(image.sourceUrl));
    if (!image) return sourceUrl;
    const key = `${image.id}:${primary.id}:${secondary.id}`;
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return cached; }
    const url = this.encode(image, recolorProofImage(image, primary, secondary));
    this.cache.set(key, url);
    if (this.cache.size > this.limit) this.cache.delete(this.cache.keys().next().value!);
    return url;
  }
}
