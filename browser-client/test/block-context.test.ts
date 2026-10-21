import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { currentBlockContext, decodeBlockContext, decodeBlockHighlight, proposedBlockContext } from '../src/block-context.ts';
import type { BlockContext, BlockHighlight } from '../src/block-context.ts';
import { decodeMovementPreview } from '../src/movement-protocol.ts';
import { playbackBeats, withBlockContext, withConfirmedMove } from '../src/pitch-playback.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import type { SetupAction, SetupPlayer, SetupState } from '../src/setup-protocol.ts';
import { decodeTranscript } from '../src/transcript-protocol.ts';
import type { TranscriptRecord } from '../src/transcript-protocol.ts';

// Deliberately authored presentation metadata: tests never calculate assist eligibility.
const player = (id: string, role: 'home' | 'away', x: number, y: number, slot: number): SetupPlayer => ({
  id, role, x, y, slot, name: id, state: 'standing', art: null, number: slot, position: 'Lineman',
  ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: [], offPitch: 'pitch',
});
const first: BlockHighlight = { playerId: 'attacker', targetPlayerId: 'first', from: { x: 10, y: 7 }, to: { x: 11, y: 7 },
  offensiveAssists: [{ playerId: 'support-first', x: 11, y: 6 }], defensiveAssists: [{ playerId: 'defense', x: 9, y: 7 }] };
const second: BlockHighlight = { ...first, targetPlayerId: 'second', to: { x: 10, y: 8 },
  offensiveAssists: [{ playerId: 'support-second', x: 11, y: 8 }] };
const context: BlockContext = { version: 1, activeTargetPlayerId: 'first', blocks: [first] };
const action: SetupAction = { id: 'block-first', label: 'Block first', kind: 'block', actor: 'home',
  sourcePlayerId: 'attacker', target: { playerId: 'first' } };
const view = decodeSetupStateValue({ projectionVersion: 4, matchId: '00000000-0000-0000-0000-000000000001',
  revision: 1, callerRole: 'home', actor: 'home', phase: 'PLAY', prompt: null,
  players: [player('attacker', 'home', 10, 7, 1), player('first', 'away', 11, 7, 1), player('second', 'away', 10, 8, 2),
    player('support-first', 'home', 11, 6, 2), player('support-second', 'home', 11, 8, 3), player('defense', 'away', 9, 7, 3)],
  weather: 'Nice', homeRerolls: 2, awayRerolls: 2, actions: [action], turn: 1, turnMode: 'REGULAR', ball: null,
  activePlayerId: 'attacker', half: 1, homeTurn: 1, awayTurn: 1, homeScore: 0, awayScore: 0, drive: 1,
  homeTeamName: 'Home', awayTeamName: 'Away', homeResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 },
  awayResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 },
  blockPreview: { version: 1, rolls: [{ playerId: 'attacker', targetPlayerId: 'first', dice: 2, highlight: first }] },
});

test('a private preview requires explicit matching selection, action, acting coach and PLAY phase', () => {
  assert.deepEqual(proposedBlockContext(view, 'attacker', 'first', action, null), context);
  const declaration = { ...action, kind: 'selectBlock', target: { playerId: 'attacker' } };
  assert.deepEqual(proposedBlockContext(view, 'attacker', 'first', declaration, null), context);
  for (const current of [{ ...view, callerRole: 'spectator' as const }, { ...view, callerRole: 'away' as const },
    { ...view, actor: 'away' as const }, { ...view, phase: 'SETUP' as const }, { ...view, blockPreview: undefined }]) {
    assert.equal(proposedBlockContext(current, 'attacker', 'first', action, null), null);
  }
  for (const [selected, target, selectedAction] of [
    ['', 'first', action], ['attacker', '', action], ['attacker', 'second', action], ['second', 'first', action],
    ['attacker', 'first', undefined], ['attacker', 'first', { ...action, actor: 'away' }],
    ['attacker', 'first', { ...action, kind: 'move' }], ['attacker', 'first', { ...action, target: { playerId: 'second' } }],
  ] as [string, string, SetupAction | undefined][]) {
    assert.equal(proposedBlockContext(view, selected, target, selectedAction, null), null);
  }
  assert.equal(proposedBlockContext({ ...view, blockPreview: { version: 1, rolls: [{ playerId: 'attacker', targetPlayerId: 'first', dice: 2 }] } },
    'attacker', 'first', action, null), null, 'dice alone must not invent contributors');
});

