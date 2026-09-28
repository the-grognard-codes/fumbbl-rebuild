import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { MatchEventLog } from './MatchEventLog.tsx';
import type { ChatMessage } from './chat-protocol.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';

type Props = {
  stacked?: boolean;
  matchId: string; records: TranscriptRecord[]; logLoading: boolean; logUnavailable: boolean;
  messages: ChatMessage[]; chatLoading: boolean; chatUnavailable: boolean;
  connected: boolean; sending: boolean; canSend: boolean; onSend: (text: string) => void;
  sendError: string; sent: { text: string; id: string } | null;
};

export function MatchHistory(props: Props) {
  const [tab, setTab] = useState<'log' | 'chat'>('log');
  const [unread, setUnread] = useState(0);
  const seen = useRef<number | null>(null);
  const logTab = useRef<HTMLButtonElement>(null);
  const chatTab = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (props.chatLoading) return;
    if (seen.current === null) { seen.current = props.messages.length; return; }
    if (tab === 'chat' || props.stacked) { seen.current = props.messages.length; setUnread(0); }
    else if (props.messages.length > seen.current) setUnread(props.messages.length - seen.current);
  }, [props.messages.length, props.chatLoading, props.stacked, tab]);
  if (props.stacked) return <div className="match-history" aria-label="Match history">
    <section className="match-history-log" aria-label="Game log"><MatchEventLog records={props.records} loading={props.logLoading} unavailable={props.logUnavailable}/></section>
    <section className="match-history-chat" aria-label="Chat"><MatchChatPanel {...props} active/></section>
  </div>;
  return <section className="match-history" aria-label="Match history">
    <div className="match-history-tabs" role="tablist" aria-label="History view" onKeyDown={event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const next = tab === 'log' ? 'chat' : 'log';
      setTab(next); (next === 'log' ? logTab : chatTab).current?.focus();
    }}>
      <button ref={logTab} type="button" role="tab" id="match-log-tab" aria-controls="match-log-panel" aria-selected={tab === 'log'} tabIndex={tab === 'log' ? 0 : -1} onClick={() => setTab('log')}>Log</button>
      <button ref={chatTab} type="button" role="tab" id="match-chat-tab" aria-controls="match-chat-panel" aria-selected={tab === 'chat'} tabIndex={tab === 'chat' ? 0 : -1} onClick={() => setTab('chat')}>Chat{unread ? ` (${unread} new)` : ''}</button>
    </div>
    <div id="match-log-panel" role="tabpanel" aria-labelledby="match-log-tab" hidden={tab !== 'log'}>
      <MatchEventLog records={props.records} loading={props.logLoading} unavailable={props.logUnavailable}/>
    </div>
    <div id="match-chat-panel" role="tabpanel" aria-labelledby="match-chat-tab" hidden={tab !== 'chat'}>
      <MatchChatPanel {...props} active={tab === 'chat'}/>
    </div>
  </section>;
}

function MatchChatPanel({ matchId, messages, chatLoading, chatUnavailable, connected, sending, canSend, onSend, sendError, sent, active }: Props & { active: boolean }) {
  const draftKey = `ffb.match.chat.draft.${matchId}`;
  const scrollKey = `ffb.match.chat.scroll.${matchId}`;
  const [draft, setDraft] = useState(() => { try { return sessionStorage.getItem(draftKey) ?? ''; } catch { return ''; } });
  const pane = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const restored = useRef(false);
  const previousCount = useRef(0);
  useLayoutEffect(() => {
    const element = pane.current;
    if (!element || !active) return;
    if (!restored.current && !chatLoading) {
      restored.current = true;
      let saved = 0;
      try { saved = Number(sessionStorage.getItem(scrollKey)); } catch { /* Use the latest message. */ }
      if (Number.isFinite(saved) && saved > 0) { element.scrollTop = saved; follow.current = false; }
      else element.scrollTop = element.scrollHeight;
    } else if (messages.length > previousCount.current && follow.current) element.scrollTop = element.scrollHeight;
    previousCount.current = messages.length;
  }, [messages.length, chatLoading, scrollKey, active]);
  const setText = (value: string) => {
    setDraft(value);
    try { sessionStorage.setItem(draftKey, value); } catch { /* Draft remains in memory. */ }
  };
  useEffect(() => { if (sent && draft.trim() === sent.text) setText(''); }, [sent]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !canSend || !connected || sending) return;
    onSend(text);
  };
  return <div className="match-chat">
    <header><h3>Match chat</h3><div><button type="button" onClick={() => { if (pane.current) { pane.current.scrollTop = 0; follow.current = false; } }}>Start</button>
      <button type="button" onClick={() => { if (pane.current) { pane.current.scrollTop = pane.current.scrollHeight; follow.current = true; } }}>Latest</button></div></header>
    <p className="match-chat-count">{chatUnavailable ? 'Chat is unavailable for this match.' : chatLoading ? 'Loading conversation…' : `${messages.length} messages`}</p>
    <div ref={pane} role="log" aria-label="Match chat messages" aria-live="polite" className="match-chat-scroll"
      onScroll={event => { const element = event.currentTarget; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 36;
        try { sessionStorage.setItem(scrollKey, String(element.scrollTop)); } catch { /* Scroll position remains in memory. */ } }}>
      {messages.map(message => <p key={message.index}><time dateTime={new Date(message.at).toISOString()}>{new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        <strong>{message.role === 'spectator' ? 'Spectator' : `${message.role === 'home' ? 'Home' : 'Away'} coach`} · {message.authorId.slice(0, 8)}</strong>
        <span>{message.text}</span></p>)}
    </div>
    {canSend && !chatUnavailable && <form onSubmit={submit}><label htmlFor="match-chat-draft">Message the match</label>
      <div><input id="match-chat-draft" value={draft} onChange={event => setText(event.target.value)} maxLength={300} autoComplete="off" disabled={!connected || sending}/>
        <button type="submit" disabled={!connected || sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</button></div>
      <small>{connected ? sending ? 'Waiting for the server to save this message.' : 'Visible to coaches and spectators.' : 'Reconnect to send.'}</small>
      {sendError && <p role="alert">{sendError}</p>}</form>}
  </div>;
}
