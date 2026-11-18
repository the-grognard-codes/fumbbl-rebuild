import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PITCH_LENGTH, PITCH_WIDTH, type PitchProjection } from './pitch-projection.ts';

const tileSize = 48;
const apron = 2;
const width = (PITCH_LENGTH + apron * 2) * tileSize;
const height = (PITCH_WIDTH + apron * 2) * tileSize;
const turfUrl = import.meta.env.BASE_URL + 'assets/game/pitch/stadium-v1.png';

export function useMockupTurf(onError: () => void) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => {
    let disposed = false;
    const turf = new Image();
    turf.src = turfUrl;
    turf.decode().then(
      () => { if (!disposed) setImage(turf); },
      () => { if (!disposed) onError(); },
    );
    return () => { disposed = true; };
  }, [onError]);
  return image;
}

/** The overhead art frame clips the turf, independent of the camera's calibration height. */
export function StadiumMockupTurf({ camera, image }: { camera: PitchProjection; image?: HTMLImageElement }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = camera.surfaceImage(width, height, { x: -apron, y: -apron, z: 0 },
    { x: 1 / tileSize, y: 0, z: 0 }, { x: 0, y: 1 / tileSize, z: 0 }, false);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !image) return;
    const tile = document.createElement('canvas');
    tile.width = tile.height = tileSize;
    const tileContext = tile.getContext('2d');
    if (!tileContext) return;
    tileContext.imageSmoothingEnabled = false;
    tileContext.drawImage(image, 720, 400, 96, 96, 0, 0, tileSize, tileSize);
    const pattern = context.createPattern(tile, 'repeat');
    if (!pattern) return;
    context.fillStyle = pattern;
    context.fillRect(0, 0, width, height);
  }, [image]);
  if (!surface) return null;
  return <div className="stadium-surface" data-mockup-turf
    style={{ width, height, transform: surface.transform, clipPath: surface.clipPath }}>
    <canvas ref={canvas} width={width} height={height} style={{ display: 'block' }}/>
  </div>;
}
