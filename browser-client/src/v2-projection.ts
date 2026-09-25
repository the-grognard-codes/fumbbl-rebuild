/** New response fields/families require a recipient projection test before rendering. */
const fields: Record<string, string[]> = {
  authentication: ['code', 'accountId'], error: ['code'], browse: ['code', 'matches'],
  preparationChanged: ['code', 'matchId'], setupState: ['code', 'duplicate', 'state'],
  matchResult: ['code', 'result', 'event'],
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
  if (message.type === 'browse' && (!Array.isArray(message.matches) || message.matches.some(entry => !entry || typeof entry !== 'object'
    || Object.keys(entry).length !== 2 || !Object.hasOwn(entry, 'matchId') || !Object.hasOwn(entry, 'label'))))
    throw Error('Unexpected browse fields');
}
