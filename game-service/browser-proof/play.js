// Retained historical H2 session proof; not included in the active site build.
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { authentication } from './auth-client.js';

const inviteKey = 'moles-play-invite-code';
const invitePattern = /^[a-f0-9]{32}$/;
const loginPath = '/login?returnTo=%2Fplay';

export class SessionClient {
  constructor({ url, getToken, makeSocket, onStatus, onSession, onEvent, onAuthenticated, onReauthenticate, schedule = (callback, delay) => globalThis.setTimeout(callback, delay) }) {
    this.url = url;
    this.getToken = getToken;
    this.makeSocket = makeSocket;
    this.onStatus = onStatus;
    this.onSession = onSession;
    this.onEvent = onEvent;
    this.onAuthenticated = onAuthenticated;
    this.onReauthenticate = onReauthenticate;
    this.schedule = schedule;
    this.socket = null;
    this.authenticated = false;
    this.previouslyAuthenticated = false;
    this.stopped = false;
    this.activeCode = null;
    this.retryDelay = 1000;
    this.refreshAttempted = false;
  }

  connect() {
    if (this.stopped) return;
    this.authenticated = false;
    this.onStatus('Connecting to the game session…');
    const socket = this.makeSocket(this.url);
    this.socket = socket;
    socket.onopen = async () => {
      try {
        const token = await this.getToken(true);
        if (this.socket !== socket || this.stopped) return;
        socket.send(JSON.stringify({ type: 'authenticate', token }));
        this.onStatus('Authenticating game session…');
      } catch {
        this.reauthenticate();
      }
    };
    socket.onmessage = event => this.receive(socket, event.data);
    socket.onclose = event => this.closed(socket, event.code);
    socket.onerror = () => { if (socket === this.socket && !this.stopped) this.onStatus('Game session disconnected.'); };
  }

  receive(socket, raw) {
    if (socket !== this.socket || this.stopped) return;
    let message;
    try { message = JSON.parse(raw); } catch { this.reject('invalid_message'); return; }
    if (message.type === 'authenticated') {
      this.authenticated = true;
      this.previouslyAuthenticated = true;
      this.refreshAttempted = false;
      this.retryDelay = 1000;
      this.onStatus('Connected. Waiting for both players.');
      if (this.activeCode) this.send({ type: 'join', code: this.activeCode });
      if (this.onAuthenticated) this.onAuthenticated();
      return;
    }
    if (message.type === 'session') {
      if (invitePattern.test(message.code || '')) this.activeCode = message.code;
      const status = this.onSession(message);
      if (status) this.onStatus(status);
      return;
    }
    if (['joined', 'left', 'reconnected', 'chat'].includes(message.type)) {
      this.onEvent(message);
      return;
    }
    if (message.type === 'error') this.reject(message.code);
  }

  closed(socket, code) {
    if (socket !== this.socket || this.stopped) return;
    this.socket = null;
    this.authenticated = false;
    if (code === 4009 && this.previouslyAuthenticated) {
      this.onStatus('Previous connection is still closing. Reconnecting…');
      return this.retry();
    }
    if (code === 4001 || code === 4009) return this.reject('rejected');
    if (code === 4003) return this.expired();
    this.onStatus('Game session disconnected. Reconnecting…');
    this.retry();
  }

