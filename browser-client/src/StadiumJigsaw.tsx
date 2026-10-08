import { type CSSProperties } from 'react';
import { PitchProjection } from './pitch-projection.ts';
import {useActiveCrowdSection} from './CrowdGestureProvider.tsx';
import { registerJigsaw, mapJigsaw, type JigsawModule } from './stadium-jigsaw.ts';
import { type StadiumProfile } from './stadium-presentation.ts';

/** Original atlas pixels form distinct, measured world pieces. */
export function JigsawSurface({camera,module,onError,failed,gestureFailed}:{camera:PitchProjection;module:JigsawModule;
  onError:(profile:StadiumProfile,source?:string)=>void;failed:boolean;gestureFailed:boolean}){
  const active=useActiveCrowdSection();
  const surface=camera.registeredSurfaceImage(module.art.width,module.art.height,
    module.registration,module.origin,module.across,module.down,module.bounds);
  const metadata={'data-jigsaw-piece':module.piece??module.id,'data-jigsaw-row':module.piece?module.id:undefined,'data-stadium-role':module.role,
    'data-stadium-profile':module.profile.id,'data-team':module.team,'data-crowd-team':module.team,
    'data-seat':module.role==='crowd'?module.id:undefined,'data-stand-edge':module.edge,
    'data-world-x':module.anchor?.x??module.origin.x,'data-world-y':module.anchor?.y??module.origin.y,
    'data-gesture-failed':gestureFailed?'true':undefined,'data-art-view':camera.mode,'data-crowd-pose':module.pose,
    'data-section-x0':module.sectionBounds?.x0,'data-section-x1':module.sectionBounds?.x1,
    'data-section-y0':module.sectionBounds?.y0,'data-section-y1':module.sectionBounds?.y1};
  if(!surface)return <div className={'stadium-surface'+(module.role==='crowd'?' pitch-stadium-crowd':'')} {...metadata} style={{display:'none'}}/>;
  const source=[{x:0,y:0},{x:module.art.width,y:0},{x:module.art.width,y:module.art.height},{x:0,y:module.art.height}];
  const inverse=registerJigsaw(source.map(p=>mapJigsaw(module.registration,p)),source);
  const holes=module.holes?.filter(h=>h.x1>module.bounds.x0&&h.x0<module.bounds.x1&&h.y1>module.bounds.y0&&h.y0<module.bounds.y1);
  const style:CSSProperties={width:surface.width,height:surface.height,transform:surface.transform,clipPath:surface.clipPath};
  const mask=holes?.length?'url("data:image/svg+xml,'+encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+module.art.width+'" height="'+module.art.height+'"><path fill="white" fill-rule="evenodd" d="M0 0H'+module.art.width+'V'+module.art.height+'H0Z '+holes.map(h=>[ {x:h.x0,y:h.y0},{x:h.x1,y:h.y0},{x:h.x1,y:h.y1},{x:h.x0,y:h.y1}].map(p=>mapJigsaw(inverse,p)).map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ')+'Z').join(' ')+'"/></svg>')+'")':undefined;
  const imageStyle:CSSProperties={position:'absolute',left:-surface.left,top:-surface.top,width:module.art.width,height:module.art.height,
    maxWidth:'none',imageRendering:'pixelated',maskImage:mask};
  const z=module.gesture?.zone,gestureVisible=z&&surface.left+surface.width>z.x&&surface.left<z.x+z.width&&surface.top+surface.height>z.y&&surface.top<z.y+z.height;
  return <div className={'stadium-surface'+(module.role==='crowd'?' pitch-stadium-crowd':'')} {...metadata} style={style}>
    <div style={{position:'absolute',inset:0,overflow:'hidden'}}>
      {failed?<div data-art-fallback={module.role} style={{width:'100%',height:'100%',background:module.profile.palette.stone}}/>:
        <><img src={import.meta.env.BASE_URL+'assets/game/pitch/stadiums/jigsaw/'+module.art.file} alt="" style={imageStyle} onError={()=>onError(module.profile,module.art.file)}/>
          {!gestureFailed&&gestureVisible&&module.gesture?<img className="stadium-gesture" data-active={active===module.piece?'true':'false'} data-motion="section-gesture"
            src={import.meta.env.BASE_URL+'assets/game/pitch/stadiums/jigsaw/'+module.gesture.file} alt="" onError={()=>onError(module.profile,module.gesture!.file)}
            style={{...imageStyle,clipPath:'polygon('+z.x/module.art.width*100+'% '+z.y/module.art.height*100+'%, '+(z.x+z.width)/module.art.width*100+'% '+z.y/module.art.height*100+'%, '+(z.x+z.width)/module.art.width*100+'% '+(z.y+z.height)/module.art.height*100+'%, '+z.x/module.art.width*100+'% '+(z.y+z.height)/module.art.height*100+'%)'}}/>:null}</>}
    </div>
  </div>;
}
