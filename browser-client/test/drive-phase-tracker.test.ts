import assert from 'node:assert/strict';
import test from 'node:test';
import { drivePhaseRows } from '../src/drive-phase-tracker.ts';
import { decodeSetupStateValue } from '../src/setup-protocol.ts';
import type { DriveTrackerPresentation, SetupState } from '../src/setup-protocol.ts';
import { assertV2Projection } from '../src/v2-projection.ts';

const tracker: DriveTrackerPresentation = { version: 1, receivingRole: 'away', phase: 'KICKING_SETUP',
  secretWeapons: false, knockouts: false, event: null, eventComplete: false };
const state: SetupState = { projectionVersion: 4, matchId: '12345678-1234-1234-1234-123456789abc', revision: 2,
  callerRole: 'home', phase: 'SETUP', actor: 'home', prompt: null, players: [], weather: 'NICE', homeRerolls: 0,
  awayRerolls: 0, actions: [], turn: 0, turnMode: 'SETUP', ball: null, activePlayerId: null, half: 1, homeTurn: 0,
  awayTurn: 0, homeScore: 0, awayScore: 0, drive: 1, homeTeamName: 'Home', awayTeamName: 'Away',
  homeResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 },
  awayResources: { apothecaries: 0, assistantCoaches: 0, cheerleaders: 0 } };

test('ordinary drive phases advance one current bar and retain the final upcoming cue', () => {
  for (const [index, phase] of ['KICKING_SETUP','RECEIVING_SETUP','KICK_TARGET','KICKOFF'].entries()) {
    const rows = drivePhaseRows({ ...tracker, phase: phase as DriveTrackerPresentation['phase'] });
    assert.equal(rows.length, 5);
    assert.equal(rows.filter(row => row.current).length, 1);
    assert.equal(rows[index].current, true);
    assert.equal(rows.filter(row => row.past).length, index);
    assert.equal(rows.at(-1)?.label, 'Receiving player acts.');
    assert.equal(rows.at(-1)?.current, false);
  }
  assert.deepEqual(drivePhaseRows(undefined), []);
});

test('automatic checks remain completed from authoritative applicability and reset without browser history', () => {
  for (const secretWeapons of [false, true]) for (const knockouts of [false, true]) {
    const rows = drivePhaseRows({ ...tracker, secretWeapons, knockouts });
    assert.equal(rows.length, 5 + Number(secretWeapons) + Number(knockouts));
    const checks = rows.filter(row => ['SECRET_WEAPONS','KNOCKOUTS'].includes(row.id));
    assert.deepEqual(checks.map(row => row.id), [ ...(secretWeapons ? ['SECRET_WEAPONS'] : []), ...(knockouts ? ['KNOCKOUTS'] : []) ]);
    assert.ok(checks.every(row => row.past && !row.current));
  }
  assert.equal(drivePhaseRows(tracker).length, 5);
});

test('all four decision events replace the kickoff highlight, then fade when kickoff handling continues', () => {
  for (const [event, label] of [['HIGH_KICK','High Kick'], ['SOLID_DEFENCE','Solid Defense'],
    ['QUICK_SNAP','Quick Snap'], ['CHARGE','Charge!']] as const) {
    const active = { ...tracker, phase: 'KICKOFF' as const, event };
    const rows = drivePhaseRows(active);
    assert.equal(rows[3].id, 'KICKOFF');
    assert.equal(rows[3].past, true);
    assert.equal(rows[3].current, false);
    assert.deepEqual(rows[4], { id: event, label, event: true, past: false, current: true });
    assert.equal(rows[5].id, 'RECEIVING_PLAY');
    const completed = drivePhaseRows({ ...active, eventComplete: true });
    assert.equal(completed[4].past, true);
    assert.equal(completed[4].current, false);
    assert.equal(completed[3].current, true);
  }
});

test('versioned drive presentation reaches permitted player and spectator projections; old snapshots remain valid', () => {
  assert.equal(decodeSetupStateValue(state).driveTracker, undefined);
  for (const callerRole of ['home','away','spectator'] as const) {
    const projected = { ...state, callerRole, driveTracker: tracker };
    assertV2Projection({ version: 2, type: 'setupState', requestId: null, code: 'ACCEPTED', duplicate: false, state: projected });
    assert.deepEqual(decodeSetupStateValue(projected, true).driveTracker, tracker);
  }
  assert.doesNotThrow(() => decodeSetupStateValue({ ...state, phase: 'READY_FOR_KICKOFF', driveTracker: { ...tracker, phase: 'KICK_TARGET' } }));
  assert.doesNotThrow(() => decodeSetupStateValue({ ...state, phase: 'PLAY', driveTracker: { ...tracker, phase: 'KICKOFF', event: 'CHARGE' } }));
});

test('drive metadata rejects unknown fields, malformed flags, invalid versions and inconsistent phases', () => {
  for (const bad of [null, { ...tracker, version: 2 }, { ...tracker, receivingRole: 'spectator' },
    { ...tracker, phase: 'REGULAR' }, { ...tracker, secretWeapons: 1 }, { ...tracker, knockouts: null },
    { ...tracker, eventComplete: 'false' }, { ...tracker, eventComplete: true }, { ...tracker, event: 'HIGH_KICK' },
    { ...tracker, nativeStepStack: [] }, { ...tracker, phase: 'KICKOFF', event: 'BLITZ' }])
    assert.throws(() => decodeSetupStateValue({ ...state, driveTracker: bad }));
  for (const phase of ['PRE_MATCH','READY_FOR_KICKOFF','PLAY','FULL_TIME'])
    assert.throws(() => decodeSetupStateValue({ ...state, phase, driveTracker: tracker }));
  assert.throws(() => decodeSetupStateValue({ ...state, projectionVersion: 3, driveTracker: tracker }));
});


test('Kick landing previews preserve off-pitch deviation and reject malformed squares', () => {
  const preview = { deviation: { x: 28, y: -2 }, withKick: { x: 25, y: 1 } };
  assert.deepEqual(decodeSetupStateValue({ ...state, kickPreview: preview }).kickPreview, preview);
  for (const square of [{ x: 32, y: 1 }, { x: 2.5, y: 1 }, { x: 1, y: -7 }, { x: 1, y: 1, extra: true }])
    assert.throws(() => decodeSetupStateValue({ ...state, kickPreview: { ...preview, deviation: square } }));
});