  retry() {
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 16000);
    this.schedule(() => this.connect(), delay);
  }

  reject(code) {
    if (code === 'expired') return this.expired();
    if (code === 'rejected' || code === 'already_connected') {
      this.stopped = true;
      this.authenticated = false;
      if (this.socket) this.socket.close();
      this.onStatus('Game session rejected.');
      return;
    }
    if (code === 'already_in_session') this.onStatus('This game session has a connection conflict.');
    else if (code === 'capacity_reached') this.onStatus('Game session capacity has been reached.');
    else if (code === 'session_full') this.onStatus('That game session is full.');
    else if (code === 'session_not_found') this.onStatus('That game session was not found.');
    else if (code === 'invitation_expired') this.onStatus('That invitation has expired.');
    else if (code === 'invitation_revoked') this.onStatus('That invitation is no longer valid.');
    else if (code === 'invitation_not_pending') this.onStatus('The invitation can no longer be refreshed.');
    else if (code === 'opponent_not_releasable') this.onStatus('Only a disconnected opponent can be released.');
    else if (code === 'not_session_creator') this.onStatus('Only the game creator can change this invitation.');
    else if (code === 'rate_limited') this.onStatus('Please wait before trying again.');
    else this.onStatus('Game session rejected.');
  }

  expired() {
    if (this.refreshAttempted) return this.reauthenticate();
    this.refreshAttempted = true;
    this.onStatus('Your game session expired. Refreshing sign-in…');
    const socket = this.socket;
    this.socket = null;
    this.authenticated = false;
    if (socket) socket.close();
    this.connect();
  }

  reauthenticate() {
    this.stopped = true;
    if (this.socket) this.socket.close();
    this.onStatus('Sign-in required to continue.');
    this.onReauthenticate();
  }

  send(message) {
    if (!this.authenticated || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.onStatus('Waiting for an authenticated game session.');
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  stop() {
    this.stopped = true;
    this.authenticated = false;
    const socket = this.socket;
    this.socket = null;
    if (socket) socket.close();
  }

  clearSession() {
    this.activeCode = null;
  }
}

export class SpectatorClient {
  constructor({ url, getToken, makeSocket, onStatus, onBrowse, onState }) { Object.assign(this, { url, getToken, makeSocket, onStatus, onBrowse, onState }); this.socket = null; }
  connect() {
    const socket = this.makeSocket(this.url); this.socket = socket;
    socket.onopen = async () => { try { socket.send(JSON.stringify({ version: 2, type: 'authenticate', requestId: crypto.randomUUID(), bearer: await this.getToken(true) })); } catch { this.onStatus('Spectator sign-in is unavailable.'); } };
    socket.onmessage = event => this.receive(event.data);
    socket.onclose = () => { if (this.socket === socket) this.onStatus('Spectator list disconnected.'); };
  }
  receive(raw) {
    let message; try { message = JSON.parse(raw); } catch { return this.onStatus('Spectator response was invalid.'); }
    if (message.version !== 2) return this.onStatus('Spectator protocol is unavailable.');
    if (message.type === 'authentication' && message.code === 'ACCEPTED') { this.onStatus('Choose a game to watch.'); this.send('spectatorBrowse'); }
    else if (message.type === 'spectatorBrowse' && message.code === 'ACCEPTED') this.onBrowse(Array.isArray(message.matches) ? message.matches : []);
    else if (message.type === 'spectatorState' && message.code === 'ACCEPTED') this.onState(message.state);
    else if (message.type === 'spectatorError') this.onStatus(message.code === 'NOT_FOUND' ? 'That game is no longer available to watch.' : 'Spectator access was not granted.');
  }
  send(type, matchId) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ version: 2, type, requestId: crypto.randomUUID(), ...(matchId ? { matchId } : {}) })); }
  watch(matchId) { this.send('spectatorWatch', matchId); }
  stop() { this.socket?.close(); this.socket = null; }
}

