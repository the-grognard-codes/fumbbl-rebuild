import { parseUniqueJson } from './saved-team-protocol.ts';

const setupStateLimit = 2 * 1024 * 1024;
const transcriptLimit = 768 * 1024;
const ordinaryLimit = 256 * 1024;

/** Size gate shared by browser and computer match clients; callers still validate the projection. */
export function parseV2Response(raw: string): Record<string, unknown> {
  // Reject before allocating UTF-8 bytes or parsing a response above the largest family budget.
  if (raw.length > setupStateLimit) throw Error('Oversized response');
  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > setupStateLimit) throw Error('Oversized response');
  const message = parseUniqueJson(raw);
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw Error('Invalid envelope');
  const response = message as Record<string, unknown>;
  // Solid Defence can offer a destination for every selected player, exceeding the ordinary budget.
  const limit = response.type === 'setupState' ? setupStateLimit
    : response.type === 'matchTranscript' ? transcriptLimit : ordinaryLimit;
  if (bytes > limit) throw Error('Oversized response');
  return response;
}
