import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { MatchEventLog } from './MatchEventLog.tsx';
import { MatchWindowControls } from './MatchWindowControls.tsx';
import { readMatchWindowSize, saveMatchWindowSize } from './match-window-size.ts';
import type { MatchWindow, MatchWindowSize } from './match-window-size.ts';
import { useMatchHistoryDock } from './useMatchHistoryDock.ts';
import { MatchTextSizeControls, matchTextPixels, readMatchTextSize, saveMatchTextSize } from './MatchTextSizeControls.tsx';
import type { MatchTextSize } from './MatchTextSizeControls.tsx';
import type { ChatMessage } from './chat-protocol.ts';
import { chatSpeaker } from './chat-speaker.ts';
import type { TranscriptRecord } from './transcript-protocol.ts';
import './match-chat.css';

type Props = {
  stacked?: boolean;
  overlay?: boolean;
  matchId: string; records: TranscriptRecord[]; logLoading: boolean; logUnavailable: boolean;
  homeTeamName?: string; awayTeamName?: string;
  messages: ChatMessage[]; chatLoading: boolean; chatUnavailable: boolean;
  connected: boolean; sending: boolean; canSend: boolean; onSend: (text: string) => void;
  sendError: string; sent: { text: string; id: string } | null;
};

export function MatchHistory(props: Props) {
  const dock = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState(() => ({ chat: readMatchWindowSize('chat'), log: readMatchWindowSize('log') }));
  const docked = Boolean(props.stacked && props.overlay);
  useMatchHistoryDock(dock, docked, sizes.chat, sizes.log);
  const changeSize = (subject: MatchWindow, size: MatchWindowSize) => {
    setSizes(current => ({ ...current, [subject]: size }));
    saveMatchWindowSize(subject, size);
  };
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
  if (props.stacked) return <div ref={dock} className="match-history" aria-label="Match history">
    <section className="match-history-log" data-window-size={docked ? sizes.log : undefined} aria-label="Game log"><MatchEventLog records={props.records} loading={props.logLoading} unavailable={props.logUnavailable} showSettings={!props.overlay}
      minimized={docked && sizes.log === 'minimized'} headerControls={docked && <MatchWindowControls subject="game log" size={sizes.log} onChange={size => changeSize('log', size)}/>}/></section>
    <section className="match-history-chat" data-window-size={docked ? sizes.chat : undefined} aria-label="Chat"><MatchChatPanel key={props.matchId} {...props} active={!docked || sizes.chat !== 'minimized'} overlay={Boolean(props.overlay)}
      windowSize={docked ? sizes.chat : undefined} onWindowSize={size => changeSize('chat', size)}/></section>
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
      <MatchChatPanel {...props} active={tab === 'chat'} overlay={false}/>
    </div>
  </section>;
}