test('a blitz highlight belongs to the current route endpoint, revision, actor and selected pair', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/movement-interaction-projections.json', import.meta.url), 'utf8'));
  const current = decodeSetupStateValue(fixture.blitzReadyState);
  const raw = fixture.blitzPlan.plan;
  const from = raw.route.steps.at(-1) ?? raw.route.from;
  const target = current.players.find(player => player.id === raw.targetPlayerId)!;
  const highlight = { playerId: raw.route.playerId, targetPlayerId: raw.targetPlayerId, from,
    to: { x: target.x, y: target.y }, offensiveAssists: [], defensiveAssists: [] };
  const plan = decodeMovementPreview(JSON.stringify({ ...fixture.blitzPlan, plan: { ...raw, blockHighlight: highlight } })).plan;
  assert.deepEqual(proposedBlockContext(current, plan.route.playerId, plan.targetPlayerId!, undefined, plan)?.blocks, [highlight]);
  for (const badPlan of [
    { ...plan, route: { ...plan.route, revision: current.revision - 1 } },
    { ...plan, route: { ...plan.route, actor: 'away' as const } },
    { ...plan, blockHighlight: undefined },
    { ...plan, blockHighlight: { ...plan.blockHighlight!, playerId: 'someone-else' } },
    { ...plan, blockHighlight: { ...plan.blockHighlight!, targetPlayerId: 'someone-else' } },
    { ...plan, blockHighlight: { ...plan.blockHighlight!, from: { x: from.x - 1, y: from.y } } },
  ]) assert.equal(proposedBlockContext(current, plan.route.playerId, plan.targetPlayerId!, undefined, badPlan), null);
  assert.equal(proposedBlockContext(current, plan.route.playerId, 'other-target', undefined, plan), null);
  assert.equal(proposedBlockContext(current, 'other-player', plan.targetPlayerId!, undefined, plan), null);
  assert.equal(proposedBlockContext({ ...current, callerRole: 'spectator' }, plan.route.playerId, plan.targetPlayerId!, undefined, plan), null);
  assert.throws(() => decodeMovementPreview(JSON.stringify({ ...fixture.blitzPlan,
    plan: { ...raw, blockHighlight: { ...highlight, from: { x: from.x - 1, y: from.y } } } })));
});

test('Multiple Block selects independent authoritative assists without losing either direction', () => {
  const multiple: BlockContext = { ...context, blocks: [first, second] };
  const multiAction = { ...action, id: 'both-targets', kind: 'multiBlock' };
  const current = { ...view, blockPreview: { ...view.blockPreview!, multiple: [{ actionId: multiAction.id, context: multiple }] } };
  for (const target of ['first', 'second']) {
    const proposal = proposedBlockContext(current, 'attacker', target, multiAction, null)!;
    assert.equal(proposal.activeTargetPlayerId, target);
    assert.deepEqual(proposal.blocks, [first, second]);
    assert.deepEqual(proposal.blocks.find(block => block.targetPlayerId === target)?.offensiveAssists,
      target === 'first' ? first.offensiveAssists : second.offensiveAssists);
  }
  assert.equal(multiple.activeTargetPlayerId, 'first', 'changing selection must not mutate the authoritative option');
  assert.equal(proposedBlockContext(current, 'attacker', 'first', { ...multiAction, id: 'other-option' }, null), null);
});

