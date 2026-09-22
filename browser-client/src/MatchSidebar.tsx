import { FormEvent, useState } from 'react';

import { spriteUrl } from './pitch-demo';
import type { DemoPlayer } from './pitch-demo';

type MatchSidebarProps = {
  selected: DemoPlayer | null;
  events: string[];
  turn: number;
  onEndTurn: () => void;
  onInspect: () => void;
};

type ChatMessage = {
  id: number;
  text: string;
};

const MAX_CHAT_MESSAGES = 12;
const MAX_CHAT_LENGTH = 180;

export function MatchSidebar({ selected, events, turn, onEndTurn, onInspect }: MatchSidebarProps) {
  const [isConfirmingEndTurn, setIsConfirmingEndTurn] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const submitChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;

    setChatMessages(messages => [...messages, { id: Date.now(), text }].slice(-MAX_CHAT_MESSAGES));
    setChatDraft('');
  };

  const confirmEndTurn = () => {
    onEndTurn();
    setIsConfirmingEndTurn(false);
  };

  return (
    <aside className="match-sidebar" aria-label="Match sidebar">
      <section className="turn-tools" aria-labelledby="turn-tools-heading">
        <h2 id="turn-tools-heading" className="sidebar-heading">Turn {turn}</h2>
        <button className="end-turn" type="button" onClick={() => setIsConfirmingEndTurn(true)}>
          End turn
        </button>
        {isConfirmingEndTurn && (
          <div className="end-turn-confirm" role="alert">
            <p>End turn {turn}?</p>
            <button type="button" onClick={confirmEndTurn}>Confirm end turn</button>
            <button type="button" onClick={() => setIsConfirmingEndTurn(false)}>Keep playing</button>
          </div>
        )}
      </section>

      <section aria-labelledby="selected-player-heading">
        <h2 id="selected-player-heading" className="sidebar-heading">Selected player</h2>
        {selected ? (
          <div className="selected-player-panel">
            <img className="selected-player-portrait" src={spriteUrl(selected.sprite, selected.team)} alt={`${selected.name}, ${selected.position}`} />
            <div>
              <strong>#{selected.number} {selected.name}</strong>
              <p>{selected.team} · {selected.position}</p>
              <p>{selected.zone} · MA {selected.stats[0]} · ST {selected.stats[1]}</p>
              <p>{selected.skills}</p>
              <button type="button" onClick={onInspect} aria-label={`Inspect ${selected.name}`}>Inspect player</button>
            </div>
          </div>
        ) : (
          <div className="empty-player-panel">Select a player on the pitch to view their details.</div>
        )}
      </section>

      <section className="sidebar-log" aria-labelledby="game-log-heading">
        <h2 id="game-log-heading" className="sidebar-heading">Game log</h2>
        <div role="log" aria-live="polite" aria-label="Game log">
          {events.length ? events.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>) : <p>No match events yet.</p>}
        </div>
      </section>

      <section className="sidebar-chat" aria-labelledby="coach-chat-heading">
        <h2 id="coach-chat-heading" className="sidebar-heading">Coach chat</h2>
        <div role="log" aria-live="polite" aria-label="Local coach chat">
          {chatMessages.length ? chatMessages.map(message => <p key={message.id}><strong>You</strong>: {message.text}</p>) : <p>Messages stay in this browser.</p>}
        </div>
        <form onSubmit={submitChat}>
          <label htmlFor="sidebar-chat-message">Message</label>
          <input
            id="sidebar-chat-message"
            value={chatDraft}
            maxLength={MAX_CHAT_LENGTH}
            placeholder="Type a local note…"
            onChange={event => setChatDraft(event.target.value)}
          />
          <button type="submit" disabled={!chatDraft.trim()}>Send</button>
        </form>
      </section>

      <small className="sidebar-status">Preview mode · local interactions only</small>
    </aside>
  );
}
