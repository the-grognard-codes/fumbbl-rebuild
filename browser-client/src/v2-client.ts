import { decodeSetupStateValue } from './setup-protocol.ts';
import type { SetupState } from './setup-protocol.ts';
import { decodeSavedTeam, parseUniqueJson } from './saved-team-protocol.ts';
import { decodePreparedMatch } from './prepared-match-protocol.ts';
import { assertV2Projection } from './v2-projection.ts';

export type V2Message = Record<string, any>;
export type PendingIntent = { accountId: string; request: V2Message };
type ClientOptions = {
  url: string; getToken: () => Promise<string>; onChange: (message: V2Message) => void;
  makeSocket?: (url: string) => WebSocket; storage?: Storage;
};
export const v2PendingKey = 'ffb.intent.v2';
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const uncertain = new Set(['PERSISTENCE_FAILED', 'MATCH_OUTCOME_UNKNOWN', 'COMPLETION_PENDING', 'SAVE_OUTCOME_UNKNOWN']);

/** Single connection and exact-intent recovery for both playing and watching. */
export class V2Client {
  private socket: WebSocket | null = null;
  private requests = new Map<string, V2Message>();
  private selection: { matchId: string; watch: boolean } | null = null;
  private preparationMatchId: string | null = null;
  private authenticationId = '';
  accountId = '';
  state: SetupState | null = null;
  pending: PendingIntent | null = null;

  private options: ClientOptions;
  constructor(options: ClientOptions) {
    this.options = options;
    try {
      const raw = options.storage?.getItem(v2PendingKey);
      if (raw && raw.length <= 20000) {
        const saved = JSON.parse(raw);
        if (uuid.test(saved.accountId) && saved.request?.version === 2
          && typeof saved.request.requestId === 'string'
          && ['setup', 'preparedMatch', 'savedTeam'].includes(saved.request.type)
          && !('bearer' in saved.request)) {
          this.pending = saved;
          if (saved.request.type === 'setup' && uuid.test(saved.request.matchId)) this.selection = { matchId: saved.request.matchId, watch: false };
        }
      }
    } catch { /* Invalid local recovery data never causes an automatic mutation. */ }
  }

  connect() {
    this.disconnect();
    const socket = (this.options.makeSocket ?? (url => new WebSocket(url)))(this.options.url);
    this.socket = socket;
    this.options.onChange({ type: 'status', code: 'CONNECTING' });
    socket.onopen = async () => {
      try {
        const bearer = await this.options.getToken();
        if (this.socket !== socket) return;
        this.authenticationId = crypto.randomUUID();
        socket.send(JSON.stringify({ version: 2, type: 'authenticate', requestId: this.authenticationId, bearer }));
      } catch {
        if (this.socket === socket) {
          this.options.onChange({ type: 'error', code: 'AUTHENTICATION_TOKEN_UNAVAILABLE' });
          this.disconnect();
        }
      }
    };
    socket.onmessage = event => {
      if (this.socket !== socket) return;
      try { this.receive(String(event.data)); }
      catch { this.disconnect(); this.options.onChange({ type: 'error', code: 'INVALID_RESPONSE' }); }
    };
    socket.onclose = () => { if (this.socket === socket) this.disconnect(); };
    socket.onerror = () => {
      if (this.socket === socket) {
        this.options.onChange({ type: 'error', code: 'TRANSPORT_UNAVAILABLE' });
        this.disconnect();
      }
    };
  }

  disconnect() {
    const socket = this.socket; this.socket = null; this.accountId = ''; this.state = null; this.requests.clear();
    socket?.close(); this.options.onChange({ type: 'status', code: 'DISCONNECTED' });
  }

  request(type: string, fields: V2Message = {}, mutation = false) {
    if (!this.accountId || this.socket?.readyState !== 1) throw Error('Reconnect before continuing.');
    if (this.requests.size >= 128) throw Error('Too many unanswered requests. Reconnect before continuing.');
    const request = { ...fields, version: 2, type, requestId: crypto.randomUUID() };
    if (mutation) {
      if (this.pending) throw Error('Resolve the retained request before submitting another change.');
      if (type === 'setup' && this.state?.callerRole === 'spectator') throw Error('This game is read-only.');
      if (!this.options.storage) throw Error('Retry storage is unavailable.');
      const pending = { accountId: this.accountId, request };
      this.options.storage.setItem(v2PendingKey, JSON.stringify(pending));
      this.pending = pending;
    }
    this.requests.set(request.requestId, request); this.socket.send(JSON.stringify(request));
    this.options.onChange({ type: 'pending' });
    return request.requestId;
  }

  open(matchId: string, watch: boolean) {
    if (!uuid.test(matchId)) throw Error('Enter a valid match ID.');
    this.selection = { matchId, watch }; this.state = null;
    this.preparationMatchId = null;
    return this.request(watch ? 'watch' : 'setup', watch ? { matchId } : { matchId, operation: 'load' });
  }

