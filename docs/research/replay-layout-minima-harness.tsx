import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HostedResult } from '../../browser-client/src/HostedResult.tsx';
import '../../site/src/assets/site.css';
import '../../browser-client/src/play-brand.css';

const fixture = (window as any).replayFixture;
function Harness() {
  const [index, setIndex] = useState(3);
  const record = fixture.records[index];
  return <main className="play-runtime setup-panel live-match-page">
    <div className="match-page-top"><div><h1>Match result</h1><p role="status">Connected</p></div></div>
    <HostedResult matchId={fixture.state.matchId} result={fixture.result}
      event={{ revision: index, kind: record.kind, state: record.state }} index={index} pending={false} connected
      onLoad={() => { (window as any).replayCalls.push('load'); }}
      onReplay={value => { (window as any).replayCalls.push(value); setIndex(value); }}
      logRecords={fixture.records} logLoading={false} logUnavailable={false}
      chatMessages={fixture.chat} chatLoading={false} chatUnavailable={false}/>
  </main>;
}
createRoot(document.getElementById('app')!).render(<Harness/>);
