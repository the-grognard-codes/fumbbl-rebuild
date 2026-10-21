import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../site/src/assets/site.css';
import '../src/play-brand.css';
import '../src/live-pitch.css';
import '../src/coach-match.css';
import { GameMenu } from '../src/GameMenu.tsx';
import { V2Client } from '../src/v2-client.ts';
import { skillUseCases } from '../src/skill-use-preferences.ts';
import type { SetupState } from '../src/setup-protocol.ts';

const account = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
let serverPreferences = Object.fromEntries(skillUseCases.map(([key, , mode]) => [key, mode]));
let queued: (() => void) | null = null;
let failure = false;
const requests: Record<string, any>[] = [];
class Socket {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(raw: string) {
    const request = JSON.parse(raw); requests.push(request);
    const reply = (fields: Record<string, unknown>) => this.onmessage?.({ data: JSON.stringify({ version: 2, requestId: request.requestId, ...fields }) });
    if (request.type === 'authenticate') queueMicrotask(() => reply({ type: 'authentication', code: 'ACCEPTED', accountId: account }));
    if (request.type === 'skillUsePreferences') {
      const respond = () => {
        if (failure) { failure = false; reply({ type: 'error', code: 'PERSISTENCE_FAILED' }); return; }
        if (request.operation === 'update') serverPreferences = { ...serverPreferences, [request.useCase]: request.mode };
        reply({ type: 'skillUsePreferences', code: 'ACCEPTED', preferences: serverPreferences });
      };
      if (request.operation === 'update') queued = respond;
      else queueMicrotask(respond);
    }
  }
  close() { this.readyState = 3; }
}
function App() {
  const [, redraw] = useState(0);
  const [role, setRole] = useState<'home' | 'spectator'>('home');
  const [replay, setReplay] = useState(false);
  const client = useRef<V2Client | null>(null);
  useEffect(() => {
    const connection = new V2Client({ url: 'ws://fixture/browser/v2', getToken: async () => 'fixture',
      makeSocket() { const socket = new Socket(); queueMicrotask(() => socket.onopen?.()); return socket as unknown as WebSocket; },
      onChange: () => redraw(value => value + 1) });
    client.current = connection; connection.connect(); return () => connection.disconnect();
  }, []);
  (window as any).skillUseFixture = { requests, complete() { const respond = queued; queued = null; respond?.(); },
    failNext() { failure = true; }, spectator() { setRole('spectator'); }, replay() { setReplay(true); },
    disconnect() { client.current?.disconnect(); } };
  const connection = client.current;
  const view = { callerRole: role, phase: 'PLAY' } as SetupState;
  return <div className="coach-match hosted-match"><GameMenu view={view} replay={replay} connected={!!connection?.accountId} pending={false}
    mutate={() => { throw Error('Settings must never mutate gameplay'); }} records={[]} logLoading={false} logUnavailable={false}
    skillUseControls={connection ? { preferences: connection.skillUsePreferences, pending: connection.skillUsePending !== null,
      error: connection.skillUseError, saved: connection.skillUseSaved, load: () => connection.loadSkillUsePreferences(),
      update: (key, mode) => connection.updateSkillUsePreference(key, mode) } : undefined}/></div>;
}
createRoot(document.getElementById('app')!).render(<App/>);
