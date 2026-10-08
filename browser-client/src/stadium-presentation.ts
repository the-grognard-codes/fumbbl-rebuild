import { stadiumModules as stadiumAtlases, modularStadiumVenues as stadiumVenues,
  modularStadiumTeams as stadiumTeams, stadiumGeometry } from './generated-stadium-modules.ts';
import type { MatchTeamArt, SetupState } from './setup-protocol.ts';
import type { PitchEnd } from './pitch-projection.ts';
export { stadiumGeometry };
export type StadiumProfile = (typeof stadiumAtlases)[keyof typeof stadiumAtlases];
export type StadiumRole = keyof StadiumProfile['regions'];
export const SIDELINE_MARGIN=stadiumGeometry.apron;
export const STADIUM_ROWS=stadiumGeometry.crowdRows;
export const STADIUM_RECESSES=[
  ...stadiumGeometry.benches.map(b=>({...b,role:'bench' as const,start:b.x-b.along/2,end:b.x+b.along/2,depth:2})),
  {...stadiumGeometry.pavilion,role:'pavilion' as const,start:stadiumGeometry.pavilion.x-stadiumGeometry.pavilion.along/2,
    end:stadiumGeometry.pavilion.x+stadiumGeometry.pavilion.along/2,depth:4},
];
/** Decorative phases are fixed world facts, independent of turns and camera travel. */
export function stadiumMotion(role: StadiumRole,x:number,y:number) {
  const seed=Math.abs(Math.round(x*10)*17+Math.round(y*10)*31);
  const kind=role==='torch'||role==='torchTop'?'fire-flicker':role==='pennant'?'wind':'static';
  return {kind,delay:-(seed%120)/20,duration:kind==='fire-flicker'?1.8+(seed%4)*.2:4+(seed%4)*.5};
}
const fallback=stadiumAtlases['old-world-classic'];
/** Venue ownership and supporter ownership deliberately use independent catalogs. */
export function stadiumPresentation(view: Pick<SetupState,'homeTeamArt'|'awayTeamArt'>) {
  const diagnostics:string[]=[];
  const team=(identity:MatchTeamArt|undefined,role:PitchEnd)=>{
    const id=identity&&Object.hasOwn(stadiumTeams,identity.rosterId)?stadiumTeams[identity.rosterId]:undefined;
    if(!id)diagnostics.push('Missing '+role+' supporter profile for '+(identity?.rosterId??'legacy team')+'; using Human placeholder');
    return id?stadiumAtlases[id]:fallback;
  };
  const league=view.homeTeamArt?.league,venueId=league&&Object.hasOwn(stadiumVenues,league)?stadiumVenues[league]:undefined;
  if(!venueId)diagnostics.push('Missing venue for '+(league??'legacy home League')+'; using Old World Classic');
  return {venue:venueId?stadiumAtlases[venueId]:fallback,home:team(view.homeTeamArt,'home'),
    away:team(view.awayTeamArt,'away'),league:venueId?league:'Old World Classic',fallback:!venueId,diagnostics};
}
export type StadiumSeat={id:string;x:number;y:number;span:number;row:number;team:PitchEnd;side:'north'|'south'|PitchEnd};
export function stadiumSeats():StadiumSeat[] {
  const seats:StadiumSeat[]=[];
  const span=stadiumGeometry.crowdSpan;
  for(let row=0;row<STADIUM_ROWS;row++){
    for(const side of ['north','south'] as const)for(const [start,end,team] of [[-2,13,'home'],[13,28,'away']] as const){
      for(let from=start;from<end;from+=1.5){
        const to=Math.min(end,from+1.5),x=(from+to)/2;
        const y=side==='north'?-2.65-row*.85:17.65+row*.85;
        if(STADIUM_RECESSES.some(r=>r.side===side&&row<r.depth&&to>r.start&&from<r.end))continue;
        seats.push({id:side+'-'+row+'-'+from,x,y,span:to-from,row,team,side});
      }
    }
    for(const side of ['home','away'] as const)for(let from=-6;from<21;from+=span){
      const to=Math.min(21,from+span);
      seats.push({id:side+'-'+row+'-'+from,x:side==='home'?-3.25-row*.75:29.25+row*.75,
        y:(from+to)/2,span:to-from,row,team:side,side});
    }
  }
  return seats;
}
