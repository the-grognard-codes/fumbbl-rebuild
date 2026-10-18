import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeMovementPreview } from '../src/movement-protocol.ts';
import { routeCost } from '../src/route-protocol.ts';
import { movementRoutePath, projectJumpLanding } from '../src/jump-presentation.ts';
import { PitchProjection } from '../src/pitch-projection.ts';
import { defaultThreatPreferences } from '../src/threat-preferences.ts';
import { threatColors } from '../src/threat-presentation.ts';

const jump = {x:9,y:7,dodge:0,rush:2,dodgeModifier:-2,reactions:['Diving Tackle'],
  checks:[{name:'Jump' as const,target:5,condition:'entry' as const},{name:'Diving Tackle' as const,target:null,condition:'possible' as const}]};
const route = {routeVersion:4,playerId:'runner',from:{x:7,y:7},remaining:3,steps:[jump],revision:3,actor:'home'};
const plan = {planVersion:1,kind:'move',targetPlayerId:null,waypoints:[{x:9,y:7,jump:true}],route,jumpOptions:[]};
const response = {version:2,type:'movementPreview',requestId:'jump-1',code:'ACCEPTED',matchId:'12345678-1234-1234-1234-123456789abc',plan};

test('jump waypoints preserve explicit identity and cost two movement, while old route versions fail closed', () => {
  const decoded = decodeMovementPreview(JSON.stringify(response)).plan;
  assert.equal(decoded.waypoints[0].jump,true);
  assert.equal(routeCost(decoded.route.steps),2);
  for(const invalid of [
    {...plan,route:{...route,remaining:1}},
    {...plan,route:{...route,routeVersion:3}},
    {...plan,waypoints:[{x:9,y:7}]},
    {...plan,route:{...route,steps:[{...jump,x:8}]},waypoints:[{x:8,y:7,jump:true}]},
    {...plan,jumpOptions:[{...jump,x:10}]},
  ]) assert.throws(() => decodeMovementPreview(JSON.stringify({...response,plan:invalid})));
});

test('read-only starting-square options accept an empty draft and validate each native landing', () => {
  const initial = {...plan,waypoints:[],route:{...route,routeVersion:3,steps:[]},jumpOptions:[jump]};
  assert.equal(decodeMovementPreview(JSON.stringify({...response,plan:initial})).plan.jumpOptions?.length,1);
  assert.throws(() => decodeMovementPreview(JSON.stringify({...response,plan:{...initial,jumpOptions:[jump,jump]}})));
});

test('jump colors reuse threat bands after modifiers and remain visible with normal threats disabled', () => {
  const camera = new PitchProjection({width:1280,height:720,end:'home',mode:'top-down'});
  const preferences = {...defaultThreatPreferences,enabled:false,zoneColors:false,tackle:false};
  const presentation = projectJumpLanding(jump,camera,preferences);
  assert.equal(presentation.color,threatColors[1]);
  assert.ok(presentation.fills.length);
  assert.equal(presentation.target,5);
  assert.ok(presentation.rush);
  const neutral = projectJumpLanding({...jump,dodgeModifier:0},camera,preferences);
  assert.equal(neutral.fills.length,0);
  assert.ok(neutral.outline.length);
  assert.ok(neutral.hatches.length,'Relevant optional stripes survive neutral jump shading');
  assert.equal(projectJumpLanding(jump,camera,{...preferences,divingTackle:false}).fills.length,1);
});

test('only explicitly designated jumps curve in both coach views and both pitch projections', () => {
  for(const end of ['home','away'] as const) for(const mode of ['top-down','perspective'] as const) {
    const camera = new PitchProjection({width:1280,height:720,end,mode});
    assert.match(movementRoutePath([{x:7,y:7},{x:9,y:7,jump:true},{x:10,y:7}],camera),/Q.*L/);
    assert.doesNotMatch(movementRoutePath([{x:7,y:7},{x:8,y:7}],camera),/Q/);
  }
});
