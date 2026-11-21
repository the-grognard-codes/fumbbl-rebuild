/** A bounded tail for debugging, deliberately not a full match replay. */
export class DiagnosticTrace {
  constructor(limit = 16) { this.limit = limit; this.events = []; }
  add(event) {
    const text = JSON.stringify(event);
    this.events.push(Buffer.byteLength(text) <= 2048 ? event : { operation: event.operation, truncated: true });
    if (this.events.length > this.limit) this.events.shift();
  }
  snapshot(record, state, stderr, limit = 256 * 1024) {
    const result = { schemaVersion: 1, episode: record.id, seed: record.seed, completed: record.completed,
      failureCode: record.failureCode, error: record.error, decisions: record.decisions, events: this.events,
      stderr: (stderr ?? '').slice(-4096), state };
    if (Buffer.byteLength(JSON.stringify(result)) > limit) {
      result.state = state && { phase: state.phase, turnMode: state.turnMode, actor: state.actor, revision: state.revision };
      result.stateTruncated = true;
    }
    return result;
  }
}
