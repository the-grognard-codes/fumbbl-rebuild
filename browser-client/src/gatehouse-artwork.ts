import { bowl } from './stadium-bowl-study.ts';
import { teamColorRamps } from './team-color-art.ts';
import type { TeamColors } from './team-colors.ts';

export type GatehouseArtwork = { image: HTMLImageElement; materials: Uint8Array };

async function loadNativeImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (image.naturalWidth !== bowl.width || image.naturalHeight !== bowl.height) throw Error('Invalid bowl dimensions');
  return image;
}

function createNativeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = bowl.width;
  canvas.height = bowl.height;
  return canvas;
}

export async function loadGatehouseArtwork(foregroundUrl: string, maskUrl: string): Promise<GatehouseArtwork> {
  const [image, mask] = await Promise.all([loadNativeImage(foregroundUrl), loadNativeImage(maskUrl)]);
  const { width, height } = bowl;
  const context = createNativeCanvas().getContext('2d', { willReadFrequently: true });
  if (!context) throw Error('Gatehouse artwork canvas unavailable');
  context.drawImage(image, 0, 0);
  const foreground = context.getImageData(0, 0, width, height).data;
  context.clearRect(0, 0, width, height);
  context.drawImage(mask, 0, 0);
  const rgba = context.getImageData(0, 0, width, height).data;
  const materials = new Uint8Array(width * height);
  for (let pixel = 0; pixel < materials.length; pixel++) {
    const offset = pixel * 4;
    const index = rgba[offset];
    if (index > 64 || rgba[offset + 1] !== index || rgba[offset + 2] !== index || rgba[offset + 3] !== 255
      || (index && foreground[offset + 3] !== 255)) throw Error('Invalid Gatehouse material index');
    materials[pixel] = index;
  }
  return { image, materials };
}

export function gatehouseClothOverlay({ materials }: GatehouseArtwork, { home, away }: Record<'home' | 'away', TeamColors>) {
  // The mask stores four consecutive 16-shade ranges, with index 0 reserved for fixed art.
  const colors = [home.primary, home.secondary, away.primary, away.secondary];
  const palette = colors.flatMap(id => teamColorRamps.find(ramp => ramp.id === id)!.colors).map(hex => {
    const rgb = Number.parseInt(hex.slice(1), 16);
    return [rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255];
  });
  // Only opaque cloth is indexed. Transparent overlay pixels leave the source and its silhouette intact.
  const overlay = new ImageData(bowl.width, bowl.height);
  for (let pixel = 0; pixel < materials.length; pixel++) {
    const index = materials[pixel];
    if (index) overlay.data.set(palette[index - 1], pixel * 4);
  }
  const canvas = createNativeCanvas();
  canvas.getContext('2d')!.putImageData(overlay, 0, 0);
  return canvas;
}
