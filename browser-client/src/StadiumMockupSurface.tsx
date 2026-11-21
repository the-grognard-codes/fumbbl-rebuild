import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PitchProjection } from './pitch-projection.ts';
import { mapJigsaw, registerJigsaw, type JigsawModule } from './stadium-jigsaw.ts';
import { useActiveCrowdSection } from './CrowdGestureProvider.tsx';

export function useMockupImages(urls: readonly string[], onError: () => void) {
  const key = [...new Set(urls)].sort().join('\n');
  const [images, setImages] = useState<ReadonlyMap<string, HTMLImageElement>>(new Map());
  useEffect(() => {
    let disposed = false;
    Promise.allSettled(key.split('\n').filter(Boolean).map(async url => {
      const image = new Image(); image.src = url; await image.decode();
      return [url, image] as const;
    })).then(results => {
      if (disposed) return;
      setImages(new Map(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])));
      if (results.some(result => result.status === 'rejected')) onError();
    });
    return () => { disposed = true; };
  }, [key]);
  return images;
}

/** Rasterize only the clipped source rectangle, avoiding hundreds of full-atlas compositor layers. */
export function StadiumMockupSurface({ camera, module, image, gesture, order, motion }: {
  camera: PitchProjection; module: JigsawModule; image?: HTMLImageElement; gesture?: HTMLImageElement; order: number; motion: boolean;
}) {
  const base = useRef<HTMLCanvasElement>(null), peak = useRef<HTMLCanvasElement>(null);
  const active = useActiveCrowdSection();
  const surface = camera.registeredSurfaceImage(module.art.width, module.art.height, module.registration, module.origin, module.across, module.down, module.bounds);
  useLayoutEffect(() => {
    if (!surface || !base.current || !image) return;
    const paint = (canvas: HTMLCanvasElement, bitmap: HTMLImageElement, gestureOnly: boolean) => {
      const context = canvas.getContext('2d')!;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.save(); context.imageSmoothingEnabled = false;
      if (gestureOnly && module.gesture) {
        const zone = module.gesture.zone;
        context.beginPath(); context.rect(zone.x - surface.left, zone.y - surface.top, zone.width, zone.height); context.clip();
      }
      if (module.outline) {
        const corners = [{ x: 0, y: 0 }, { x: module.art.width, y: 0 }, { x: module.art.width, y: module.art.height }, { x: 0, y: module.art.height }];
        const inverse = registerJigsaw(corners.map(point => mapJigsaw(module.registration, point)), corners);
        context.beginPath();
        module.outline.map(point => mapJigsaw(inverse, point)).forEach((point, index) => {
          if (index) context.lineTo(point.x - surface.left, point.y - surface.top); else context.moveTo(point.x - surface.left, point.y - surface.top);
        });
        context.closePath(); context.clip();
      }
      context.drawImage(bitmap, -surface.left, -surface.top);
      context.restore();
    };
    paint(base.current, image, false);
    if (peak.current && gesture) paint(peak.current, gesture, true);
  }, [image, gesture, camera, module, motion]);
  if (!surface || !image) return null;
  return <div className="stadium-surface" data-jigsaw-piece={module.piece ?? module.id} data-stadium-role={module.role} data-team={module.team}
    style={{ width: surface.width, height: surface.height, transform: surface.transform, clipPath: surface.clipPath, overflow: 'hidden', zIndex: order }}>
    <canvas ref={base} width={Math.ceil(surface.width)} height={Math.ceil(surface.height)} style={{ display: 'block', imageRendering: 'pixelated' }}/>
    {motion && gesture && module.gesture && <canvas ref={peak} className="stadium-gesture stadium-gesture-peak" data-active={active === module.piece ? 'true' : 'false'} data-motion="section-gesture"
      width={Math.ceil(surface.width)} height={Math.ceil(surface.height)} style={{ position: 'absolute', left: 0, top: 0, imageRendering: 'pixelated' }}/ >}
  </div>;
}
