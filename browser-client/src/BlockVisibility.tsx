import type { CSSProperties } from 'react';
import type { PitchProjection, Point } from './pitch-projection.ts';
import type { BlockContext } from './block-context.ts';
import { blockMarkerGeometry } from './block-marker-geometry.ts';
import type { BlockMarkerKind } from './block-marker-geometry.ts';
import './block-visibility.css';

const colors = {block:'#f6eed5',offense:'#ffe17b',defense:'#45e7ff'};
const center=(point:Point)=>({x:point.x+.5,y:point.y+.5});

function Marker({kind,from,to,camera,playerId,inactive=false}:{kind:BlockMarkerKind;from:Point;to:Point;camera:PitchProjection;playerId:string;inactive?:boolean}) {
  const geometry=blockMarkerGeometry(kind,center(from),center(to),point=>camera.project(point)!);
  return <g className={`block-signal block-signal-${kind}${inactive?' inactive':''}`}
    style={{'--block-signal':colors[kind]} as CSSProperties} data-block-marker={kind} data-block-contributor={playerId}>
    {geometry.lines.map((line,index)=><path key={index} d={line.path} pathLength={line.style==='trace'?100:undefined}
      className={`block-signal-line ${line.style}${line.phase?` phase-${line.phase}`:''}`} data-trace-side={line.side}/>)}
    {geometry.flare&&<circle cx={geometry.flare.x} cy={geometry.flare.y} r={2.5} className="block-impact-flare"/>}
  </g>;
}

/** Assists are pitch paint below sprites; block directions retain their separate foreground layer. */
export function BlockVisibility({context,camera,layer,animated=true}:{context:BlockContext|null;camera:PitchProjection;layer:'assists'|'blocks';animated?:boolean}) {
  if(!context)return null;
  return <g className={`block-visibility${animated?'':' static'}`} data-block-layer={layer} data-block-target={context.activeTargetPlayerId}>
    {context.blocks.map(block=>{
      const active=block.targetPlayerId===context.activeTargetPlayerId;
      if(layer==='blocks')return <Marker key={`${block.playerId}:${block.targetPlayerId}:${block.from.x},${block.from.y}`} kind="block"
        from={block.from} to={block.to} camera={camera} playerId={block.playerId} inactive={!active}/>;
      if(!active)return null;
      return <g key={block.targetPlayerId}>
        {block.offensiveAssists.map(assist=><Marker key={assist.playerId} kind="offense" from={assist} to={block.to} camera={camera} playerId={assist.playerId}/>)}
        {block.defensiveAssists.map(assist=><Marker key={assist.playerId} kind="defense" from={assist} to={block.from} camera={camera} playerId={assist.playerId}/>)}
      </g>;
    })}
  </g>;
}
