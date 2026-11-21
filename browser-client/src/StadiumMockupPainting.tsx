import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PitchEnd } from './pitch-projection.ts';
import { recolorTeamImage } from './team-color-art.ts';
import type { TeamColors } from './team-colors.ts';
import { mockupColorPair, STILL_LAYOUT, type MockupColorPreset, type PitchPreset, type Visitor } from './stadium-mockup.ts';

export const paintingLayers = ['sides', 'ends', 'visitor', 'turf'] as const;
export type PaintingVisibility = Record<typeof paintingLayers[number], boolean>;
export const allPaintingLayers: PaintingVisibility = { sides: true, ends: true, visitor: true, turf: true };

type LayerKind = keyof PaintingVisibility;
type ImageVariants = { image?: string; mask?: string; humanImage?: string; humanMask?: string };
type Placement = ImageVariants & { x: number; y: number; flipX?: boolean };
type PaintedLayer = {
  id: string;
  role: LayerKind | 'emblem';
  group?: LayerKind;
  image: string;
  mask?: string;
  humanImage?: string;
  humanMask?: string;
  team?: PitchEnd;
  home: Placement;
  away: Placement;
  calmImage?: string;
};
type PaintingManifest = {
  width: number;
  height: number;
  pixelsPerSquare: number;
  layers: PaintedLayer[];
};

const manifestFiles = import.meta.glob('../../assets/game/references/stadiums/round-four/layers/manifest.json',
  { eager: true, import: 'default' }) as Record<string, PaintingManifest>;
const manifest = Object.values(manifestFiles)[0];
const imageFiles = import.meta.glob('../../assets/game/references/stadiums/round-four/layers/*.{png,webp}',
  { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const imageUrls = new Map(Object.entries(imageFiles).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]));

let paintings: Promise<Map<string, HTMLImageElement>> | undefined;
export function loadStadiumMockupPainting() {
  if (!paintings) paintings = (async () => {
    if (!manifest || manifest.width !== STILL_LAYOUT.width || manifest.height !== STILL_LAYOUT.height
      || manifest.pixelsPerSquare !== STILL_LAYOUT.pixelsPerSquare) throw Error('Invalid stadium painting dimensions');
    const files = new Set(manifest.layers.flatMap(layer => [layer.calmImage,
      ...[layer, layer.home, layer.away].flatMap(({ image, mask, humanImage, humanMask }) =>
        [image, mask, humanImage, humanMask])]));
    const entries = await Promise.all([...files].filter((file): file is string => !!file).map(async file => {
      const url = imageUrls.get(file);
      if (!url) throw Error('Missing stadium painting layer ' + file);
      const image = new Image();
      image.src = url;
      await image.decode();
      return [file, image] as const;
    }));
    return new Map(entries);
  })();
  return paintings;
}

function tintedLayer(source: HTMLImageElement, mask: HTMLImageElement, colors: TeamColors) {
  const width = source.naturalWidth;
  const height = source.naturalHeight;
  if (width !== mask.naturalWidth || height !== mask.naturalHeight) throw Error('Stadium cloth mask dimensions differ');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return source;
  context.drawImage(mask, 0, 0);
  const material = context.getImageData(0, 0, width, height).data;
  const indices = new Uint8Array(width * height);
  for (let pixel = 0; pixel < indices.length; pixel++) indices[pixel] = material[pixel * 4];

  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0);
  const rgba = new Uint8Array(context.getImageData(0, 0, width, height).data.buffer);
  context.putImageData(new ImageData(recolorTeamImage({ rgba, indices }, colors), width, height), 0, 0);
  return canvas;
}

type PaintingOptions = {
  end: PitchEnd;
  preset: PitchPreset;
  colors: MockupColorPreset;
  visitor: Visitor;
  visible: PaintingVisibility;
};

export function drawStadiumMockupPainting(context: CanvasRenderingContext2D, images: ReadonlyMap<string, HTMLImageElement>, {
  end, preset, colors, visitor, visible,
}: PaintingOptions) {
  const pair = mockupColorPair(colors, visitor);
  context.clearRect(0, 0, STILL_LAYOUT.width, STILL_LAYOUT.height);
  context.imageSmoothingEnabled = false;
  for (const layer of manifest.layers) {
    const group = layer.role === 'emblem' ? layer.group ?? 'sides' : layer.role;
    if (!visible[group]) continue;
    const pose = layer[end];
    const humanImage = visitor === 'human' ? pose.humanImage ?? layer.humanImage : undefined;
    const imageFile = preset === 'calm' && layer.calmImage ? layer.calmImage : humanImage ?? pose.image ?? layer.image;
    const source = images.get(imageFile)!;
    const humanMask = visitor === 'human' ? pose.humanMask ?? layer.humanMask : undefined;
    const maskFile = humanMask ?? pose.mask ?? layer.mask;
    const recolor = colors !== 'defaults' || visitor === 'human' && layer.team === 'away';
    const image = recolor && maskFile && layer.team ? tintedLayer(source, images.get(maskFile)!, pair[layer.team]) : source;
    if (pose.flipX) {
      context.save();
      context.translate(pose.x + source.naturalWidth, pose.y);
      context.scale(-1, 1);
      context.drawImage(image, 0, 0);
      context.restore();
    } else context.drawImage(image, pose.x, pose.y);
  }
}

export function StadiumMockupPainting({ end, preset, colors, visitor, visible, onError }: PaintingOptions & { onError: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<ReadonlyMap<string, HTMLImageElement>>();
  useEffect(() => {
    let disposed = false;
    loadStadiumMockupPainting().then(
      loaded => { if (!disposed) setImages(loaded); },
      () => { if (!disposed) onError(); },
    );
    return () => { disposed = true; };
  }, [onError]);

  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !images) return;
    drawStadiumMockupPainting(context, images, { end, preset, colors, visitor, visible });
  }, [colors, end, images, preset, visitor, visible]);

  return <canvas ref={canvas} className="mockup-painted-canvas" data-painting-ready={Boolean(images)}
    width={STILL_LAYOUT.width} height={STILL_LAYOUT.height} aria-label="Layered Gatehouse painting"/>;
}
