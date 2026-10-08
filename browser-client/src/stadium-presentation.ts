import { stadiumModules as stadiumAtlases, modularStadiumVenues as stadiumVenues,
  modularStadiumTeams as stadiumTeams, stadiumGeometry } from './generated-stadium-modules.ts';
import type { MatchTeamArt, SetupState } from './setup-protocol.ts';
import type {PitchEnd} from './pitch-projection.ts';
export { stadiumGeometry };
export type StadiumProfile = (typeof stadiumAtlases)[keyof typeof stadiumAtlases];
export type StadiumRole = keyof StadiumProfile['regions'];
export const SIDELINE_MARGIN=stadiumGeometry.apron;
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
