import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PitchProjection, PITCH_LENGTH, PITCH_WIDTH } from '../../../../../browser-client/src/pitch-projection.ts';

const sourcePath = new URL('../../../../../browser-client/src/pitch-projection.ts',import.meta.url);
const source = readFileSync(sourcePath,'utf8');
const production = stripTypeScriptTypes(source,{mode:'strip'}).replace(/^export /gm,'');
if(process.argv[2]) {
  const fragment = readFileSync(process.argv[2],'utf8');
  if(!fragment.includes('/* PRODUCTION_PROJECTION_SOURCE */'))throw new Error('Missing production projection injection marker');
  writeFileSync(process.argv[2],fragment.replace('/* PRODUCTION_PROJECTION_SOURCE */',production));
}
const fixtures = {
  pitch:{length:PITCH_LENGTH,width:PITCH_WIDTH,cells:PITCH_LENGTH*PITCH_WIDTH},
  apron:{squares:2,x:[-2,28],y:[-2,17]},
  sectionSplitX:13,
  crowdOuterBounds:{x:[-6,32],y:[-6,21]},
  gates:[{id:'home-locker',x:6,y:-2,width:2.4},{id:'away-locker',x:20,y:17,width:2.4}],
  benches:[{id:'home-bench',x:9,y:-3.25,along:3,across:1.1},{id:'away-bench',x:17,y:18.25,along:3,across:1.1}],
  partitions:[{id:'north-midfield',x:13,y:[-6,-2]},{id:'south-midfield',x:13,y:[17,21]}],
  standingPlatformRise:0.9,
  diagramHeadRise:1.65
};
if(fixtures.pitch.cells!==390||fixtures.gates.length!==2||fixtures.partitions.some(p=>p.x!==PITCH_LENGTH/2))
  throw new Error('Pitch or layout contract mismatch');
const points=[];
for(const x of [-6,-2,0,6,13,20,26,28,32])for(const y of [-6,-2,0,7.5,15,17,21])
  for(const rise of [0,0.9,1.65])points.push({x,y,rise});
let cameras=0,finiteProjected=0,nearClipped=0,roundTrips=0,maxRoundTripError=0,maxSmoothStepRatio=0;
for(const end of ['home','away'])for(const elevation of [30,40,50,90])
  for(const [width,height] of [[1672,941],[736,414],[320,280]])for(const zoom of [.5,1,2]) {
    let previous=null;
    for(let index=0;index<=104;index++) {
      const focus=index/4;
      const camera=new PitchProjection({width,height,end,focus,zoom,mode:elevation===90?'top-down':'perspective',
        perspectiveElevation:elevation===90?40:elevation});
      cameras++;
      for(const point of points) {
        const projected=camera.projectRaised(point,point.rise);
        if(!projected){nearClipped++;continue;}
        if(![projected.x,projected.y,projected.depth,projected.pixelsPerSquare].every(Number.isFinite))
          throw new Error('Non-finite projection');
        finiteProjected++;
        if(point.rise===0&&projected.x>=0&&projected.x<=width&&projected.y>=0&&projected.y<=height) {
          const recovered=camera.unproject(projected);
          if(!recovered)throw new Error('Visible ground could not be inverted');
          const error=Math.max(Math.abs(recovered.x-point.x),Math.abs(recovered.y-point.y));
          maxRoundTripError=Math.max(maxRoundTripError,error);roundTrips++;
          if(error>1e-7)throw new Error('Visible ground registration drift');
        }
      }
      const anchor=camera.projectRaised({x:13,y:-2},.9);
      if(previous&&anchor&&previous.depth>2&&anchor.depth>2&&previous.x>=0&&previous.x<=width&&previous.y>=0&&previous.y<=height
        &&anchor.x>=0&&anchor.x<=width&&anchor.y>=0&&anchor.y<=height) {
        const step=Math.hypot(anchor.x-previous.x,anchor.y-previous.y)/Math.max(previous.pixelsPerSquare,anchor.pixelsPerSquare);
        maxSmoothStepRatio=Math.max(maxSmoothStepRatio,step);
        if(step>1)throw new Error('Visible anchor discontinuity in quarter-square travel');
      }
      previous=anchor;
    }
  }
const report={
  status:'passed', scope:'Production PitchProjection mathematical check and schematic review layout; not finished raster/crowd integration',
  productionSource:fileURLToPath(sourcePath),
  productionSourceSha256:createHash('sha256').update(source).digest('hex'),
  cameras,finiteProjected,nearClipped,roundTrips,maxRoundTripError,maxSmoothStepRatio,
  checked:{focus:'0 through 26 at 0.25-square intervals',ends:['home','away'],angles:[30,40,50,90],zooms:[.5,1,2],
    viewports:[[1672,941],[736,414],[320,280]],lensHandling:'Behind-lens anchors are omitted; schematic raised surfaces clip in world space'},
  proposedLayout:fixtures,
  limits:['No shipping scenery code changed','Raster artwork is illustrative, not registered to this camera',
    'Schematic uses raised colored supporter markers, not production crowd sprites',
    'Final occlusion, module seams, camera movement and interactive pitch access need browser validation after asset separation']
};
writeFileSync(new URL('layout-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,cameras,finiteProjected,nearClipped,roundTrips,maxRoundTripError,maxSmoothStepRatio}));
