import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { MatchHistory } from '../src/MatchHistory.tsx';
import type { ChatMessage } from '../src/chat-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';
import '../src/live-pitch.css';
import '../src/coach-match.css';

declare global {
  interface Window {
    chatFixture: { messages: ChatMessage[]; records: TranscriptRecord[] };
    chatSent: string[];
    publishChatScenario: (input: { messages: ChatMessage[]; names?: { home: string; away: string }; unavailable?: boolean }) => void;
    publishChatMessages: (messages: ChatMessage[]) => void;
  }
}

function App() {
  const [messages, setMessages] = useState(window.chatFixture.messages);
  const [names, setNames] = useState({ home: 'Rovers', away: 'Crew' });
  const [unavailable, setUnavailable] = useState(false);
  window.publishChatScenario = input => { setMessages(input.messages); setNames(input.names ?? { home: 'Rovers', away: 'Crew' }); setUnavailable(Boolean(input.unavailable)); };
  const [sent, setSent] = useState<{ text: string; id: string } | null>(null);
  window.publishChatMessages = setMessages;
  return <main className="play-runtime live-match-page"><section className="coach-match hosted-match">
    <MatchHistory stacked overlay matchId="00000000-0000-0000-0000-000000000154"
      records={window.chatFixture.records} logLoading={false} logUnavailable={false}
      messages={messages} chatLoading={false} chatUnavailable={unavailable}
      homeTeamName={names.home} awayTeamName={names.away} connected sending={false} canSend sendError="" sent={sent}
      onSend={text => {
        window.chatSent.push(text);
        setSent({ text, id: String(window.chatSent.length) });
        setMessages(current => [...current, { index: current.length, at: Date.now(), revision: 1,
          authorId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'home', text }]);
      }}/>
  </section></main>;
}

createRoot(document.getElementById('app')!).render(<App/>);
