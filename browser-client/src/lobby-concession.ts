import type { PendingIntent, V2Client, V2Message } from './v2-client.ts';

export type ConcessionStatus = { matchId: string | null; busy: boolean; text: string };
type Transport = Pick<V2Client, 'open' | 'request' | 'restorePreparation'> & { pending: PendingIntent | null };

/** Confirmation is owned by the page; the authorized native read supplies the revision. */
export class LobbyConcession {
  private intent: { matchId: string; requestId: string; stage: 'load' | 'submit' } | null = null;
  private transport: Transport;
  private update: (status: ConcessionStatus) => void;
  private preparationMatchId: string | null = null;
  private restorationRequestId: string | null = null;
  private statusText = '';
  constructor(transport: Transport, update: (status: ConcessionStatus) => void) {
    this.transport = transport; this.update = update;
    const retained = transport.pending?.request;
    if (retained?.type === 'setup' && retained.operation === 'concede') {
      this.intent = { matchId: retained.matchId, requestId: retained.requestId, stage: 'submit' };
      this.show(false, 'Reconnect and repeat the retained request to confirm the concession outcome.');
    }
  }

  begin(matchId: string, preparationMatchId: string | null = null) {
    if (this.intent || this.transport.pending) throw Error('Resolve the retained request before conceding.');
    this.intent = { matchId, requestId: '', stage: 'load' };
    this.preparationMatchId = preparationMatchId;
    try {
      this.intent.requestId = this.transport.open(matchId, false);
      this.show(true, 'Checking the match before conceding…');
    } catch (failure) { this.intent = null; this.show(false, 'Reconnect before conceding.'); this.restorePreparation(); throw failure; }
  }

  /** Returns true when the current-games inventory needs a fresh read. */
  receive(message: V2Message): boolean {
    if (this.restorationRequestId && message.requestId === this.restorationRequestId) {
      this.restorationRequestId = null;
      this.show(false, this.statusText);
      return false;
    }
    if (message.type === 'status' && message.code === 'DISCONNECTED') {
      this.restorationRequestId = null;
      if (this.intent?.stage === 'load') { this.intent = null; this.show(false, 'The match could not be checked. Reconnect and try again.'); }
      else if (this.intent) this.show(false, 'Reconnect and repeat the retained request to confirm the concession outcome.');
      else this.show(false, this.statusText);
      this.restorePreparation();
      return false;
    }
    if (!this.intent || message.requestId !== this.intent.requestId || !['setupState', 'error'].includes(message.type)) return false;
    if (message.code !== 'ACCEPTED') {
      const uncertain = this.transport.pending?.request.requestId === this.intent.requestId;
      if (!uncertain) this.intent = null;
      this.show(false, uncertain ? 'Concession outcome is unconfirmed. Reconnect and repeat the retained request.'
        : `Concession was not accepted: ${String(message.code).replaceAll('_', ' ')}. Refresh and try again.`);
      this.restorePreparation();
      return true;
    }
    if (this.intent.stage === 'load') {
      if (message.state.phase === 'FULL_TIME') {
        this.intent = null; this.show(false, 'This match has already ended.'); this.restorePreparation(); return true;
      }
      const matchId = this.intent.matchId;
      try {
        const requestId = this.transport.request('setup', { operation: 'concede', matchId, expectedRevision: message.state.revision }, true);
        this.intent = { matchId, requestId, stage: 'submit' };
        this.show(true, 'Submitting concession…');
      } catch (failure) {
        this.intent = null; this.show(false, failure instanceof Error ? failure.message : 'Concession could not be submitted.');
        this.restorePreparation();
      }
      return false;
    }
    this.intent = null;
    this.show(false, message.state.phase === 'FULL_TIME' ? 'Concession accepted. The match has ended.'
      : 'The match did not confirm a completed concession. Refresh to check its state.');
    this.restorePreparation();
    return true;
  }

  private restorePreparation() {
    if (!this.preparationMatchId || this.restorationRequestId) return;
    try {
      this.restorationRequestId = this.transport.restorePreparation(this.preparationMatchId);
      this.show(false, this.statusText);
    } catch { /* Reauthentication retries this read; concession is never replayed here. */ }
  }

  private show(busy: boolean, text: string) {
    this.statusText = text;
    this.update({ matchId: this.intent?.matchId ?? null, busy: busy || !!this.restorationRequestId, text });
  }
}
