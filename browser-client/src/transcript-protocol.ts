import { parseUniqueJson } from './saved-team-protocol.ts';
import { decodeSetupStateValue } from './setup-protocol.ts';
import type { SetupState } from './setup-protocol.ts';

export type TranscriptRecord = {
  index: number; revision: number; kind: string; actor: 'system' | 'home' | 'away'; at: number;
  decision: Record<string, unknown> | null; native: Record<string, unknown>[]; state: SetupState;
};
export type TranscriptPage = { formatVersion: 2; from: number; next: number; total: number; records: TranscriptRecord[] };
export type TranscriptResponse = { version: 2; type: 'matchTranscript'; requestId: string; code: 'ACCEPTED'; matchId: string; page: TranscriptPage };

function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected transcript object');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== fields.length || fields.some(field => !Object.hasOwn(item, field))) throw Error('Unexpected transcript fields');
  return item;
}
function integer(value: unknown, maximum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) throw Error('Invalid transcript number');
  return value as number;
}

export function decodeTranscript(json: string): TranscriptResponse {
  if (new TextEncoder().encode(json).length > 512 * 1024 + 256 * 1024) throw Error('Transcript page too large');
  const response = object(parseUniqueJson(json), ['version', 'type', 'requestId', 'code', 'matchId', 'page']);
  if (response.version !== 2 || response.type !== 'matchTranscript' || response.code !== 'ACCEPTED'
    || typeof response.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(response.requestId)
    || typeof response.matchId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(response.matchId))
    throw Error('Invalid transcript response');
  const page = object(response.page, ['formatVersion', 'from', 'next', 'total', 'records']);
  const from = integer(page.from, 8193), next = integer(page.next, 8193), total = integer(page.total, 8193);
  if (page.formatVersion !== 2 || next < from || next > total || !Array.isArray(page.records)
    || page.records.length > 8 || page.records.length !== next - from) throw Error('Invalid transcript page');
  let priorTime = 0;
  let priorCommand = 0;
  const records = page.records.map((entry, offset) => {
    const record = object(entry, ['index', 'revision', 'kind', 'actor', 'at', 'decision', 'native', 'state']);
    if (record.index !== from + offset || record.revision !== record.index
      || (record.index === 0 ? record.actor !== 'system' : record.actor !== 'home' && record.actor !== 'away')
      || !['START', 'ACTION', 'SELECTION', 'TOUCHDOWN', 'HALFTIME', 'FULL_TIME'].includes(record.kind as string))
      throw Error('Invalid transcript record');
    if (record.index === 0 ? record.kind !== 'START' : record.kind === 'START') throw Error('Invalid transcript start');
    const at = integer(record.at, 8_640_000_000_000_000);
    if (at < priorTime || (record.index === 0 ? record.decision !== null : !record.decision || typeof record.decision !== 'object' || Array.isArray(record.decision)))
      throw Error('Invalid transcript decision');
    priorTime = at;
    if (!Array.isArray(record.native) || record.native.length > 512) throw Error('Invalid native outcome list');
    const native = record.native.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid native outcome');
      const command = value as Record<string, unknown>;
      const number = integer(command.commandNr, 2_147_483_647);
      if (number <= priorCommand) throw Error('Native outcomes out of order');
      priorCommand = number;
      return command;
    });
    const state = decodeSetupStateValue(record.state);
    if (state.matchId !== response.matchId || state.revision !== record.revision || state.callerRole !== 'home'
      || state.actions.length || state.prompt !== null) throw Error('Invalid transcript snapshot');
    return { ...record, decision: record.decision as Record<string, unknown> | null, native, state } as TranscriptRecord;
  });
  return { ...response, page: { formatVersion: 2, from, next, total, records } } as TranscriptResponse;
}
