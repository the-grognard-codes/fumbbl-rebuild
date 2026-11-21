import { useId } from 'react';
import type { PitchProjection } from './pitch-projection.ts';
import type { JigsawModule } from './stadium-jigsaw.ts';
import { mockupAsset } from './stadium-mockup-assets.ts';

/** Only authored flame pixels flicker; all masonry and world anchors stay still. */
export function StadiumMockupLife({ camera, modules }: { camera: PitchProjection; modules: readonly JigsawModule[] }) {
  const prefix = useId().replace(/:/g, '');
  return <div className="mockup-life" aria-hidden="true">{modules.filter(module => module.id.startsWith(camera.mode === 'top-down' ? 'new-rim-' : 'new-wall-')).map((module, index) => {
    const surface = camera.registeredSurfaceImage(module.art.width, module.art.height, module.registration, module.origin, module.across, module.down, module.bounds);
    if (!surface) return null;
    const id = `${prefix}-${module.id}`, top = camera.mode === 'top-down';
    return <div key={module.id} className="stadium-surface" style={{ width: surface.width, height: surface.height, transform: surface.transform, clipPath: surface.clipPath }}>
      <svg width={surface.width} height={surface.height} viewBox={`${surface.left} ${surface.top} ${surface.width} ${surface.height}`}>
        <defs><clipPath id={id}>{[290, 1120].map(x => <rect key={x} x={x} y={top ? 390 : 0} width="125" height={top ? 75 : 90}/>)}</clipPath></defs>
        <image className="mockup-flame" data-motion="torch" clipPath={`url(#${id})`} href={mockupAsset('architecture-v2.png')} width="1536" height="1024" style={{ animationDelay: `${-index * .173}s` }}/>
      </svg>
    </div>;
  })}</div>;
}
