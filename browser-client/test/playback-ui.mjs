import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const initial = JSON.parse(readFileSync(new URL('./fixtures/m5a-blitz-projections.json', import.meta.url), 'utf8'))[0].actor;
const pickupReport = JSON.parse(readFileSync(new URL('./fixtures/adr0003-dice.json', import.meta.url), 'utf8'))[0].reports[0];
const state = (revision, x = 7) => ({ ...initial, revision, players: initial.players.map((player,index) => index ? player : { ...player, x }), actions: [] });
const change = x => ({ modelChangeId: 'fieldModelSetPlayerCoordinate', modelChangeKey: 'home1', modelChangeValue: { x, y: 7 } });
const dice = { reportId: 'blockRoll', blockRoll: [1,3,6], defenderId: 'away1' };
const record = (revision, x = 7, native = []) => ({ index: revision, revision, kind: 'action', actor: 'home', at: revision, decision: null, native, state: state(revision,x) });
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1280, height: 660 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const publish = input => page.evaluate(input => window.publishPlayback(input), { enabled: true, mode: 'live', ...input });
const wait = (revision, x) => page.waitForFunction(({revision,x}) => { const out = document.querySelector('#playback-state'); return Number(out.dataset.revision) === revision && Number(out.dataset.x) === x && out.dataset.active === 'false'; }, {revision,x});
try {
  await page.addInitScript(input => { window.playbackInput = input; window.playbackFrames = []; }, { view: state(0), records: [record(0)], enabled: true, mode: 'live' });
  await page.route('**/playback-test', route => route.fulfill({ contentType: 'text/html', body: '<style>html,body{margin:0;background:#101c2b}#dice-specimens{display:flex;gap:8px;padding:8px}#dice-specimens svg{width:64px;height:64px}</style><div id="app"></div><script type="module" src="/test/playback-ui-harness.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/playback-test`);
  await wait(0,7);
  const rolled = record(1,7,[{ reportList: { reports:[dice] } }]);
  await publish({ view: { ...state(1), actions: [{ id:'choice',kind:'blockDie',actor:'home',label:'Choose POW (die 3)',sourcePlayerId:'home1',target:null }] }, records:[record(0),rolled] });
  await page.locator('#required-choice').waitFor();
  assert.equal(await page.locator('#playback-state').getAttribute('data-active'), 'false', 'Dice decoration cannot hold the mandatory response');
  const shown = page.locator('.live-dice-overlay .match-die');
  assert.equal(await shown.count(),3);
  assert.deepEqual(await shown.evaluateAll(elements => elements.map(element => element.dataset.face)), ['SKULL','PUSHBACK','POW']);
  const animations = await shown.evaluateAll(elements => elements.flatMap(element => element.getAnimations().map(animation => ({ duration:animation.effect.getTiming().duration,frames:animation.effect.getKeyframes() }))));
  assert.equal(animations.length,3); assert.ok(animations.every(animation => animation.duration === 440));
  assert.ok(animations.every(animation => animation.frames.every(frame => !frame.transform || !/translate\([^)]*[4-9]px/.test(frame.transform))));
  // A newer accepted board takes effect while old dice are still spinning.
  await publish({ view: state(2,8), records:[record(0),rolled,record(2,8)] }); await wait(2,8);
  assert.equal(await page.locator('.live-dice-overlay').count(),0);
  const moves = record(3,11,[{ modelChangeList: { modelChangeArray:[change(9),change(10),change(11)] } }]);
  await page.evaluate(() => { window.playbackFrames = []; });
  await publish({ view:state(3,11),records:[record(0),rolled,record(2,8),moves] }); await wait(3,11);
  const squares = await page.evaluate(() => window.playbackFrames.map(frame=>frame.x).filter((x,index,all)=>!index||all[index-1]!==x));
  assert.deepEqual(squares,[9,10,11], 'Confirmed movement keeps every square in command order');
  // An interrupted route exposes its new required response before old beats finish.
  await publish({ view:state(4,14),records:[record(0),rolled,record(2,8),moves,record(4,14,[{modelChangeList:{modelChangeArray:[change(12),change(13),change(14)]}}])] });
  await page.waitForFunction(()=>document.querySelector('#playback-state').dataset.active==='true');
  await publish({ view:{...state(5,12),actions:[{id:'reroll',kind:'blockDie',actor:'home',label:'Choose SKULL (die 1)',sourcePlayerId:'home1',target:null}]},records:[] });
  await wait(5,12); await page.locator('#required-choice').waitFor();
  await page.waitForTimeout(450); await wait(5,12);
  // Seek backwards during movement: stale timers cannot write over the snapshot.
  await publish({ view:state(6,15),records:[record(0),rolled,record(2,8),moves,record(4),record(5,12),record(6,15,[{ modelChangeList:{modelChangeArray:[change(13),change(14),change(15)]} }])], mode:'replay' });
  await page.waitForFunction(()=>document.querySelector('#playback-state').dataset.active==='true');
  await publish({ view:state(1), records:[record(0),rolled],mode:'replay' }); await wait(1,7);
  await page.waitForTimeout(500); await wait(1,7);
  await publish({ view:state(8,20),records:[],mode:'replay' }); await wait(8,20);
  // Disconnect/reconnect is a late subscription, not historical catch-up.
  await publish({view:state(9,21),records:[],enabled:false}); await wait(9,21);
  await publish({view:state(9,21),records:[]}); await wait(9,21);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{window.playbackFrames=[];});
  await publish({view:state(10,24),records:Array.from({length:11},(_,revision)=>record(revision,revision===10?24:21,revision===10?[{reportList:{reports:[dice]},modelChangeList:{modelChangeArray:[change(22),change(23),change(24)]}}]:[]))});
  await wait(10,24);
  assert.deepEqual(await page.evaluate(()=>window.playbackFrames.map(frame=>frame.x).filter((x,index,all)=>!index||all[index-1]!==x)),[22,23,24], 'Reduced motion exposes every ordered discrete square');
  assert.equal(await page.locator('#playback-state').getAttribute('data-roll-key'),'');
  assert.equal(await page.locator('.live-dice-overlay .match-die').evaluateAll(elements=>elements.flatMap(element=>element.getAnimations()).length),0);
  // A mandatory prompt must stay reachable even when its transcript is late.
  await publish({view:{...state(11,22),prompt:{id:'coin',actor:'home',kind:'coin',options:['heads','tails']}},records:[]}); await wait(11,22);
  // The result remains beside a pending reroll after its decorative animation ends.
  await page.emulateMedia({reducedMotion:'no-preference'});
  const pending = { ...state(12,22), actions: [
    { id:'decline',kind:'reroll',actor:'home',label:'Do not re-roll Pick Up',sourcePlayerId:'home1',target:null },
    { id:'team',kind:'reroll',actor:'home',label:'Use team re-roll for Pick Up',sourcePlayerId:'home1',target:null }
  ] };
  await publish({ view: pending, interactive: true, records: Array.from({length:13},(_,revision)=>record(revision,22,
    revision===12?[{reportList:{reports:[pickupReport]}}]:[])) });
  await wait(12,22);
  const promptDice = page.getByRole('dialog').getByRole('status').locator('.match-die');
  await promptDice.waitFor(); await page.waitForTimeout(500);
  assert.equal(await promptDice.count(),1, 'A pending reroll retains its die after 440ms');
  assert.equal(await promptDice.getAttribute('data-face'), String(pickupReport.roll), 'A pending reroll retains the native result after 440ms');
  assert.equal(await promptDice.evaluateAll(elements=>elements.flatMap(element=>element.getAnimations()).length),0, 'Retaining the result does not extend the animation');
  await publish({ view:state(13,22),interactive:true,records:[] }); await wait(13,22);
  assert.equal(await page.locator('.live-dice-overlay .match-die').count(),0, 'Accepted prompt resolution clears the old result');
  const success = record(14,24,[5,4,6,2].map((roll,index) => ({
    reportList:{reports:[{reportId:index===3?'goForItRoll':'dodgeRoll',roll,successful:true,playerId:'home1'}]},
    modelChangeList:{modelChangeArray:[change([23,24,25,24][index])]}
  })));
  await publish({ view:state(14,24),interactive:false,records:Array.from({length:15},(_,revision)=>
    revision===14?success:record(revision,22)) });
  const successfulDice = page.locator('.live-dice-overlay[role="status"] .match-die');
  await page.waitForFunction(() => document.querySelector('#playback-state')?.dataset.active === 'true'
    && document.querySelectorAll('.live-dice-overlay[role="status"] .match-die').length === 4);
  assert.deepEqual(await successfulDice.evaluateAll(elements=>elements.map(element=>element.dataset.face)), ['5','4','6','2'],
    'Three dodges and one rush accumulate across movement playback');
  const continuation = record(15,25,[{reportList:{reports:[{reportId:'goForItRoll',roll:3,successful:true,playerId:'home1'}]},
    modelChangeList:{modelChangeArray:[change(25)]}}]);
  await publish({ view:state(15,25),interactive:false,records:Array.from({length:16},(_,revision)=>
    revision===15?continuation:revision===14?success:record(revision,22)) });
  await wait(15,25);
  assert.deepEqual(await successfulDice.evaluateAll(elements=>elements.map(element=>element.dataset.face)), ['5','4','6','2','3'],
    'A later authoritative revision extends the same active-player sequence');
  await page.waitForTimeout(700);
  assert.equal(await successfulDice.count(),5, 'Retention starts after the final roll and movement');
  await successfulDice.first().waitFor({state:'detached',timeout:1000});
  await publish({view:state(15,25),records:[],enabled:false}); await wait(15,25);
  await publish({view:state(15,25),records:[]}); await wait(15,25);
  assert.equal(await successfulDice.count(),0, 'Reconnect does not replay stale retained dice');
  const carried = (revision, x) => ({ ...state(revision, x), ball: { x, y: 7 },
    ballState: { version: 1, carrierPlayerId: 'home1', inPlay: true, moving: false } });
  const history = Array.from({length:18}, (_,revision) => ({ ...record(revision,25), state: carried(revision,25) }));
  await publish({view:carried(16,25),records:history.slice(0,17),enabled:false}); await wait(16,25);
  await page.evaluate(() => { window.playbackFrames = []; });
  history[17] = { ...record(17,22,[{modelChangeList:{modelChangeArray:[change(24),change(23),change(22)]}}]), state:carried(17,22) };
  await publish({view:carried(17,22),records:history}); await wait(17,22);
  const carrierFrames = await page.evaluate(() => window.playbackFrames);
  assert.ok(carrierFrames.some(frame => frame.x === 24) && carrierFrames.some(frame => frame.x === 23));
  assert.ok(carrierFrames.every(frame => frame.ballX === frame.x), 'Carried highlight follows every confirmed playback step');
  assert.equal(await page.locator('.live-ball-football').count(),0, 'Carried ball keeps the highlight without a loose sprite');
  if (process.env.DICE_EVIDENCE_DIR) { await mkdir(process.env.DICE_EVIDENCE_DIR,{recursive:true}); await page.locator('#dice-specimens').screenshot({path:`${process.env.DICE_EVIDENCE_DIR}/ivory-cyan.png`}); }
  assert.deepEqual(errors,[]);
  console.log('PASS: exact authoritative dice, short nonblocking animation, ordered moves, stale-timer-safe seek, current reconnect snapshot, reduced motion and missing-transcript required prompts.');
} finally { await browser.close(); await server.close(); }
