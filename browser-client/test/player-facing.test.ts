import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { updatePlayerFacings } from '../src/player-facing.ts';
import { resolvePlayerArt } from '../src/player-art.ts';
import type { SetupState } from '../src/setup-protocol.ts';

const frames = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'));
const initial: SetupState = frames[0].actor;
function next(view: SetupState, changes: Partial<SetupState> = {}): SetupState {
  return { ...view, revision: view.revision + 1, ...changes };
}

test('setup dragging and each drive start discard prior movement facing for both teams', () => {
  const old = { home1: 'west', away1: 'east' } as const;
  for (const phase of ['SETUP', 'READY_FOR_KICKOFF'] as const) {
    const setup = next(initial, { phase });
    assert.deepEqual(updatePlayerFacings(old, initial, setup), {});
    const dragged = next(setup, { players: setup.players.map(player => ({ ...player, y: player.y! + 1 })) });
    assert.deepEqual(updatePlayerFacings({}, setup, dragged), {});
    assert.deepEqual(updatePlayerFacings(old, dragged, next(dragged, { phase: 'PLAY' })), {});
  }
  for (const changes of [{ drive: initial.drive + 1 }, { half: 2 as const, drive: initial.drive + 1 }]) {
    assert.deepEqual(updatePlayerFacings(old, initial, next(initial, changes)), {});
  }
});

test('kickoff redeployment cannot carry facing into the first normal turn', () => {
  const kickoff = next(initial, { turnMode: 'SOLID_DEFENCE' });
  assert.deepEqual(updatePlayerFacings({ home1: 'west' }, kickoff, next(kickoff, { turnMode: 'REGULAR' })), {});
});

test('normal play updates movement facing and preserves it across team turns and camera changes', () => {
  const moved = next(initial, { players: initial.players.map(player => player.id === 'home1' ? { ...player, y: player.y! + 1 } : player) });
  const facings = updatePlayerFacings({}, initial, moved);
  assert.equal(facings.home1, 'east');
  const turn = next(moved, { actor: 'away', awayTurn: initial.awayTurn + 1, callerRole: 'away' });
  assert.deepEqual(updatePlayerFacings(facings, moved, turn), facings);
  const player = { ...moved.players[0], art: { rosterId: 'human', positionId: 'lineman' } };
  assert.equal(resolvePlayerArt(player, { end: 'home', facing: facings.home1 })?.body.mirror, false);
  assert.equal(resolvePlayerArt(player, { end: 'away', facing: facings.home1 })?.body.mirror, true);
  assert.equal(resolvePlayerArt(player, { end: 'away', facing: facings.home1, topDown: true })?.body.pose, 'front');
});

test('ordinary special-action mode transitions preserve the whole team movement history', () => {
  const facings = { home1: 'west', away1: 'east' } as const;
  for (const turnMode of ['BLITZ', 'SELECT_BLITZ_TARGET', 'DUMP_OFF', 'PASS_BLOCK', 'HYPNOTIC_GAZE']) {
    const special = next(initial, { turnMode });
    assert.deepEqual(updatePlayerFacings(facings, special, next(special, { turnMode: 'REGULAR' })), facings, turnMode);
  }
  const charge = next(initial, { turnMode: 'BLITZ', kickoff: {
    version: 1, event: 'CHARGE', actor: 'home', stage: 'movement', allowed: 3, completed: 0, selected: 3,
  } });
  assert.deepEqual(updatePlayerFacings(facings, charge, next(charge, { turnMode: 'REGULAR', kickoff: undefined })), {});
});

test('cleared drive facing uses team attack direction in canonical coordinates from either coach view', () => {
  for (const role of ['home', 'away'] as const) for (const end of ['home', 'away'] as const) {
    const player = { ...initial.players[0], role, art: { rosterId: 'human', positionId: 'lineman' } };
    assert.equal(resolvePlayerArt(player, { end })?.body.pose, role === end ? 'back' : 'front');
  }
});
