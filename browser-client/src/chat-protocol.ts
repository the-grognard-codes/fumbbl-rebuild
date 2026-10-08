import { parseUniqueJson } from './saved-team-protocol.ts';

export type ChatMessage = { index: number; at: number; revision: number; authorId: string;
  role: 'home' | 'away' | 'spectator'; text: string; spectatorNumber?: number | null };
export type ChatPage = { formatVersion: 1 | 2; from: number; next: number; total: number; messages: ChatMessage[] };
export type ChatResponse = { version: 2; type: 'matchChat'; requestId: string | null;
  code: 'ACCEPTED'; matchId: string; duplicate: boolean; page: ChatPage };
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid chat object');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== fields.length || fields.some(field => !Object.hasOwn(item, field))) throw Error('Unexpected chat fields');
  return item;
}
function integer(value: unknown, max: number) {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) throw Error('Invalid chat number');
  return value as number;
}
export function decodeChat(json: string): ChatResponse {
  if (new TextEncoder().encode(json).length > 48 * 1024) throw Error('Chat page too large');
  const response = object(parseUniqueJson(json), ['version', 'type', 'requestId', 'code', 'matchId', 'duplicate', 'page']);
  if (response.version !== 2 || response.type !== 'matchChat' || response.code !== 'ACCEPTED'
    || response.requestId !== null && (typeof response.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(response.requestId))
    || typeof response.matchId !== 'string' || !uuid.test(response.matchId)
    || typeof response.duplicate !== 'boolean' || response.requestId === null && response.duplicate)
    throw Error('Invalid chat response');
  const page = object(response.page, ['formatVersion', 'from', 'next', 'total', 'messages']);
  const from = integer(page.from, 512), next = integer(page.next, 512), total = integer(page.total, 512);
  if (![1, 2].includes(page.formatVersion as number) || from > next || next > total || !Array.isArray(page.messages)
    || page.messages.length > 32 || page.messages.length !== next - from
    || response.requestId === null && page.messages.length !== 1) throw Error('Invalid chat page');
  let priorTime = -1;
  const spectatorAuthors = new Map<string, number>();
  const spectatorNumbers = new Map<number, string>();
  const messages = page.messages.map((item, offset) => {
    const message = object(item, ['index', 'at', 'revision', 'authorId', 'role', 'text', ...(page.formatVersion === 2 ? ['spectatorNumber'] : [])]);
    const at = integer(message.at, 8_640_000_000_000_000);
    if (message.index !== from + offset || at < priorTime || !uuid.test(message.authorId as string)
      || !['home', 'away', 'spectator'].includes(message.role as string)
      || typeof message.text !== 'string' || message.text.length < 1 || message.text.length > 300
      || message.text.trim() !== message.text || /[\u0000-\u001f\u007f]/.test(message.text)) throw Error('Invalid chat message');
    if (page.formatVersion === 2) {
      if (message.role === 'spectator') {
        const number = integer(message.spectatorNumber, 512), author = message.authorId as string;
        if (number < 1 || number > from + offset + 1
          || from === 0 && !spectatorAuthors.has(author) && number !== spectatorAuthors.size + 1
          || spectatorAuthors.has(author) && spectatorAuthors.get(author) !== number
          || spectatorNumbers.has(number) && spectatorNumbers.get(number) !== author) throw Error('Inconsistent spectator number');
        spectatorAuthors.set(author, number); spectatorNumbers.set(number, author);
      } else if (message.spectatorNumber !== null) throw Error('Coach has a spectator number');
    }
    priorTime = at;
    integer(message.revision, 8192);
    return message as ChatMessage;
  });
  return { ...response, page: { formatVersion: page.formatVersion, from, next, total, messages } } as ChatResponse;
}
