import { createRoot } from 'react-dom/client';
import { Profiler, useLayoutEffect } from 'react';
import { DiagnosticsBoundary, useDiagnostics, useDiagnosticPresentation } from '../src/PerformanceDiagnostics.tsx';
import { GameView } from '../src/GameView.tsx';
import { HostedResult } from '../src/HostedResult.tsx';
import initial from './fixtures/m5a-blitz-projections.json';
import '../../site/src/assets/site.css';
if (!import.meta.env.DEV) throw Error('Test harness only');
function PresentationProbe() {
  const probe = window as unknown as { diagnosticProbeRenders?: number };
  probe.diagnosticProbeRenders = (probe.diagnosticProbeRenders ?? 0) + 1;
  useDiagnosticPresentation(0, 0, false, false, false, false);
  return null;
}
function Board() {
  const service = useDiagnostics()?.service;
  useLayoutEffect(() => { Object.assign(window, { diagnosticService: service }); }, [service]);
  if (new URLSearchParams(location.search).has('replay')) return <HostedResult matchId={initial[0].actor.matchId} result={null} event={null} index={null} pending={false} connected={false}
    onLoad={() => {}} onReplay={() => {}} logRecords={[]} logLoading={false} logUnavailable={false} chatMessages={[]} chatLoading={false} chatUnavailable={false}/>;
  return <Profiler id="diagnostic-board" onRender={(_id, _phase, duration) => {
    const profile = (window as unknown as { diagnosticProfile?: { recording: boolean; renders: number[] } }).diagnosticProfile;
    if (profile?.recording && profile.renders.length < 1000) profile.renders.push(duration);
  }}><GameView hosted view={initial[0].actor} connected pending={null} mutate={() => {}}/></Profiler>;
}
createRoot(document.getElementById('app')!).render(<DiagnosticsBoundary environment={new URLSearchParams(location.search).get('environment') ?? undefined}>
  <main className="play-runtime live-match-page"><PresentationProbe/><Board/></main>
</DiagnosticsBoundary>);
