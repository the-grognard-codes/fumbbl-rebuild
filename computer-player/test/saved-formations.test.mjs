import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { decodeSetupStateValue } from '../../browser-client/src/setup-protocol.ts';
import { chooseDecision } from '../src/policy.mjs';
import { chooseBogrukDecision } from '../src/bogruk-policy.mjs';

test('both computer policies preserve a formation already deployed and completed by the server', () => {
  const state = { phase: 'SETUP', actor: 'away', callerRole: 'away', revision: 1, prompt: null, actions: [], players: [],
    savedFormations: [{ name: 'Chevron Defense', index: 0 }],
    computer: { seed: 1, policyState: null, progress: { turnKey: '1:1' } } };
  assert.deepEqual(chooseDecision(state), { operation: 'confirm' });
  assert.deepEqual(chooseBogrukDecision(state).decision, { operation: 'confirm' });
  assert.equal(chooseDecision({ ...state, actor: 'home' }), null);
});

for (const role of ['home','away']) for (const coach of ['bogruk','gobbo']) for (const available of [10,2,1]) {
  test(`${coach} repairs a rejected casualty formation with ${available} players and no spare reserve as ${role}`, async () => {
    const captured = JSON.parse(await readFile(new URL('./fixtures/casualty-setup.json',import.meta.url),'utf8'));
    const state = decodeSetupStateValue(captured);
    state.players = state.players.filter(p=>p.role==='home');
    let count = 0;
    for (const player of state.players) {
      if (player.offPitch !== 'casualty' && ++count > available) { player.offPitch='casualty'; player.x=null;player.y=null; }
      player.role=role; if(role==='away' && player.x!==null) player.x=25-player.x;
    }
    state.actor=role;state.callerRole=role;
    state.computer={seed:43,attackDirection:role==='home'?1:-1,progress:{turnKey:'1:2:4'}};
    const choose = variant => coach==='bogruk' ? chooseBogrukDecision(state,{setupVariant:variant}).decision : chooseDecision(state,()=>0.5,0,variant);
    assert.deepEqual(choose(0),{operation:'confirm'},'The initial saved-formation shortcut remains intact');
    let confirmed=false;
    for(let step=0;step<30;step++) {
      const decision=choose(1); assert.ok(decision,'Must rearrange existing players without needing a reserve');
      if(decision.operation==='confirm') { confirmed=true;break; }
      assert.equal(decision.operation,'place');
      const player=state.players.find(p=>p.id===decision.playerId);
      assert.notEqual(player.offPitch,'casualty');
      player.x=decision.to?.x??null;player.y=decision.to?.y??null;player.offPitch=decision.to?'pitch':'reserve';
    }
    assert.ok(confirmed,'Repair must converge');
    const onPitch=state.players.filter(p=>p.x!==null);
    assert.equal(onPitch.length,available);
    assert.equal(onPitch.filter(p=>p.x===(role==='home'?12:13)).length,Math.min(3,available));
    assert.ok(onPitch.every(p=>role==='home'?p.x<=12:p.x>=13));
    assert.ok(onPitch.filter(p=>p.y<4).length<=2);
    assert.ok(onPitch.filter(p=>p.y>10).length<=2);
    assert.equal(new Set(onPitch.map(p=>`${p.x},${p.y}`)).size,available);
  });
}
