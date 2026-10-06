import { decodeBrowseGames } from './browse-protocol.ts';

/** New response fields/families require a recipient projection test before rendering. */
const fields: Record<string, string[]> = {
  authentication: ['code', 'accountId'], error: ['code'], browse: ['code', 'matches'],
  computer: ['code'], computerAuthentication: ['code'], computerJobs: ['code', 'matches'],
  preparationChanged: ['code', 'matchId'], setupState: ['code', 'duplicate', 'state'],
  matchResult: ['code', 'result', 'event'],
  matchTranscript: ['code', 'matchId', 'page'],
  routePreview: ['code', 'matchId', 'route'],
  matchChat: ['code', 'matchId', 'duplicate', 'page'],
  preparedMatch: ['code', 'duplicate', 'callerRole', 'document', 'recoveryMatchId'],
  savedTeam: ['code', 'document', 'versionStatus', 'validation', 'teams'],
  catalog: ['catalogVersion', 'ruleset', 'draftVersion', 'rosterId', 'name', 'presetId', 'budget', 'minPlayers', 'maxPlayers',
    'skillPoints', 'maxSecondary', 'maxElite', 'league', 'specialRule', 'positions', 'skills', 'resources', 'unsupported'],
  teamValidation: ['catalogVersion', 'ruleset', 'draftVersion', 'valid', 'budget', 'skillPoints', 'messages', 'total'],
};

export function assertV2Projection(message: Record<string, unknown>) {
  const specific = typeof message.type === 'string' && Object.hasOwn(fields, message.type) ? fields[message.type] : null;
  if (!specific) throw Error('Unknown recipient projection');
  const allowed = ['version', 'type', 'requestId', ...specific];
  if (message.type === 'preparedMatch' && Object.hasOwn(message, 'invitationCode')) allowed.push('invitationCode');
  if (Object.keys(message).length !== allowed.length || allowed.some(key => !Object.hasOwn(message, key)))
    throw Error('Unexpected recipient fields');
  if (message.requestId !== null && (typeof message.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(message.requestId)))
    throw Error('Invalid response correlation');
  if (message.type === 'browse') decodeBrowseGames(message.matches);
  if (message.type === 'computerJobs' && (!Array.isArray(message.matches) || message.matches.length > 1024
    || message.matches.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id))))
    throw Error('Invalid computer jobs');
}
