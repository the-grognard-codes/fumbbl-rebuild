import { useLayoutEffect, useRef } from 'react';
import type { PitchProjection } from './pitch-projection.ts';

/** Finite apron remains visible when the camera's top edge looks above the horizon. */
export function StadiumMockupTurf({ camera, image }: { camera: PitchProjection; image?: HTMLImageElement }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = camera.surfaceImage(30 * 48, 19 * 48, { x: -2, y: -2, z: 0 }, { x: 1 / 48, y: 0, z: 0 }, { x: 0, y: 1 / 48, z: 0 });
  useLayoutEffect(() => {
    if (!canvas.current || !surface || !image) return;
    const tile = document.createElement('canvas'); tile.width = 48; tile.height = 48;
    tile.getContext('2d')!.drawImage(image, 720, 400, 96, 96, 0, 0, 48, 48);
    const context = canvas.current.getContext('2d')!;
    context.setTransform(1, 0, 0, 1, -surface.left, -surface.top);
    context.fillStyle = context.createPattern(tile, 'repeat')!;
    context.fillRect(surface.left, surface.top, canvas.current.width, canvas.current.height);
  }, [camera, image]);
  if (!surface) return null;
  return <div className="stadium-surface" data-mockup-turf style={{ width: surface.width, height: surface.height, transform: surface.transform, clipPath: surface.clipPath }}>
    <canvas ref={canvas} width={Math.ceil(surface.width)} height={Math.ceil(surface.height)} style={{ display: 'block' }}/>
  </div>;
}
