import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeamColorArtProvider } from '../src/TeamColorArtProvider.tsx';
import { LivePitch } from '../src/LivePitch.tsx';
import { LiveDugouts } from '../src/LiveDugouts.tsx';
import { LiveMatchScoreboard } from '../src/LiveMatchScoreboard.tsx';
import { PlayerHoverCard } from '../src/PlayerHoverCard.tsx';
import { RectangularDecisionPrompt } from '../src/RectangularDecisionPrompt.tsx';
import { MatchSplash } from '../src/MatchSplash.tsx';
import { teamColorArt } from '../src/team-color-art.ts';
import type { TeamColors } from '../src/team-colors.ts';
import type { SetupState } from '../src/setup-protocol.ts';
import type { MatchDecision } from '../src/match-decision.ts';
import { playerArtCatalog } from '../src/generated-player-art.ts';
import projections from './fixtures/m5a-blitz-projections.json';
import '../src/match-splash.css';
import '../src/play-brand.css';
import '../src/coach-match.css';
import '../src/ui-round-four.css';

const root = createRoot(document.getElementById('root')!);
type Options = { colors?: TeamColors; awayColors?: TeamColors; historical?: boolean; roster?: 'human' | 'orc'; kind?: 'turnStart' | 'turnover' | 'touchdown'; role?: 'home' | 'away' | 'spectator'; half?: number };
function render(options: Options = {}) {
  const colors = options.historical ? undefined : options.colors ?? { version: 1, primary: 'red', secondary: 'white' };
  const roster = options.roster ?? 'human', positions = Object.keys(playerArtCatalog[roster].positions);
  const initial = projections[0].actor as SetupState;
  const players = Array.from({ length: 22 }, (_, index) => ({ ...initial.players[0], id: `player${index}`, name: `Player ${index}`,
    slot: index % 11 + 1, number: index % 11 + 1, role: index < 11 ? 'home' as const : 'away' as const,
    state: index % 3 === 0 ? 'prone' : index % 3 === 1 ? 'stunned' : 'standing',
    x: index < 11 ? 9 + index % 2 : 15 + index % 2, y: index % 11 + 2,
    art: { rosterId: roster, positionId: positions[index % positions.length] } }));
  const team = { rosterId: roster, league: null, ...(colors ? { colors } : {}) };
  const away = { ...team, ...(options.awayColors ? { colors: options.awayColors } : {}) };
  const view = { ...initial, matchId: 'colors-review', callerRole: options.role ?? 'spectator', half: options.half ?? 1, phase: 'PLAY', actions: [],
    activePlayerId: null, homeTeamArt: team, awayTeamArt: away, players } as SetupState;
  const reserve = { ...players[0], x: null, y: null, offPitch: 'reserve' as const };
  const decision = { key: 'interception', kind: 'interception', title: 'Choose interceptor', options: [{ id: 'player0', label: 'Player 0', kind: 'choice', targetPlayerId: 'player0' }] } as MatchDecision;
  root.render(<TeamColorArtProvider home={team} away={away}>
    <main className="play-runtime live-match-page"><div className="coach-match hosted-match">
    <LiveMatchScoreboard view={view}/>
    <div className="match-layout"><div className="match-board">
    <LivePitch view={view} selectedId="" actions={[]} readOnly allowEndChoice onSelectPlayer={() => {}} onSquare={() => {}}/>
    </div>
    <LiveDugouts players={[reserve]} onSelect={() => {}}/>
    <PlayerHoverCard player={reserve} anchor={new DOMRect(0, 0, 80, 80)} teamName="Review" dock="left"/>
    <RectangularDecisionPrompt decision={decision} players={players} disabled={false} onChoice={() => {}} onAction={() => {}}/>
    {options.kind && <MatchSplash announcement={{ id: 'review', kind: options.kind, team: 'home', turn: 1, half: 1, reason: null, teamName: 'Review', helmet: roster }} onDismiss={() => {}} hold={false} exiting={false} rate={1}/>}
    </div></div></main>
  </TeamColorArtProvider>);
}
Object.assign(window, { colorReview: { render, unmount: () => root.render(null), diagnostics: () => teamColorArt.diagnostics } });
render();
