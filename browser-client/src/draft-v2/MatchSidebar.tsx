import { useState } from 'react';

export function MatchSidebar() {
  const [confirm, setConfirm] = useState(false);
  const [turn, setTurn] = useState(4);
  const [log, setLog] = useState(['Turn 4 begins.', 'Alden gains 2 SPP from a casualty.', 'Mira recovers from KO.']);
  const [messages, setMessages] = useState([{ name: 'Opponent', text: 'Good luck, have fun!' }]);
  const [draft, setDraft] = useState('');
  return <aside className="match-sidebar" aria-label="Match tools">
    <section className="turn-tools"><h2>Match controls</h2><button className="end-turn" onClick={() => setConfirm(true)}>End turn ⚑</button>
      {confirm && <div className="end-turn-confirm"><p>End sample turn {turn}? No live game is affected.</p><button onClick={() => { setLog(old => [`Sample turn ${turn} ended.`, ...old]); setTurn(turn + 1); setConfirm(false); }}>Confirm end turn</button><button onClick={() => setConfirm(false)}>Keep playing</button></div>}
      <small>Local interaction demo</small></section>
    <section className="sidebar-log"><h2>Game log</h2><div role="log" aria-label="Sample game log">{log.map((entry, i) => <p key={`${entry}-${i}`}><span>›</span> {entry}</p>)}</div></section>
    <section className="sidebar-chat"><h2>Coach chat</h2><div role="log" aria-label="Sample chat">{messages.map((message, i) => <p key={i}><strong>{message.name}</strong><br/>{message.text}</p>)}</div><form onSubmit={event => { event.preventDefault(); if (!draft.trim()) return; setMessages(old => [...old, { name: 'You', text: draft.trim() }]); setDraft(''); }}><label htmlFor="sample-chat">Message · stays in this browser</label><input id="sample-chat" value={draft} maxLength={300} placeholder="Type a message…" onChange={event => setDraft(event.target.value)}/><button disabled={!draft.trim()}>Send</button></form></section>
    <details className="sidebar-options"><summary>Display options</summary><p>Use Fit or Detail above the pitch to change zoom. Player actions remain below the field.</p></details>
    <small className="sidebar-status">● Preview · no server connection</small>
  </aside>;
}
