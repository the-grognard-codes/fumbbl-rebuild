import { useId } from 'react';
import { PitchProjection } from './pitch-projection.ts';
import { hybridDepth } from './stadium-hybrid-prototype.ts';
import { wallStudyFaces, wallStudyProps, WALL_MATERIAL_ART, WALL_ACCESSORY_ART,
  type WallStudyFace, type WallStudyProp } from './stadium-wall-study.ts';

const asset = (file: string) => import.meta.env.BASE_URL + 'assets/game/pitch/stadiums/prototype/' + file;
const faces = wallStudyFaces(), props = wallStudyProps();

function Stone({ face, camera }: { face: WallStudyFace; camera: PitchProjection }) {
  const id = useId().replace(/:/g, '');
  if (camera.mode==='top-down' && face.role!=='coping') return null;
  const width = Math.hypot(face.across.x, face.across.y, face.across.z) * 128;
  const height = Math.hypot(face.down.x, face.down.y, face.down.z) * 128;
  const surface = camera.surfaceImage(width, height, face.origin,
    { x: face.across.x / width, y: face.across.y / width, z: face.across.z / width },
    { x: face.down.x / height, y: face.down.y / height, z: face.down.z / height });
  if (!surface) return null;
  const region = face.role === 'coping' ? WALL_MATERIAL_ART.coping[face.variant] : WALL_MATERIAL_ART.face[face.variant];
  const textureHeight = face.role === 'coping' ? height : 160;
  // Only masonry maps to quads; all visual depth comes from actual vertical/horizontal planes.
  return <div className="stadium-surface wall-study-face" data-wall-face={face.id} data-wall-side={face.side}
    data-wall-role={face.role} style={{ width: surface.width, height: surface.height, transform: surface.transform, clipPath: surface.clipPath }}>
    <svg width={surface.width} height={surface.height} viewBox={`${surface.left} ${surface.top} ${surface.width} ${surface.height}`}>
      <defs><pattern id={id} x={-(face.textureOffset??0)} width="384" height={textureHeight} patternUnits="userSpaceOnUse">
        <rect width="384" height={textureHeight} fill={face.role==='coping'?'#8a8775':'#545b58'}/>
        <svg width="384" height={textureHeight} viewBox={`${region.x} ${region.y} ${region.width} ${region.height}`} preserveAspectRatio="none">
          <image href={asset(WALL_MATERIAL_ART.file)} width={WALL_MATERIAL_ART.width} height={WALL_MATERIAL_ART.height}/>
        </svg>
      </pattern></defs>
      <rect width={width} height={height} fill={`url(#${id})`}/>
    </svg>
  </div>;
}

function Accessory({ prop, camera }: { prop: WallStudyProp; camera: PitchProjection }) {
  const id = useId().replace(/:/g, ''), region = WALL_ACCESSORY_ART[prop.role];
  const point = camera.projectRaised(prop.anchor, prop.anchor.z);
  if (!point) return null;
  // Intact accessory silhouettes have one screen scale; no stretching to a wall quadrilateral.
  const height = point.pixelsPerSquare * prop.height, width = height * region.width / region.height;
  const mirror = (prop.role==='torch'||prop.role==='post') && ((prop.side==='south') === (camera.end==='home'));
  const pivot = (region.pivotX-region.x)/region.width;
  if (camera.mode==='top-down') {
    if (prop.role==='blueBanner'||prop.role==='redBanner') return null;
    return <svg className="wall-study-prop" data-wall-prop={prop.role} data-wall-side={prop.side} data-camera-mode={camera.mode}
      width={point.pixelsPerSquare*.3} height={point.pixelsPerSquare*.3} style={{left:point.x-point.pixelsPerSquare*.15,top:point.y-point.pixelsPerSquare*.15}}
      viewBox="0 0 32 32"><svg width="32" height="32" viewBox="875 622 96 48" preserveAspectRatio="none">
        <image href={asset(WALL_ACCESSORY_ART.file)} width={WALL_ACCESSORY_ART.width} height={WALL_ACCESSORY_ART.height}/>
      </svg>
      {prop.role==='torch'&&<circle cx="16" cy="16" r="7" fill="#f3b43c"/>}</svg>;
  }
  return <svg className="wall-study-prop" data-wall-prop={prop.role} data-wall-side={prop.side} data-camera-mode={camera.mode}
    width={width} height={height} data-wall-mirrored={mirror} style={{left:point.x-width*(mirror?1-pivot:pivot),top:point.y-height,transform:mirror?'scaleX(-1)':undefined}}
    viewBox={`${region.x} ${region.y} ${region.width} ${region.height}`}>
    <image href={asset(WALL_ACCESSORY_ART.file)} width={WALL_ACCESSORY_ART.width} height={WALL_ACCESSORY_ART.height}/>
    {prop.role==='torch'&&<>
      <defs><clipPath id={id}><rect x={region.x} y={region.y} width={region.width} height={region.height*.28}/></clipPath></defs>
      <image className="wall-study-flame" clipPath={`url(#${id})`} href={asset(WALL_ACCESSORY_ART.file)}
        width={WALL_ACCESSORY_ART.width} height={WALL_ACCESSORY_ART.height}/>
    </>}
  </svg>;
}

export function StadiumWallStudy({ camera }: { camera: PitchProjection }) {
  const objects = [
    ...faces.map(face=>({id:face.id,depth:hybridDepth({
      x:face.origin.x+(face.across.x+face.down.x)/2,
      y:face.origin.y+(face.across.y+face.down.y)/2,
      z:face.origin.z+(face.across.z+face.down.z)/2},camera),node:<Stone face={face} camera={camera}/>})),
    ...props.map(prop=>({id:prop.id,depth:hybridDepth({...prop.anchor,z:prop.anchor.z+prop.height/2},camera),node:<Accessory prop={prop} camera={camera}/>}))
  ].sort((a,b)=>b.depth-a.depth);
  return <div className="wall-study" aria-hidden="true" data-wall-study="crowd-free">
    {objects.map(object=><div className="hybrid-object" key={object.id}>{object.node}</div>)}
  </div>;
}
