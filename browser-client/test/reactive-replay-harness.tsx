import { createRoot } from 'react-dom/client';
import { HostedResult } from '../src/HostedResult.tsx';
import type { SetupState } from '../src/setup-protocol.ts';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';

declare global { interface Window { reactionReplayState: SetupState } }
const state = window.reactionReplayState;
createRoot(document.getElementById('app')!).render(<HostedResult matchId={state.matchId}
  result={{ formatVersion: 1, engineVersion: 'ffb-3.4.0-bb2025-m3d.1', ruleset: 'BB2025', catalogVersion: 'fixture',
    presetId: 'exhibition-1150', presetVersion: 'fixture', matchId: state.matchId, homeScore: 0, awayScore: 0,
    finalRevision: state.revision, eventCount: state.revision + 1 }}
  event={{ revision: state.revision, kind: 'ACTION', state }} index={state.revision} pending={false} connected
  onLoad={() => {}} onReplay={() => {}} logRecords={[]} logLoading={false} logUnavailable={false}
  chatMessages={[]} chatLoading={false} chatUnavailable={false}/>);