  retry() {
    if (!this.pending || this.pending.accountId !== this.accountId || this.socket?.readyState !== 1)
      throw Error('Reconnect with the account that submitted this request.');
    const request = this.pending.request;
    if (request.type === 'setup') this.selection = { matchId: request.matchId, watch: false };
    this.requests.set(request.requestId, request); this.socket.send(JSON.stringify(request));
  }

  private receive(raw: string) {
    if (raw.length > 262144) throw Error('Oversized response');
    const message = parseUniqueJson(raw) as V2Message;
    assertV2Projection(message);
    if (message.version !== 2 || typeof message.type !== 'string'
      || (!['catalog', 'teamValidation'].includes(message.type) && typeof message.code !== 'string')) throw Error('Invalid envelope');
    if (message.type === 'authentication') {
      if (message.requestId !== this.authenticationId || message.code !== 'ACCEPTED' || !uuid.test(message.accountId)) throw Error('Invalid authentication');
      this.accountId = message.accountId; this.options.onChange(message);
      this.request('browse'); this.request('savedTeam', { operation: 'list' }); this.request('catalog');
      if (this.selection) this.open(this.selection.matchId, this.selection.watch);
      else if (this.preparationMatchId) this.request('preparedMatch', { operation: 'load', matchId: this.preparationMatchId });
      return;
    }
    if (message.type === 'error' && message.requestId === this.authenticationId) {
      this.disconnect(); this.options.onChange(message); return;
    }
    const request = message.requestId === null ? null : this.requests.get(message.requestId);
    if (message.type === 'preparationChanged') {
      if (!this.accountId || message.requestId !== null || message.code !== 'ACCEPTED'
        || !uuid.test(message.matchId) || Object.keys(message).length !== 5) throw Error('Invalid preparation notification');
      if (message.matchId === this.preparationMatchId) {
        if (![...this.requests.values()].some(pending => pending.type === 'preparedMatch' && pending.operation === 'load' && pending.matchId === message.matchId))
          this.request('preparedMatch', { operation: 'load', matchId: message.matchId });
      }
      return;
    }
    if (message.requestId !== null && !request) return;
    if (message.type === 'error' && ['AUTHENTICATION_REQUIRED', 'AUTHENTICATION_FAILED', 'CONNECTION_REPLACED'].includes(message.code)) {
      this.disconnect(); this.options.onChange(message); return;
    }
    if (message.type !== 'error') {
      const expected = request?.type === 'watch' || request?.type === 'setup' ? 'setupState'
        : request?.type === 'validateTeam' ? 'teamValidation' : request?.type;
      if (request ? message.type !== expected : message.type !== 'setupState') throw Error('Uncorrelated response');
    }
    if (message.type === 'preparedMatch' && message.code === 'ACCEPTED') {
      const { invitationCode, ...response } = message;
      decodePreparedMatch(JSON.stringify({ ...response, version: 1 }));
      if (invitationCode !== undefined && invitationCode !== null && !/^[A-Za-z0-9_-]{22}$/.test(invitationCode)) throw Error('Invalid invitation');
      if (invitationCode != null && message.callerRole !== 'home') throw Error('Foreign invitation');
      if (request?.matchId && request.matchId !== message.document.matchId) throw Error('Foreign match');
      this.preparationMatchId = message.document.matchId;
      this.selection = null; this.state = null;
    }
    if (message.type === 'savedTeam') {
      const document = message.document;
      if (document && (document.formatVersion !== 2 || document.owner?.namespace !== 'account'
        || Object.keys(document.owner).length !== 2 || document.owner.subject !== this.accountId
        || (request?.teamId && request.teamId !== document.teamId))) throw Error('Foreign team');
      decodeSavedTeam(JSON.stringify({ ...message, version: 1, document: document
        ? { ...document, formatVersion: 1, owner: { namespace: 'local', subject: 'home' } } : null }));
    }
    if (message.type === 'browse' && message.code === 'ACCEPTED'
      && (!Array.isArray(message.matches) || message.matches.length > 100
        || message.matches.some((entry: V2Message) => !uuid.test(entry.matchId) || entry.label !== 'Home vs Away'))) throw Error('Invalid browse list');
    if (message.type === 'setupState' && message.code === 'ACCEPTED' && !message.state) throw Error('Missing state');
    if (message.type === 'setupState' && message.state) {
      const state = decodeSetupStateValue(message.state, true);
      if (!this.selection || state.matchId !== this.selection.matchId || (request?.matchId && request.matchId !== state.matchId)) throw Error('Foreign match');
      if (this.selection.watch !== (state.callerRole === 'spectator')) throw Error('Wrong recipient role');
      if (!this.state || state.revision >= this.state.revision) this.state = state;
    }
    if (message.code === 'NOT_FOUND' || message.code === 'VIEW_UNAVAILABLE') { this.state = null; this.preparationMatchId = null; }
    if (request && this.pending?.request.requestId === message.requestId && !uncertain.has(message.code)) {
      this.pending = null; this.options.storage?.removeItem(v2PendingKey);
    }
    if (request) this.requests.delete(message.requestId);
    this.options.onChange(message);
  }
}