function displayPlayPage() {
  const status = document.querySelector('#play-status');
  const code = document.querySelector('#session-code');
  const you = document.querySelector('#you-slot');
  const opponent = document.querySelector('#opponent-slot');
  const inviteLink = document.querySelector('#invite-link');
  const refreshInvite = document.querySelector('#refresh-invite');
  const releaseOpponent = document.querySelector('#release-opponent');
  const events = document.querySelector('#session-events');
  const spectatorPanel = document.querySelector('#spectator-panel');
  const spectatorStatus = document.querySelector('#spectator-status');
  const spectatorList = document.querySelector('#spectator-list');
  const spectatorView = document.querySelector('#spectator-view');
  let selfSlot = 0;
  const show = value => { status.textContent = value; };
  const appendEvent = event => {
    const item = document.createElement('li');
    const label = event.slot === undefined ? '' : event.slot === selfSlot ? 'You: ' : 'Opponent: ';
    item.textContent = label + (event.type === 'chat' ? String(event.text || '') : event.type);
    events.append(item);
  };
  let auth;
  let config;
  try {
    ({ auth, config } = authentication());
  } catch (error) {
    show(error.message);
    return;
  }
  if (typeof config.gameWebSocketUrl !== 'string' || !config.gameWebSocketUrl.startsWith('wss://')) {
    show('Game session configuration is unavailable.');
    return;
  }
  const hashCode = window.location.hash.slice(1);
  let pendingInvite = invitePattern.test(hashCode) ? hashCode : sessionStorage.getItem(inviteKey);
  if (invitePattern.test(pendingInvite || '')) sessionStorage.setItem(inviteKey, pendingInvite);
  let client;
  let spectator;
  let reauthenticating = false;
  const send = message => client ? client.send(message) : show('Sign-in required to continue.');
  document.querySelector('#create-session').addEventListener('click', () => send({ type: 'create' }));
  document.querySelector('#join-session').addEventListener('click', () => {
    const value = document.querySelector('#join-code').value.trim();
    if (invitePattern.test(value)) send({ type: 'join', code: value }); else show('Enter a valid game session code.');
  });
  document.querySelector('#send-chat').addEventListener('click', () => {
    const input = document.querySelector('#chat-text');
    if (input.value.trim() && send({ type: 'chat', text: input.value.trim() })) input.value = '';
  });
  document.querySelector('#leave-session').addEventListener('click', () => send({ type: 'leave' }));
  refreshInvite.addEventListener('click', () => send({ type: 'reissue' }));
  releaseOpponent.addEventListener('click', () => send({ type: 'releaseOpponent' }));
  onAuthStateChanged(auth, user => {
    if (client) { client.stop(); client = null; }
    if (spectator) { spectator.stop(); spectator = null; }
    if (!user) {
      if (!reauthenticating) window.location.replace(loginPath);
      return;
    }
    client = new SessionClient({
      url: config.gameWebSocketUrl,
      getToken: force => user.getIdToken(force),
      makeSocket: url => new WebSocket(url),
      onStatus: show,
      onSession: session => {
        code.textContent = session.code || '';
        const slots = Array.isArray(session.slots) ? session.slots : [];
        const self = session.selfSlot === 1 ? 1 : 0;
        selfSlot = self;
        you.textContent = slots[self] && slots[self].connected ? 'You: connected' : 'You: waiting';
        opponent.textContent = slots[1 - self] && slots[1 - self].connected ? 'Opponent: connected' : 'Opponent: waiting';
        const isCreator = self === 0;
        const opponentSlot = slots[1];
        refreshInvite.hidden = !isCreator || Boolean(opponentSlot && opponentSlot.occupied);
        releaseOpponent.hidden = !isCreator || !Boolean(opponentSlot && opponentSlot.occupied && !opponentSlot.connected);
        if (invitePattern.test(session.code || '')) {
          sessionStorage.setItem(inviteKey, session.code);
          history.replaceState(null, '', `/play#${session.code}`);
          inviteLink.href = `/play#${session.code}`;
          inviteLink.textContent = 'Share invite link';
          inviteLink.hidden = false;
        }
        events.replaceChildren();
        (Array.isArray(session.events) ? session.events : []).forEach(appendEvent);
        return slots[0]?.connected && slots[1]?.connected ? 'Both players joined.' : 'Waiting for opponent.';
      },
      onEvent: event => {
        appendEvent(event);
        if (event.type === 'left' && event.slot === undefined) {
          client.clearSession();
          sessionStorage.removeItem(inviteKey);
          history.replaceState(null, '', '/play');
          code.textContent = '';
          inviteLink.hidden = true;
          refreshInvite.hidden = true;
          releaseOpponent.hidden = true;
          you.textContent = 'You: waiting';
          opponent.textContent = 'Opponent: waiting';
          show('Connected. Create or join a session.');
        }
      },
      onAuthenticated: () => {
        if (invitePattern.test(pendingInvite || '')) {
          const invite = pendingInvite;
          pendingInvite = null;
          client.send({ type: 'join', code: invite });
          sessionStorage.removeItem(inviteKey);
        }
      },
      onReauthenticate: () => {
        reauthenticating = true;
        signOut(auth)
          .catch(() => {})
          .finally(() => window.location.replace(`${loginPath}&reason=expired`));
      }
    });
    client.connect();
    if (typeof config.spectatorWebSocketUrl === 'string' && config.spectatorWebSocketUrl.startsWith('wss://')) {
      spectatorPanel.hidden = false;
      spectator = new SpectatorClient({ url: config.spectatorWebSocketUrl, getToken: force => user.getIdToken(force), makeSocket: url => new WebSocket(url), onStatus: value => { spectatorStatus.textContent = value; }, onBrowse: matches => {
        spectatorList.replaceChildren();
        if (!matches.length) spectatorStatus.textContent = 'No games are available to watch.';
        matches.forEach(match => { const button = document.createElement('button'); button.type = 'button'; button.textContent = match.label === 'Home vs Away' ? match.label : 'Home vs Away'; button.addEventListener('click', () => spectator.watch(match.matchId)); spectatorList.append(button); });
      }, onState: state => {
        if (!state || !Array.isArray(state.players)) return; spectatorView.hidden = false;
        document.querySelector('#spectator-score').textContent = `Home ${state.homeScore} â€“ ${state.awayScore} Away`;
        document.querySelector('#spectator-phase').textContent = state.phase === 'PLAY' ? `Half ${state.half}, drive ${state.drive}` : 'Game in progress';
        const pitch = document.querySelector('#spectator-pitch'); pitch.replaceChildren();
        for (let index = 0; index < 13 * 15; index += 1) { const cell = document.createElement('span'); cell.className = 'spectator-cell'; const x = index % 13; const y = Math.floor(index / 13); const player = state.players.find(item => item.x === x && item.y === y); if (player) cell.dataset.role = player.role; if (state.ball && state.ball.x === x && state.ball.y === y) cell.classList.add('ball'); pitch.append(cell); }
      } });
      spectator.connect();
    }
  });
}

if (typeof document !== 'undefined') displayPlayPage();
