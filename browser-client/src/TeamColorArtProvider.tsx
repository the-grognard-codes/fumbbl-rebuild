import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { teamColorArt } from './team-color-art.ts';
import type { MatchTeamArt } from './setup-protocol.ts';
import type { TeamColors } from './team-colors.ts';

const Context = createContext<{ home?: TeamColors; away?: TeamColors; revision?: number }>({});
export function TeamColorArtProvider({ home, away, children }: { home?: MatchTeamArt; away?: MatchTeamArt; children: ReactNode }) {
  const revision = useSyncExternalStore(teamColorArt.subscribe, teamColorArt.snapshot);
  useEffect(() => teamColorArt.retain(), []);
  useEffect(() => { if (home?.colors) void teamColorArt.load(home.rosterId); if (away?.colors) void teamColorArt.load(away.rosterId); },
    [home?.rosterId, !!home?.colors, away?.rosterId, !!away?.colors]);
  return <Context.Provider value={{ home: home?.colors, away: away?.colors, revision }}>{children}</Context.Provider>;
}
export function useTeamColorContext() { return useContext(Context); }
