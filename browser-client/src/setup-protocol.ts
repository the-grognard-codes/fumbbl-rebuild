import { parseUniqueJson } from './saved-team-protocol.ts';
import type { MatchRole } from './prepared-match-protocol.ts';

export type SetupCode = 'ACCEPTED' | 'SESSION_UNAVAILABLE' | 'NOT_ACTIVATED' | 'WRONG_ACTOR' | 'WRONG_PHASE' | 'WRONG_PLAYER' | 'ILLEGAL_PLACEMENT' | 'ILLEGAL_SETUP' | 'PROMPT_MISMATCH' | 'INVALID_OPTION' | 'REQUEST_ID_REUSED' | 'REQUEST_HISTORY_LIMIT' | 'SAVE_HISTORY_LIMIT' | 'SAVE_RESUME_UNAVAILABLE' | 'SAVE_PROPOSAL_PENDING' | 'SAVE_PROPOSAL_MISSING' | 'SAVE_PROPOSAL_MISMATCH' | 'SAVE_PROPOSAL_OWNER' | 'MATCH_SUSPENDED' | 'MATCH_NOT_SUSPENDED' | 'MATCH_ABANDONED' | 'STALE_REVISION' | 'INVALID_REQUEST' | 'NOT_FOUND' | 'AUTHENTICATION_REQUIRED' | 'PERSISTENCE_FAILED' | 'SNAPSHOT_UNSUPPORTED' | 'REPLAY_UNSUPPORTED' | 'MATCH_COMPLETED' | 'COMPLETION_PENDING' | 'MATCH_OUTCOME_UNKNOWN' | 'COMPLETION_CONFLICT' | 'REPLAY_LIMIT' | 'RECOVERY_UNSUPPORTED' | 'RECOVERY_CORRUPT' | 'RECOVERY_CONFLICT' | 'RECOVERY_LIMIT' | 'ACTIVATION_LIMIT';
export type SetupPlayer = { id: string; name: string; slot: number; role: MatchRole; x: number | null; y: number | null; state: string; art?: { rosterId: string; positionId: string } | null };
export type SetupPrompt = { id: string; actor: MatchRole; kind: 'coin' | 'receive'; options: ('heads' | 'tails' | 'receive' | 'kick')[] };
export type ActionTarget = { playerId: string } | { x: number; y: number };
export type SetupAction = { id: string; label: string; actor: MatchRole; kind: string; target?: ActionTarget | null };
export type SaveResumeStatus = { status: 'ACTIVE' | 'SAVE_PENDING' | 'SUSPENDED' | 'RESUME_PENDING' | 'ABANDONED'; proposalId: string | null; proposer: MatchRole | null; expiresAt: number | null };
export type SetupState = { projectionVersion?: 2 | 3; matchId: string; revision: number; callerRole: MatchRole | 'spectator'; phase: 'PRE_MATCH' | 'SETUP' | 'READY_FOR_KICKOFF' | 'PLAY' | 'FULL_TIME'; actor: MatchRole; prompt: SetupPrompt | null; players: SetupPlayer[]; weather: string; homeRerolls: number; awayRerolls: number; actions: SetupAction[]; turn: number; turnMode: string; ball: { x: number; y: number } | null; activePlayerId: string | null; half: number; homeTurn: number; awayTurn: number; homeScore: number; awayScore: number; drive: number; saveResume?: SaveResumeStatus };
export type SetupResponse = { version: 1; type: 'setupState'; requestId: string | null; code: SetupCode; duplicate: boolean; state: SetupState | null };
const codes = new Set<SetupCode>(['ACCEPTED','SESSION_UNAVAILABLE','NOT_ACTIVATED','WRONG_ACTOR','WRONG_PHASE','WRONG_PLAYER','ILLEGAL_PLACEMENT','ILLEGAL_SETUP','PROMPT_MISMATCH','INVALID_OPTION','REQUEST_ID_REUSED','REQUEST_HISTORY_LIMIT','SAVE_HISTORY_LIMIT','SAVE_RESUME_UNAVAILABLE','SAVE_PROPOSAL_PENDING','SAVE_PROPOSAL_MISSING','SAVE_PROPOSAL_MISMATCH','SAVE_PROPOSAL_OWNER','MATCH_SUSPENDED','MATCH_NOT_SUSPENDED','MATCH_ABANDONED','STALE_REVISION','INVALID_REQUEST','NOT_FOUND','AUTHENTICATION_REQUIRED','PERSISTENCE_FAILED','SNAPSHOT_UNSUPPORTED','REPLAY_UNSUPPORTED','MATCH_COMPLETED','COMPLETION_PENDING','MATCH_OUTCOME_UNKNOWN','COMPLETION_CONFLICT','REPLAY_LIMIT','RECOVERY_UNSUPPORTED','RECOVERY_CORRUPT','RECOVERY_CONFLICT','RECOVERY_LIMIT','ACTIVATION_LIMIT']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function object(value: unknown, keys: string[]) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected object'); const result = value as Record<string, unknown>; if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key))) throw Error('Unexpected fields'); return result; }
function role(value: unknown): asserts value is MatchRole { if (value !== 'home' && value !== 'away') throw Error('Invalid role'); }
function text(value: unknown, maximum = 100): asserts value is string { if (typeof value !== 'string' || !value || value.length > maximum) throw Error('Invalid text'); }
function integer(value: unknown, maximum = 5_000_000): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) throw Error('Invalid integer'); }
export function decodeSetupStateValue(value: unknown, spectator = false): SetupState {
	const base = ['matchId','revision','callerRole','phase','actor','prompt','players','weather','homeRerolls','awayRerolls','actions','turn','turnMode','ball','activePlayerId','half','homeTurn','awayTurn','homeScore','awayScore','drive'];
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected object');
	const source = value as Record<string, unknown>; const keys = Object.keys(source);
	const artV2 = source.projectionVersion === 2 || source.projectionVersion === 3;
	const targetsV3 = source.projectionVersion === 3;
	const required = artV2 ? [...base, 'projectionVersion'] : base;
	if ((source.projectionVersion !== undefined && !artV2) || !(keys.length === required.length || keys.length === required.length + 1 && Object.hasOwn(source, 'saveResume')) || required.some(key => !Object.hasOwn(source, key))) throw Error('Unexpected fields');
	const result = source; text(result.matchId, 36); if (!uuid.test(result.matchId)) throw Error('Invalid match'); integer(result.revision, 2147483646); if (!(spectator && result.callerRole === 'spectator')) role(result.callerRole); role(result.actor);
	if ((result.phase !== 'PRE_MATCH' && result.phase !== 'SETUP' && result.phase !== 'READY_FOR_KICKOFF' && result.phase !== 'PLAY' && result.phase !== 'FULL_TIME') || !Array.isArray(result.players) || result.players.length > 32) throw Error('Invalid state'); text(result.weather); integer(result.homeRerolls, 100); integer(result.awayRerolls, 100); integer(result.turn); text(result.turnMode); integer(result.half, 2); if (result.half < 1) throw Error('Invalid half'); integer(result.homeTurn, 8); integer(result.awayTurn, 8); integer(result.homeScore, 100); integer(result.awayScore, 100); integer(result.drive, 100); if (result.drive < 1) throw Error('Invalid drive');
	const players = result.players.map(value => { const player = object(value, artV2 ? ['id','name','slot','role','x','y','state','art'] : ['id','name','slot','role','x','y','state']); text(player.id); text(player.name); integer(player.slot, 16); if (player.slot < 1) throw Error('Invalid slot'); role(player.role); text(player.state); if ((player.x === null) !== (player.y === null)) throw Error('Invalid coordinate'); if (player.x !== null) { integer(player.x, 25); integer(player.y, 14); } if (artV2 && player.art !== null) { const art = object(player.art, ['rosterId','positionId']); text(art.rosterId, 60); text(art.positionId, 60); } return player as SetupPlayer; });
	if (new Set(players.map(player => player.id)).size !== players.length) throw Error('Repeated player');
	if (!Array.isArray(result.actions) || result.actions.length > 8192) throw Error('Invalid actions');
	const actions = result.actions.map(value => { const action = object(value, targetsV3 ? ['id','label','actor','kind','target'] : ['id','label','actor','kind']); text(action.id, 200); text(action.label, 200); role(action.actor); text(action.kind, 60); if (targetsV3 && action.target !== null) { if (typeof action.target !== 'object' || Array.isArray(action.target)) throw Error('Invalid target'); const target = action.target as Record<string, unknown>; if (Object.hasOwn(target, 'playerId')) { const player = object(target, ['playerId']); text(player.playerId); if (!players.some(value => value.id === player.playerId)) throw Error('Unknown target player'); } else { const square = object(target, ['x','y']); integer(square.x, 25); integer(square.y, 14); } } return action as SetupAction; });
	if (new Set(actions.map(action => action.id)).size !== actions.length) throw Error('Repeated action');
	let ball: { x: number; y: number } | null = null;
	if (result.ball !== null) { const value = object(result.ball, ['x','y']); integer(value.x, 25); integer(value.y, 14); ball = value as { x: number; y: number }; }
	if (result.activePlayerId !== null) text(result.activePlayerId);
	let prompt: SetupPrompt | null = null;
	if (result.prompt !== null) { const value = object(result.prompt, ['id','actor','kind','options']); text(value.id); role(value.actor); if ((value.kind !== 'coin' && value.kind !== 'receive') || !Array.isArray(value.options) || value.options.length !== 2) throw Error('Invalid prompt'); const expected = value.kind === 'coin' ? ['heads','tails'] : ['receive','kick']; if (!value.options.every(option => typeof option === 'string' && expected.includes(option)) || new Set(value.options).size !== 2) throw Error('Invalid options'); prompt = value as SetupPrompt; }
	let saveResume: SaveResumeStatus | undefined;
	if (Object.hasOwn(result, 'saveResume')) {
		const value = object(result.saveResume, ['status','proposalId','proposer','expiresAt']);
		if (value.status !== 'ACTIVE' && value.status !== 'SAVE_PENDING' && value.status !== 'SUSPENDED' && value.status !== 'RESUME_PENDING' && value.status !== 'ABANDONED') throw Error('Invalid save status');
		if (value.proposalId !== null && (typeof value.proposalId !== 'string' || !uuid.test(value.proposalId))) throw Error('Invalid proposal');
		if (value.proposer !== null) role(value.proposer);
		const expiresAt = value.expiresAt;
		if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || (expiresAt as number) < 0)) throw Error('Invalid expiry');
		const pending = value.status === 'SAVE_PENDING' || value.status === 'RESUME_PENDING';
		if (pending !== (value.proposalId !== null && value.proposer !== null && expiresAt !== null)) throw Error('Inconsistent save proposal');
		if (!pending && (value.proposalId !== null || value.proposer !== null || expiresAt !== null)) throw Error('Inconsistent save proposal');
		saveResume = value as SaveResumeStatus;
	}
	return { ...result, players, actions, ball, prompt, ...(saveResume ? { saveResume } : {}) } as SetupState;
}
export function decodeSetupState(json: string): SetupResponse {
	if (new TextEncoder().encode(json).length > 65536) throw Error('Response too large'); const result = object(parseUniqueJson(json), ['version','type','requestId','code','duplicate','state']);
	if (result.version !== 1 || result.type !== 'setupState' || (result.requestId !== null && (typeof result.requestId !== 'string' || !result.requestId || result.requestId.length > 100)) || typeof result.code !== 'string' || !codes.has(result.code as SetupCode) || typeof result.duplicate !== 'boolean') throw Error('Invalid setup response');
	if (result.code === 'ACCEPTED' || result.code === 'ILLEGAL_SETUP' ? result.state === null : result.state !== null || result.duplicate) throw Error('Inconsistent setup response');
	return { ...result, state: result.state === null ? null : decodeSetupStateValue(result.state) } as SetupResponse;
}
/** Client-side affordance only; the server remains authoritative for placement legality. */
export function canPlaceReserve(state: SetupState, playerId: string, x: number, y: number): boolean {
	const player = state.players.find(item => item.id === playerId);
	return state.phase === 'SETUP' && state.actor === state.callerRole && !!player && player.role === state.callerRole && Number.isSafeInteger(x) && Number.isSafeInteger(y)
		&& y >= 0 && y < 15 && (state.callerRole === 'home' ? x >= 0 && x <= 12 : x >= 13 && x < 26)
		&& !state.players.some(item => item.x === x && item.y === y);
}
