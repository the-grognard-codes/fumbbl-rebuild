import { decodeRouteStep, type RouteStep } from './route-protocol.ts';
import { parseUniqueJson } from './saved-team-protocol.ts';
import type { MatchRole } from './prepared-match-protocol.ts';

export type SetupCode = 'ACCEPTED' | 'SESSION_UNAVAILABLE' | 'NOT_ACTIVATED' | 'WRONG_ACTOR' | 'WRONG_PHASE' | 'WRONG_PLAYER' | 'ILLEGAL_PLACEMENT' | 'ILLEGAL_SETUP' | 'PROMPT_MISMATCH' | 'INVALID_OPTION' | 'REQUEST_ID_REUSED' | 'REQUEST_HISTORY_LIMIT' | 'SAVE_HISTORY_LIMIT' | 'SAVE_RESUME_UNAVAILABLE' | 'SAVE_PROPOSAL_PENDING' | 'SAVE_PROPOSAL_MISSING' | 'SAVE_PROPOSAL_MISMATCH' | 'SAVE_PROPOSAL_OWNER' | 'MATCH_SUSPENDED' | 'MATCH_NOT_SUSPENDED' | 'MATCH_ABANDONED' | 'STALE_REVISION' | 'INVALID_REQUEST' | 'NOT_FOUND' | 'AUTHENTICATION_REQUIRED' | 'PERSISTENCE_FAILED' | 'SNAPSHOT_UNSUPPORTED' | 'REPLAY_UNSUPPORTED' | 'MATCH_COMPLETED' | 'COMPLETION_PENDING' | 'MATCH_OUTCOME_UNKNOWN' | 'COMPLETION_CONFLICT' | 'REPLAY_LIMIT' | 'RECOVERY_UNSUPPORTED' | 'RECOVERY_CORRUPT' | 'RECOVERY_CONFLICT' | 'RECOVERY_LIMIT' | 'ACTIVATION_LIMIT';
export type OffPitchCategory = 'pitch' | 'reserve' | 'knockedOut' | 'casualty' | 'sentOff' | 'other';
export type SetupPlayer = { id: string; name: string; slot: number; role: MatchRole; x: number | null; y: number | null; state: string; art?: { rosterId: string; positionId: string } | null; number?: number; position?: string; positionRace?: string; positionRole?: string; status?: string; ma?: number; st?: number; ag?: number; pa?: number; av?: number; skills?: string[]; offPitch?: OffPitchCategory };
export type SetupPrompt = { id: string; actor: MatchRole; kind: 'coin' | 'receive'; options: ('heads' | 'tails' | 'receive' | 'kick')[] };
export type ActionTarget = { playerId: string } | { x: number; y: number };
export type SetupAction = { id: string; label: string; actor: MatchRole; kind: string; target?: ActionTarget | null; sourcePlayerId?: string | null };
export type MatchTeamArt = { rosterId: string; league: string | null };
export type TeamResources = { apothecaries: number; assistantCoaches: number; cheerleaders: number };
export type SaveResumeStatus = { status: 'ACTIVE' | 'SAVE_PENDING' | 'SUSPENDED' | 'RESUME_PENDING' | 'ABANDONED'; proposalId: string | null; proposer: MatchRole | null; expiresAt: number | null };
export type MatchClock = { activeRole: MatchRole | null; turnElapsedMs: number; homeReserveMs: number; awayReserveMs: number };
export type PassingRanges = { version: 1; playerId: string; from: { x: number; y: number }; weatherPenalty: number; rangeLimited: boolean; ranges: string[] };
export type KickoffPresentation = { version: 1; event: 'QUICK_SNAP' | 'CHARGE' | 'HIGH_KICK' | 'SOLID_DEFENCE'; actor: MatchRole; stage: 'selection' | 'movement'; allowed: number; completed: number; selected: number };
export type MovementForecast = { version: 1 | 2; playerId: string; steps: RouteStep[] };
export type BallState = { version: 1; carrierPlayerId: string | null; inPlay: boolean; moving: boolean };
export type ThreatGuidance = { version: 1; eligiblePlayerIds: string[]; zonePlayerIds: string[] };
export type SetupState = { projectionVersion?: 2 | 3 | 4; matchId: string; revision: number; callerRole: MatchRole | 'spectator'; phase: 'PRE_MATCH' | 'SETUP' | 'READY_FOR_KICKOFF' | 'PLAY' | 'FULL_TIME'; actor: MatchRole; prompt: SetupPrompt | null; players: SetupPlayer[]; weather: string; homeRerolls: number; awayRerolls: number; actions: SetupAction[]; turn: number; turnMode: string; ball: { x: number; y: number } | null; activePlayerId: string | null; half: number; homeTurn: number; awayTurn: number; homeScore: number; awayScore: number; drive: number; homeTeamName?: string; awayTeamName?: string; homeTeamArt?: MatchTeamArt; awayTeamArt?: MatchTeamArt; homeResources?: TeamResources; awayResources?: TeamResources; saveResume?: SaveResumeStatus; clock?: MatchClock; passing?: PassingRanges; kickoff?: KickoffPresentation; ballState?: BallState; movementForecast?: MovementForecast; threats?: ThreatGuidance };
export type SetupResponse = { version: 1; type: 'setupState'; requestId: string | null; code: SetupCode; duplicate: boolean; state: SetupState | null; setupErrors?: string[] };
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
	const detailsV4 = source.projectionVersion === 4;
	const artV2 = source.projectionVersion === 2 || source.projectionVersion === 3 || detailsV4;
	const targetsV3 = source.projectionVersion === 3 || detailsV4;
	const required = artV2 ? [...base, 'projectionVersion', ...(detailsV4 ? ['homeTeamName','awayTeamName','homeResources','awayResources'] : [])] : base;
	if ((source.projectionVersion !== undefined && !artV2) || required.some(key => !Object.hasOwn(source, key)) || keys.some(key => !required.includes(key) && key !== 'saveResume' && key !== 'clock' && key !== 'passing' && key !== 'kickoff' && key !== 'ballState' && key !== 'movementForecast' && key !== 'homeTeamArt' && key !== 'awayTeamArt' && key !== 'threats') || (Object.hasOwn(source, 'clock') || Object.hasOwn(source, 'passing') || Object.hasOwn(source, 'kickoff') || Object.hasOwn(source, 'ballState') || Object.hasOwn(source, 'movementForecast') || Object.hasOwn(source, 'homeTeamArt') || Object.hasOwn(source, 'awayTeamArt') || Object.hasOwn(source, 'threats')) && !detailsV4) throw Error('Unexpected fields');
	if (Object.hasOwn(source, 'homeTeamArt') !== Object.hasOwn(source, 'awayTeamArt')) throw Error('Incomplete team art');
    if (Object.hasOwn(source, 'homeTeamArt')) for (const key of ['homeTeamArt', 'awayTeamArt']) {
        const art = object(source[key], ['rosterId', 'league']); text(art.rosterId, 60);
        if (art.league !== null) text(art.league, 100);
    }
	const result = source; text(result.matchId, 36); if (!uuid.test(result.matchId)) throw Error('Invalid match'); integer(result.revision, 2147483646); if (!(spectator && result.callerRole === 'spectator')) role(result.callerRole); role(result.actor);
	if ((result.phase !== 'PRE_MATCH' && result.phase !== 'SETUP' && result.phase !== 'READY_FOR_KICKOFF' && result.phase !== 'PLAY' && result.phase !== 'FULL_TIME') || !Array.isArray(result.players) || result.players.length > 32) throw Error('Invalid state'); text(result.weather); integer(result.homeRerolls, 100); integer(result.awayRerolls, 100); integer(result.turn); text(result.turnMode); integer(result.half, 2); if (result.half < 1) throw Error('Invalid half'); integer(result.homeTurn, 8); integer(result.awayTurn, 8); integer(result.homeScore, 100); integer(result.awayScore, 100); integer(result.drive, 100); if (result.drive < 1) throw Error('Invalid drive');
	const players = result.players.map(value => { const cardFields = detailsV4 && value && typeof value === 'object' && !Array.isArray(value) ? ['status','positionRace','positionRole'].filter(key => Object.hasOwn(value, key)) : []; const player = object(value, [...(artV2 ? ['id','name','slot','role','x','y','state','art'] : ['id','name','slot','role','x','y','state']), ...(detailsV4 ? ['number','position','ma','st','ag','pa','av','skills','offPitch'] : []), ...cardFields]); text(player.id); text(player.name); integer(player.slot, 16); if (player.slot < 1) throw Error('Invalid slot'); role(player.role); text(player.state); if ((player.x === null) !== (player.y === null)) throw Error('Invalid coordinate'); if (player.x !== null) { integer(player.x, 25); integer(player.y, 14); } if (artV2 && player.art !== null) { const art = object(player.art, ['rosterId','positionId']); text(art.rosterId, 60); text(art.positionId, 60); } if (detailsV4) { integer(player.number, 99); if (player.number < 1) throw Error('Invalid number'); text(player.position); for (const stat of ['ma','st','ag','pa','av']) integer(player[stat], 30); if (!Array.isArray(player.skills) || player.skills.length > 64) throw Error('Invalid skills'); for (const skill of player.skills) text(skill, 100); if (!['pitch','reserve','knockedOut','casualty','sentOff','other'].includes(player.offPitch as string) || (player.x !== null) !== (player.offPitch === 'pitch')) throw Error('Invalid off-pitch category'); if (Object.hasOwn(player, 'status')) text(player.status); if (Object.hasOwn(player, 'positionRace') !== Object.hasOwn(player, 'positionRole')) throw Error('Incomplete position subtype'); if (Object.hasOwn(player, 'positionRace')) { text(player.positionRace); text(player.positionRole); } } return player as SetupPlayer; });
	if (new Set(players.map(player => player.id)).size !== players.length) throw Error('Repeated player');
	if (!Array.isArray(result.actions) || result.actions.length > 8192) throw Error('Invalid actions');
	const actions = result.actions.map(value => { const action = object(value, targetsV3 ? ['id','label','actor','kind','target', ...(detailsV4 ? ['sourcePlayerId'] : [])] : ['id','label','actor','kind']); text(action.id, 200); text(action.label, 200); role(action.actor); text(action.kind, 60); if (targetsV3 && action.target !== null) { if (typeof action.target !== 'object' || Array.isArray(action.target)) throw Error('Invalid target'); const target = action.target as Record<string, unknown>; if (Object.hasOwn(target, 'playerId')) { const player = object(target, ['playerId']); text(player.playerId); if (!players.some(value => value.id === player.playerId)) throw Error('Unknown target player'); } else { const square = object(target, ['x','y']); integer(square.x, 25); integer(square.y, 14); } } if (detailsV4 && action.sourcePlayerId !== null && (typeof action.sourcePlayerId !== 'string' || !players.some(player => player.id === action.sourcePlayerId && player.role === action.actor))) throw Error('Invalid action source'); return action as SetupAction; });
	if (detailsV4) { text(result.homeTeamName, 100); text(result.awayTeamName, 100); for (const key of ['homeResources','awayResources']) { const resources = object(result[key], ['apothecaries','assistantCoaches','cheerleaders']); integer(resources.apothecaries, 20); integer(resources.assistantCoaches, 20); integer(resources.cheerleaders, 20); } }
	if (new Set(actions.map(action => action.id)).size !== actions.length) throw Error('Repeated action');
	let ball: { x: number; y: number } | null = null;
	if (result.ball !== null) { const value = object(result.ball, ['x','y']); integer(value.x, 25); integer(value.y, 14); ball = value as { x: number; y: number }; }
	if (Object.hasOwn(result, 'ballState')) {
		const state = object(result.ballState, ['version', 'carrierPlayerId', 'inPlay', 'moving']);
		if (state.version !== 1) throw Error('Invalid ball-state version');
		if (typeof state.inPlay !== 'boolean' || typeof state.moving !== 'boolean') throw Error('Invalid native ball flags');
		if (state.carrierPlayerId !== null) {
			if (!state.inPlay || state.moving) throw Error('Invalid native possession');
			text(state.carrierPlayerId);
			const carrier = players.find(player => player.id === state.carrierPlayerId);
			if (!ball || !carrier || carrier.x !== ball.x || carrier.y !== ball.y) throw Error('Invalid ball carrier');
		}
	}
	if (result.activePlayerId !== null) text(result.activePlayerId);
	let movementForecast: MovementForecast | undefined;
	if (Object.hasOwn(result, 'movementForecast')) {
		const value = object(result.movementForecast, ['version', 'playerId', 'steps']);
		const mover = players.find(player => player.id === value.playerId);
		if (![1, 2].includes(value.version as number) || result.phase !== 'PLAY' || !mover || mover.id !== result.activePlayerId
			|| mover.x === null || mover.y === null || !Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > (value.version === 2 ? 24 : 8))
			throw Error('Invalid movement forecast');
		const steps = value.steps.map(step => decodeRouteStep(step, value.version === 2 ? 3 : 2));
		if (new Set(steps.map(step => `${step.x},${step.y}`)).size !== steps.length
			|| steps.some(step => !actions.some(action => {
				const jumping = value.version === 2 && action.kind === 'jump';
				return (action.kind === 'move' || jumping) && action.sourcePlayerId === mover.id
					&& Math.max(Math.abs(step.x - mover.x!), Math.abs(step.y - mover.y!)) === (jumping ? 2 : 1)
					&& !!step.checks?.some(check => check.name === 'Jump') === jumping
					&& action.target && 'x' in action.target && action.target.x === step.x && action.target.y === step.y;
			})))
			throw Error('Unavailable movement forecast');
        if (steps.some(step => step.checks?.some(check => ['Pickup', 'Ball scatter'].includes(check.name))
          && (!ball || ball.x !== step.x || ball.y !== step.y || !result.ballState
            || !(result.ballState as Record<string, unknown>).inPlay || !(result.ballState as Record<string, unknown>).moving)))
          throw Error('Unavailable ball contact');
		movementForecast = { version: value.version as 1 | 2, playerId: mover.id, steps };
	}
	let prompt: SetupPrompt | null = null;
	if (result.prompt !== null) { const value = object(result.prompt, ['id','actor','kind','options']); text(value.id); role(value.actor); if ((value.kind !== 'coin' && value.kind !== 'receive') || !Array.isArray(value.options) || value.options.length !== 2) throw Error('Invalid prompt'); const expected = value.kind === 'coin' ? ['heads','tails'] : ['receive','kick']; if (!value.options.every(option => typeof option === 'string' && expected.includes(option)) || new Set(value.options).size !== 2) throw Error('Invalid options'); prompt = value as SetupPrompt; }
	let saveResume: SaveResumeStatus | undefined;
	let clock: MatchClock | undefined;
	let passing: PassingRanges | undefined;
	let kickoff: KickoffPresentation | undefined;
	if (Object.hasOwn(result, 'kickoff')) {
		const value = object(result.kickoff, ['version','event','actor','stage','allowed','completed','selected']);
		role(value.actor); integer(value.allowed, 32); integer(value.completed, 32); integer(value.selected, 32);
		if (value.version !== 1 || !['QUICK_SNAP','CHARGE','HIGH_KICK','SOLID_DEFENCE'].includes(value.event as string)
			|| !['selection','movement'].includes(value.stage as string) || (value.completed as number) > (value.allowed as number)
			|| (value.selected as number) > (value.allowed as number) || result.phase !== 'PLAY') throw Error('Invalid kickoff guidance');
		kickoff = value as KickoffPresentation;
	}
	if (Object.hasOwn(result, 'threats')) {
		const value = object(result.threats, ['version', 'eligiblePlayerIds', 'zonePlayerIds']);
		const charge = result.turnMode === 'BLITZ' || kickoff?.event === 'CHARGE' && kickoff.actor === result.callerRole;
		if (value.version !== 1 || result.phase !== 'PLAY' || result.callerRole === 'spectator' || result.actor !== result.callerRole
			|| result.turnMode !== 'REGULAR' && !charge) throw Error('Invalid threat context');
		for (const name of ['eligiblePlayerIds', 'zonePlayerIds']) {
			const ids = value[name];
			if (!Array.isArray(ids) || ids.length > 32 || new Set(ids).size !== ids.length) throw Error('Invalid threat players');
			for (const id of ids) {
				text(id);
				const player = players.find(player => player.id === id);
				if (!player || player.x === null || player.y === null || name === 'eligiblePlayerIds' && player.role !== result.callerRole)
					throw Error('Invalid threat player');
			}
		}
	}
	if (Object.hasOwn(result, 'passing')) {
		const value = object(result.passing, ['version','playerId','from','weatherPenalty','rangeLimited','ranges']);
		const from = object(value.from, ['x','y']); integer(from.x, 25); integer(from.y, 14);
		integer(value.weatherPenalty, 1);
		const passer = players.find(player => player.id === value.playerId);
		if (value.version !== 1 || typeof value.rangeLimited !== 'boolean' || result.phase !== 'PLAY' || !passer
			|| passer.id !== result.activePlayerId || passer.x !== from.x || passer.y !== from.y
			|| !Array.isArray(value.ranges) || value.ranges.length !== 26
			|| !value.ranges.every(row => typeof row === 'string' && /^[QSLBR-]{15}$/.test(row))
			|| value.ranges[from.x][from.y] !== '-') throw Error('Invalid passing ranges');
		for (const action of actions) if (action.kind === 'pass' && (action.sourcePlayerId !== passer.id
			|| !action.target || !('x' in action.target) || value.ranges[action.target.x][action.target.y] === '-')) throw Error('Unavailable pass target');
		passing = value as PassingRanges;
	}
	if (Object.hasOwn(result, 'clock')) {
		const value = object(result.clock, ['activeRole','turnElapsedMs','homeReserveMs','awayReserveMs']);
		if (value.activeRole !== null) role(value.activeRole);
		integer(value.turnElapsedMs, Number.MAX_SAFE_INTEGER);
		integer(value.homeReserveMs, 600_000);
		integer(value.awayReserveMs, 600_000);
		if (value.activeRole === null && value.turnElapsedMs !== 0) throw Error('Inactive clock has elapsed time');
		clock = value as MatchClock;
	}
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
	return { ...result, players, actions, ball, prompt, ...(movementForecast ? { movementForecast } : {}), ...(saveResume ? { saveResume } : {}), ...(clock ? { clock } : {}), ...(passing ? { passing } : {}), ...(kickoff ? { kickoff } : {}) } as SetupState;
}
export function decodeSetupState(json: string): SetupResponse {
	if (new TextEncoder().encode(json).length > 65536) throw Error('Response too large');
  const parsed = parseUniqueJson(json);
  const hasSetupErrors = parsed !== null && typeof parsed === 'object' && Object.hasOwn(parsed, 'setupErrors');
  const result = object(parsed, ['version','type','requestId','code','duplicate','state', ...(hasSetupErrors ? ['setupErrors'] : [])]);
  if (hasSetupErrors && (result.code !== 'ILLEGAL_SETUP' || !Array.isArray(result.setupErrors) || result.setupErrors.length > 32
    || result.setupErrors.some(reason => typeof reason !== 'string' || !reason || reason.length > 1000))) throw Error('Invalid setup diagnostics');
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
