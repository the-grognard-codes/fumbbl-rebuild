import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

// Read-only PNG metadata for canonical art. No pixel output or resizing.
export async function readRgbaPng(path) {
  const png = await readFile(path), compressed = [];
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Invalid PNG: ' + path);
  let width, height, ended = false;
  for (let at = 8; at + 12 <= png.length;) {
    const length = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8);
    if (at + 12 + length > png.length) throw Error('Truncated PNG: ' + path);
    const data = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      if (width || at !== 8 || length !== 13 || data[8] !== 8 || data[9] !== 6 || data[10] || data[11] || data[12])
        throw Error('Art must be non-interlaced RGBA8 PNG: ' + path);
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (!width || !height || width > 4096 || height > 4096) throw Error('Invalid art dimensions: ' + path);
    }
    if (type === 'IDAT') compressed.push(data);
    at += length + 12;
    if (type === 'IEND') { ended = length === 0 && at === png.length; break; }
  }
  if (!width || !height || !compressed.length || !ended) throw Error('Incomplete PNG: ' + path);
  const stride = width * 4, data = inflateSync(Buffer.concat(compressed), { maxOutputLength: height * (stride + 1) });
  if (data.length !== height * (stride + 1)) throw Error('Invalid PNG scanlines: ' + path);
  const rgba = Buffer.alloc(width * height * 4);
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = data[cursor++];
    if (filter > 4) throw Error('Invalid PNG filter: ' + path);
    for (let i = 0; i < stride; i++) {
      const pos = y * stride + i, left = i >= 4 ? rgba[pos - 4] : 0,
        above = y ? rgba[pos - stride] : 0, corner = y && i >= 4 ? rgba[pos - stride - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = above;
      if (filter === 3) predictor = Math.floor((left + above) / 2);
      if (filter === 4) {
        const p = left + above - corner, a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - corner);
        predictor = a <= b && a <= c ? left : b <= c ? above : corner;
      }
      rgba[pos] = (data[cursor++] + predictor) & 255;
    }
  }
  return { width, height, rgba };
}
export function visibleBounds(image, box = { x: 0, y: 0, width: image.width, height: image.height }) {
  let left = box.x + box.width, top = box.y + box.height, right = -1, bottom = -1;
  for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) {
    if (image.rgba[(y * image.width + x) * 4 + 3] >= 32) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw Error('Empty art region');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