function MatchChatPanel({ matchId, messages, chatLoading, chatUnavailable, connected, sending, canSend, onSend, sendError, sent, active,
  homeTeamName, awayTeamName, overlay, windowSize, onWindowSize }: Props & {
    active: boolean; overlay: boolean; windowSize?: MatchWindowSize; onWindowSize?: (size: MatchWindowSize) => void;
  }) {
  const fontKey = 'ffb.match.chat.font-size';
  const draftKey = `ffb.match.chat.draft.${matchId}`;
  const scrollKey = `ffb.match.chat.scroll.${matchId}`;
  const [draft, setDraft] = useState(() => { try { return sessionStorage.getItem(draftKey) ?? ''; } catch { return ''; } });
  const [entryOpen, setEntryOpen] = useState(false);
  const [fontSize, setFontSize] = useState<MatchTextSize>(() => readMatchTextSize(fontKey));
  const pane = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const entry = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const follow = useRef(true);
  const restored = useRef(false);
  const previousCount = useRef(0);
  const previousActive = useRef(active);
  const position = useRef(0);
  const seenCount = useRef<number | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const markRead = () => {
    const element = pane.current;
    if (!active || !element || chatLoading || element.clientHeight === 0) return;
    if (element.scrollHeight - element.scrollTop - element.clientHeight <= 1) {
      seenCount.current = messages.length;
      setHasUnread(false);
    }
  };
  useLayoutEffect(() => {
    const element = pane.current;
    if (!element) return;
    if (!active) { previousActive.current = false; return; }
    if (!restored.current && !chatLoading) {
      restored.current = true;
      let saved = 0;
      try { saved = Number(sessionStorage.getItem(scrollKey)); } catch { /* Use the latest message. */ }
      if (Number.isFinite(saved) && saved > 0) { element.scrollTop = saved; follow.current = false; }
      else element.scrollTop = element.scrollHeight;
    } else if (!previousActive.current) element.scrollTop = position.current;
    else if (messages.length > previousCount.current && follow.current) element.scrollTop = element.scrollHeight;
    previousActive.current = true;
    position.current = element.scrollTop;
    follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 36;
    previousCount.current = messages.length;
  }, [messages.length, chatLoading, scrollKey, active]);
  useLayoutEffect(() => {
    if (chatLoading) return;
    if (seenCount.current === null) seenCount.current = messages.length;
    else if (messages.length > seenCount.current) setHasUnread(true);
    markRead();
  }, [messages.length, chatLoading, active]);
  useEffect(() => {
    const element = pane.current;
    if (!element || !active) return;
    const observer = new ResizeObserver(markRead);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, messages.length, chatLoading]);
  useEffect(() => { if (!active) setEntryOpen(false); }, [active]);
  const setText = (value: string) => {
    setDraft(value);
    try { sessionStorage.setItem(draftKey, value); } catch { /* Draft remains in memory. */ }
  };
  const chooseFontSize = (size: MatchTextSize) => { setFontSize(size); saveMatchTextSize(fontKey, size); };
  const openEntry = () => {
    if (!active || !overlay || !canSend || chatUnavailable || entryOpen) return;
    previousFocus.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setEntryOpen(true);
    requestAnimationFrame(() => entry.current?.focus());
  };
  useEffect(() => { if (sent && draft.trim() === sent.text) setText(''); }, [sent]);
  useEffect(() => {
    if (!overlay || !active || !canSend || chatUnavailable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('dialog, [role="dialog"]') || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      if (event.key === 'Escape' && entryOpen) {
        event.preventDefault();
        setEntryOpen(false);
        (previousFocus.current?.isConnected ? previousFocus.current : root.current)?.focus();
        return;
      }
      if (event.key !== 'Enter' || target?.closest('input, textarea, select, button, a[href], summary, [contenteditable], [role="button"], [role="link"], [role="textbox"]')) return;
      event.preventDefault();
      openEntry();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overlay, active, canSend, chatUnavailable, entryOpen]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !canSend || !connected || sending) return;
    onSend(text);
  };
  return <div ref={root} className={`match-chat${overlay && entryOpen ? ' composing' : ''}`} data-font-size={fontSize} tabIndex={overlay ? -1 : undefined}>
    <header><h3>{windowSize ? 'Chat' : 'Match chat'}</h3>
      {windowSize && hasUnread && <span className="match-chat-unread" role="status" aria-label="Unread chat messages" title="Unread chat messages">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h14v10H9l-5 4v-4H3z"/></svg>
      </span>}
      {windowSize !== 'minimized' && <MatchTextSizeControls subject="chat" size={fontSize} onChange={chooseFontSize}/>}
      {windowSize && onWindowSize && <MatchWindowControls subject="chat" size={windowSize} onChange={onWindowSize}/>}</header>
    <div ref={pane} role="log" aria-label="Match chat messages" aria-live="polite" className="match-chat-scroll"
      style={{ fontSize: `${matchTextPixels[fontSize]}px` }} onClick={openEntry}
      onScroll={event => { if (!active) return; const element = event.currentTarget; position.current = element.scrollTop;
        follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 36; markRead();
        try { sessionStorage.setItem(scrollKey, String(element.scrollTop)); } catch { /* Scroll position remains in memory. */ } }}>
      {(chatUnavailable || chatLoading) && <p role="status"><strong data-speaker-role="system">Match</strong> {chatUnavailable ? 'Chat is unavailable for this match.' : 'Loading conversation…'}</p>}
      {messages.map(message => <p key={message.index}><time dateTime={new Date(message.at).toISOString()}>{new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        <strong data-speaker-role={message.role}>{chatSpeaker(message, homeTeamName, awayTeamName)}</strong>
        <span>{message.text}</span></p>)}
    </div>
    {overlay && canSend && !chatUnavailable && !entryOpen && <button type="button" className="match-chat-hint" onClick={openEntry}>
      Click chat or press Enter to write
    </button>}
    {canSend && !chatUnavailable && (!overlay || entryOpen) && <form onSubmit={submit}><label htmlFor="match-chat-draft">Message the match</label>
      <div><input ref={entry} id="match-chat-draft" value={draft} onChange={event => setText(event.target.value)} maxLength={300} autoComplete="off" disabled={!connected || sending}/>
        <button type="submit" disabled={!connected || sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</button></div>
      <small>{connected ? sending ? 'Waiting for the server to save this message.' : 'Visible to coaches and spectators.' : 'Reconnect to send.'}</small>
      {sendError && <p role="alert">{sendError}</p>}</form>}
  </div>;
}