test('remote blitz proposals use the projected blocking square while the attacker is still at its live square', () => {
  const highlight: BlockHighlight = { ...first, from: { x: 10, y: 6 } };
  const response = { version: 2, type: 'movementPreview', requestId: 'remote-blitz', code: 'ACCEPTED', matchId: view.matchId,
    plan: { planVersion: 1, kind: 'blitz', targetPlayerId: 'first', waypoints: [{ x: 10, y: 6 }], blockHighlight: highlight,
      route: { routeVersion: 3, playerId: 'attacker', from: { x: 10, y: 7 }, remaining: 8, revision: view.revision, actor: 'home',
        steps: [{ x: 10, y: 6, dodge: 0, rush: 0, dodgeModifier: 0, reactions: [], checks: [] }] } } };
  const plan = decodeMovementPreview(JSON.stringify(response)).plan;
  assert.deepEqual(proposedBlockContext(view, 'attacker', 'first', undefined, plan), { ...context, blocks: [highlight] });
  assert.equal(view.players.find(player => player.id === 'attacker')!.y, 7);
  assert.throws(() => decodeMovementPreview(JSON.stringify({ ...response,
    plan: { ...response.plan, blockHighlight: first } })), 'the live square cannot replace the projected endpoint');
});

test('committed context survives coach changes and contributor movement but clears each moved target', () => {
  const committed = { ...view, blockContext: { ...context, blocks: [first, second] } };
  for (const callerRole of ['home', 'away', 'spectator'] as const) {
    assert.deepEqual(currentBlockContext({ ...committed, callerRole }), committed.blockContext);
  }
  const contributorMoved = withConfirmedMove(committed, { playerId: 'support-first', x: 20, y: 10 });
  assert.deepEqual(contributorMoved.blockContext, committed.blockContext, 'rolled contributors remain frozen');
  const attackerMoved = withConfirmedMove(contributorMoved, { playerId: 'attacker', x: 12, y: 7 });
  assert.deepEqual(attackerMoved.blockContext, committed.blockContext, 'only target movement clears committed markers');
  const targetMoved = withConfirmedMove(attackerMoved, { playerId: 'first', x: 12, y: 8 });
  assert.deepEqual(targetMoved.blockContext, { ...context, activeTargetPlayerId: 'second', blocks: [second] });
  const cleared = withConfirmedMove(targetMoved, { playerId: 'second', x: 10, y: 9 });
  assert.equal(cleared.blockContext, undefined);
  assert.equal(currentBlockContext({ ...committed, phase: 'FULL_TIME' }), null);
  assert.equal(currentBlockContext({ ...committed, players: committed.players.filter(player => player.id !== 'first' && player.id !== 'second') }), null);
  assert.equal(withBlockContext(committed, null).blockContext, undefined);
  assert.deepEqual(withConfirmedMove(committed, { playerId: 'second', x: 10, y: 9 }).blockContext, context,
    'clearing an inactive target keeps the active target and its assists');
  assert.equal(committed.blockContext.blocks.length, 2, 'playback must not mutate an earlier snapshot');
});

test('malformed block metadata is rejected before rendering', () => {
  assert.deepEqual(decodeBlockContext(context, view.players), context);
  assert.deepEqual(decodeBlockContext({ ...context, blocks: [first, second] }, view.players).blocks, [first, second]);
  for (const invalid of [null, [], { ...context, extra: true }, { ...context, version: 2 }, { ...context, blocks: [] },
    { ...context, blocks: [first, first] }, { ...context, blocks: [first, second, first] },
    { ...context, activeTargetPlayerId: 'missing' }, { ...context, blocks: [first, { ...second, playerId: 'support-first' }] }]) {
    assert.throws(() => decodeBlockContext(invalid, view.players));
    assert.throws(() => decodeSetupStateValue({ ...view, blockContext: invalid }));
  }
  for (const invalid of [
    { ...first, playerId: 'missing' }, { ...first, targetPlayerId: first.playerId }, { ...first, targetPlayerId: 'support-first' },
    { ...first, from: { x: -1, y: 7 } }, { ...first, to: { x: 26, y: 7 } }, { ...first, to: { x: 11, y: 15 } },
    { ...first, to: { x: 11.5, y: 7 } }, { ...first, to: { x: 15, y: 7 } }, { ...first, to: first.from },
    { ...first, offensiveAssists: null }, { ...first, offensiveAssists: Array(9).fill(first.offensiveAssists[0]) },
    { ...first, offensiveAssists: [first.offensiveAssists[0], first.offensiveAssists[0]] },
    { ...first, offensiveAssists: [{ playerId: 'attacker', x: 10, y: 7 }] },
    { ...first, offensiveAssists: [{ playerId: 'defense', x: 10, y: 6 }] },
    { ...first, offensiveAssists: [{ playerId: 'missing', x: 10, y: 6 }] },
    { ...first, offensiveAssists: [{ playerId: 'support-first', x: 20, y: 6 }] },
    { ...first, defensiveAssists: [{ playerId: 'support-first', x: 10, y: 6 }] },
    { ...first, defensiveAssists: [{ playerId: 'defense', x: 9, y: 7, counted: true }] },
  ]) {
    assert.throws(() => decodeBlockHighlight(invalid, view.players));
    assert.throws(() => decodeSetupStateValue({ ...view, blockContext: { ...context, blocks: [invalid] } }));
    assert.throws(() => decodeSetupStateValue({ ...view, blockPreview: { version: 1,
      rolls: [{ playerId: 'attacker', targetPlayerId: 'first', dice: 2, highlight: invalid }] } }));
  }
  assert.throws(() => decodeSetupStateValue({ ...view, blockPreview: { version: 1,
    rolls: [{ playerId: 'attacker', targetPlayerId: 'first', dice: 2, highlight: second }] } }), 'forecast identity must match its highlight');
});

