import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePlayerArt, resolvePlayerPortrait, type PlayerFacing } from '../src/player-art.ts';
import type { SetupPlayer } from '../src/setup-protocol.ts';

const human: SetupPlayer = { id: 'person-17', name: 'Any Name', slot: 17, number: 41, role: 'home', x: 12, y: 7,
  state: 'is standing', art: { rosterId: 'human', positionId: 'lineman' }, offPitch: 'pitch' };
const orc: SetupPlayer = { ...human, role: 'away', art: { rosterId: 'orc', positionId: 'orc-blitzer' } };

test('eight canonical directions select five originals and correct mirrored anchors', () => {
  const expected: [PlayerFacing, string, boolean][] = [
    ['north', 'back', false], ['north-east', 'back45', false], ['east', 'side', false],
    ['south-east', 'front45', false], ['south', 'front', false], ['south-west', 'front45', true],
    ['west', 'side', true], ['north-west', 'back45', true],
  ];
  for (const [facing, pose, mirror] of expected) {
    const result = resolvePlayerArt(human, { end: 'home', facing });
    assert.equal(result?.body.pose, pose);
    assert.equal(result?.body.mirror, mirror);
    assert.match(result!.body.url, new RegExp(`/lineman-${pose}\\.png$`));
    const original = resolvePlayerArt(human, { end: 'home', facing: facingsForOriginal[pose] });
    assert.equal(result!.body.bounds.x, mirror ? result!.body.width - original!.body.bounds.x - original!.body.bounds.width : original!.body.bounds.x);
    assert.equal(result!.body.footAnchor.x, mirror ? result!.body.width - original!.body.footAnchor.x : original!.body.footAnchor.x);
    assert.equal(result!.body.groundAnchor.x, mirror ? result!.body.width - original!.body.groundAnchor.x : original!.body.groundAnchor.x);
  }
});

const facingsForOriginal: Record<string, PlayerFacing> = { front: 'south', back: 'north', front45: 'south-east', back45: 'north-east', side: 'east' };

test('away end reverses both ground axes and default facing points toward the opponent', () => {
  assert.equal(resolvePlayerArt(human, { end: 'home' })?.body.pose, 'back');
  assert.equal(resolvePlayerArt(human, { end: 'away' })?.body.pose, 'front');
  assert.equal(resolvePlayerArt(orc, { end: 'home' })?.body.pose, 'front');
  assert.equal(resolvePlayerArt(orc, { end: 'away' })?.body.pose, 'back');
  assert.equal(resolvePlayerArt(human, { end: 'away', facing: 'north-east' })?.body.pose, 'front45');
  assert.equal(resolvePlayerArt(human, { end: 'away', facing: 'north-east' })?.body.mirror, true);
});

test('setup perspective faces each standing team toward its opposing end zone after movement', () => {
  for (const end of ['home', 'away'] as const) {
    const home = resolvePlayerArt(human, { end, facing: 'west', setupPerspective: true });
    const away = resolvePlayerArt(orc, { end, facing: 'east', setupPerspective: true });
    assert.equal(home?.body.pose, end === 'home' ? 'back' : 'front');
    assert.equal(away?.body.pose, end === 'home' ? 'front' : 'back');
    assert.equal(resolvePlayerArt(human, { end, facing: 'west' })?.body.pose, 'side');
    assert.equal(resolvePlayerArt({ ...human, state: 'is prone' }, { end, facing: 'west', setupPerspective: true })?.body.pose, 'prone');
  }
});

test('top-down standing pose is independent of movement facing', () => {
  for (const end of ['home', 'away'] as const) {
    for (const player of [human, orc]) {
      const fixed = resolvePlayerArt(player, { end, topDown: true });
      for (const facing of ['north', 'south', 'east', 'west'] as const) {
        assert.equal(resolvePlayerArt(player, { end, facing, topDown: true })?.body.pose, fixed?.body.pose);
      }
      assert.equal(resolvePlayerArt({ ...player, state: 'is prone' }, { end, facing: 'west', topDown: true })?.body.pose, 'prone');
      assert.equal(resolvePlayerArt({ ...player, state: 'stunned' }, { end, facing: 'east', topDown: true })?.body.pose, 'stunned');
    }
  }
});

test('ground states use unrotated poses while off-pitch cards keep portraits', () => {
  for (const state of ['prone', 'is prone']) {
    assert.equal(resolvePlayerArt({ ...human, state }, { end: 'away', facing: 'west' })?.body.pose, 'prone');
  }
  for (const state of ['stunned', 'has been stunned']) {
    assert.equal(resolvePlayerArt({ ...human, state }, { end: 'away', facing: 'west' })?.body.pose, 'stunned');
  }
  const reserve = { ...human, x: null, y: null, state: 'is in reserve', offPitch: 'reserve' } as const;
  assert.equal(resolvePlayerArt(reserve, { end: 'home' }), null);
  assert.match(resolvePlayerPortrait(reserve)!, /lineman-portrait\.png$/);
});

test('native pending knockdown retains standing artwork until push resolution', () => {
  for (const player of [human, orc]) for (const end of ['home', 'away'] as const) {
    const pending = resolvePlayerArt({ ...player, state: 'is about to fall down' }, { end });
    assert.equal(pending?.body.pose, resolvePlayerArt(player, { end })?.body.pose);
    assert.ok(pending?.body.url);
    assert.equal(resolvePlayerArt({ ...player, state: 'is prone' }, { end })?.body.pose, 'prone');
  }
});

test('authoritative art IDs govern lookup and missing or unknown art falls back', () => {
  assert.equal(resolvePlayerArt({ ...human, name: 'Ogre', number: 99 }, { end: 'home' })?.body.pose, 'back');
  assert.equal(resolvePlayerArt({ ...human, state: 'is unknown' }, { end: 'home' }), null);
  assert.equal(resolvePlayerArt({ ...human, art: { rosterId: 'human', positionId: 'unknown' } }, { end: 'home' }), null);
  assert.equal(resolvePlayerPortrait({ ...human, art: null }), null);
  assert.match(resolvePlayerPortrait(orc)!, /orc-blitzer-portrait\.png$/);
  for (const inherited of ['constructor', '__proto__', 'toString']) {
    assert.equal(resolvePlayerArt({ ...human, art: { rosterId: inherited, positionId: 'lineman' } }, { end: 'home' }), null);
    assert.equal(resolvePlayerPortrait({ ...human, art: { rosterId: inherited, positionId: 'lineman' } }), null);
    assert.equal(resolvePlayerArt({ ...human, art: { rosterId: 'human', positionId: inherited } }, { end: 'home' }), null);
    assert.equal(resolvePlayerPortrait({ ...human, art: { rosterId: 'human', positionId: inherited } }), null);
  }
});
