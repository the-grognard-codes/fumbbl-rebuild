import { memo, useId } from 'react';
import { PitchProjection, type PlaneMatrix } from './pitch-projection.ts';
import './pitch-scenery.css';
const WIDTH=1672,HEIGHT=941;
const url=`${import.meta.env.BASE_URL}assets/game/pitch/stadium-v1.png`;
// Only the registered grass from the approved painting is retained.
const registration:PlaneMatrix=[[0,-13.350726120762829,22824.563196736133],
  [17.044276629673718,4.301823272632846,-6422.851576615379],[0,.5735764363510462,1043.4884914389131]];
const sourceWorld=(x:number,y:number)=>{
  const d=registration[2][1]*y+registration[2][2];
  return {x:(registration[0][1]*y+registration[0][2])/d,y:(registration[1][0]*x+registration[1][1]*y+registration[1][2])/d};
};
const a=sourceWorld(0,0).x,b=sourceWorld(0,HEIGHT).x,period=Math.abs(a-b)/2;
function GrassGround({camera,onError}:{camera:PitchProjection;onError:()=>void}) {
  const pattern=useId().replace(/:/g,''),w=38*48,h=27*48;
  const surface=camera.surfaceImage(w,h,{x:-6,y:-6,z:0},{x:1/48,y:0,z:0},{x:0,y:1/48,z:0});
  if(!surface)return null;
  return <div className="stadium-surface" style={{width:surface.width,height:surface.height,transform:surface.transform,clipPath:surface.clipPath}}>
    <svg width={surface.width} height={surface.height} viewBox={surface.left+' '+surface.top+' '+surface.width+' '+surface.height}>
      <defs><pattern id={pattern} width={48} height={48} patternUnits="userSpaceOnUse">
        <svg width={48} height={48} viewBox="720 400 96 96" preserveAspectRatio="none">
          <image data-grass-sample="true" href={url} width={WIDTH} height={HEIGHT} onError={onError}/>
        </svg>
      </pattern></defs><rect width={w} height={h} fill={'url(#'+pattern+')'}/>
    </svg>
  </div>;
}

/** Keep the registered pitch turf without stadium architecture, props or crowds. */
export const PitchScenery=memo(function PitchScenery({camera,onError}:{camera:PitchProjection;onError:()=>void}) {
  const top=camera.unproject({x:camera.center.x,y:0}),bottom=camera.unproject({x:camera.center.x,y:camera.height});
  if(!top||!bottom)return null;
  const lo=Math.min(top.x,bottom.x),hi=Math.max(top.x,bottom.x),first=camera.end==='home'?a:26-a,last=camera.end==='home'?b:26-b;
  const offsets=Array.from({length:17},(_,i)=>(i-8)*period).filter(offset=>Math.max(first,last)+offset>=lo&&Math.min(first,last)+offset<=hi)
    .sort((first,second)=>camera.end==='home'?second-first:first-second);
  const footprint=camera.polygon([{x:-2,y:-2},{x:28,y:-2},{x:28,y:17},{x:-2,y:17}],true);
  const turfClip=footprint.length>=3?'polygon('+footprint.map(p=>p.x/camera.width*100+'% '+p.y/camera.height*100+'%').join(',')+')':'inset(100%)';
  return <div className="pitch-stadium-world" aria-hidden="true">
    <div className="pitch-stadium-turf-world" style={{clipPath:turfClip}}><GrassGround camera={camera} onError={onError}/>
      {offsets.map(offset=>{
        const end=camera.end==='home'?1:-1,xOrigin=camera.end==='home'?offset:26+offset,yOrigin=camera.end==='home'?0:15;
        const matrix=registration.map((row,i)=>i<2?row.map((value,j)=>end*value+(i===0?xOrigin:yOrigin)*registration[2][j]):[...row]);
        return <div key={offset} className="pitch-stadium-plate" data-world-offset={offset}
          style={{width:WIDTH,height:HEIGHT,transform:camera.planeImageTransform(matrix)}}>
          <img className="pitch-stadium-turf" src={url} alt="" onError={onError} style={{transform:end===-1?'scaleX(-1)':undefined}}/>
        </div>;
      })}
    </div>
  </div>;
});