test('replay emits committed context before its roll and explicitly clears it after target movement', () => {
  const record: TranscriptRecord = { index: 1, revision: 1, kind: 'ACTION', actor: 'home', at: 1, decision: {},
    state: { ...view, actions: [], prompt: null }, native: [
      ...['blockRoll', 'blockReRoll', 'blockChoice'].map((reportId, index) => ({ commandNr: index + 1, blockContext: context,
        reportList: { reports: [{ reportId, blockRoll: [6, 3], diceIndex: 1,
          logBlock: { version: 1, attackerId: 'attacker', defenderId: 'first', chooser: 'away' } }] } })),
      { commandNr: 4, modelChangeList: { modelChangeArray: [{ modelChangeId: 'fieldModelSetPlayerCoordinate',
        modelChangeKey: 'first', modelChangeValue: { x: 12, y: 7 } }] } },
      { commandNr: 5, blockContext: null },
    ] };
  const decoded = decodeTranscript(JSON.stringify({ version: 2, type: 'matchTranscript', requestId: 'block-test', code: 'ACCEPTED',
    matchId: view.matchId, page: { formatVersion: 2, from: 1, next: 2, total: 2, records: [record] } })).page.records[0];
  const beats = playbackBeats(decoded);
  assert.deepEqual(beats.map(beat => beat.kind), ['block', 'dice', 'block', 'dice', 'block', 'dice', 'move', 'block']);
  const rolls = beats.filter(beat => beat.kind === 'dice');
  assert.equal(rolls.length, 3);
  for (const roll of rolls) {
    assert.deepEqual(roll.dice.blockContext, context);
    assert.equal(roll.dice.uphill, true);
    assert.equal(roll.dice.chooser, 'away');
  }
  assert.equal(rolls.at(-1)!.dice.selected, 1);
  let played: SetupState = view;
  for (const beat of beats) {
    if (beat.kind === 'block') played = withBlockContext(played, beat.context);
    if (beat.kind === 'move') {
      played = withConfirmedMove(played, beat.move);
      assert.equal(played.blockContext, undefined, 'the target move clears markers before the next playback wait');
    }
  }
  assert.equal(played.blockContext, undefined);
  assert.deepEqual(playbackBeats({ ...record, native: [] }), [], 'private preview metadata never creates replay beats');
  assert.deepEqual(withBlockContext(view, context).blockContext, context, 'seeking back can restore the committed moment');
  assert.throws(() => decodeTranscript(JSON.stringify({ version: 2, type: 'matchTranscript', requestId: 'block-test', code: 'ACCEPTED',
    matchId: view.matchId, page: { formatVersion: 2, from: 1, next: 2, total: 2,
      records: [{ ...record, native: [{ commandNr: 1, blockContext: { ...context, activeTargetPlayerId: 'missing' } }] }] } })));
});
