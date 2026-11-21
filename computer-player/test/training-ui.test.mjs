import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { get } from 'node:http';
import { fork, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trainingServer, runOptions, savedRuns } from '../training/ui-server.mjs';

test('settings reject arbitrary execution, odd pairs, and excessive budgets; profiles retain automatic workers', () => {
  assert.throws(() => runOptions({java:'arbitrary'}));
  assert.throws(() => runOptions({games:3}));
  assert.throws(() => runOptions({budgetSeconds:86401}));
  assert.throws(() => runOptions({home:'learned'}));
  assert.equal(runOptions({profile:'high',workers:''}).workers,undefined);
  assert.equal(runOptions({workers:2}).workers,2);
  const launcher = fileURLToPath(new URL('../training/ui-server.mjs', import.meta.url));
  const invalidMode = spawnSync(process.execPath, [launcher, '--read-only', 'onn'], {encoding:'utf8', timeout:5000});
  assert.equal(invalidMode.status, 1);
  assert.match(invalidMode.stderr, /--read-only expects on or off/);
});
test('real IPC bridge retains a stop requested during asynchronous engine preparation', async () => {
  const root = await mkdtemp(join(tmpdir(),'training-ui-ipc-'));
  await mkdir(join(root,'computer-player/training'),{recursive:true});
  await writeFile(join(root,'computer-player/training/run.mjs'),`export async function run() { console.log('preparing'); await new Promise(r => setTimeout(r,150)); await new Promise(r => process.once('SIGINT',r)); }`);
  const child = fork(fileURLToPath(new URL('../training/ui-runner.mjs',import.meta.url)),[],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  try {
    const finished = new Promise((resolve,reject) => { child.on('exit',resolve); child.on('error',reject); });
    child.stdout.once('data',() => child.send({type:'stop'}));
    child.send({type:'start',config:{}});
    let timer;
    try { assert.equal(await Promise.race([finished,new Promise((_,reject) => { timer = setTimeout(() => reject(Error('IPC stop timed out')),5000); })]),0); }
    finally { clearTimeout(timer); }
  } finally { if (child.exitCode === null) child.kill(); await rm(root,{recursive:true,force:true}); }
});
test('local lifecycle, request isolation, history and read-only capability', async () => {
  const root = await mkdtemp(join(tmpdir(),'training-ui-'));
  await mkdir(join(root,'.tools')); await writeFile(join(root,'.tools/training-classpath.txt'),'fixture');
  const messages = [], children = [];
  const launch = () => { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.send = msg => messages.push(msg); children.push(child); return child; };
  const app = await trainingServer({root,launch});
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const state = () => fetch(`${origin}/api/training/state`).then(r => r.json());
  try {
    const page = await fetch(`${origin}/training`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /data-training-launcher/);
    assert.doesNotMatch(html, /account-menu\.js/);
    assert.equal((await fetch(`${origin}/api/training/state`,{headers:{Origin:'https://evil.invalid'}})).status,403);
    const rebinding = await new Promise(resolve => get(`${origin}/api/training/state`,{headers:{Host:'evil.invalid'}},response => { response.resume(); resolve(response.statusCode); }));
    assert.equal(rebinding,403);
    const first = await state();
    const headers = {'Content-Type':'application/json',Origin:origin,'X-Training-Token':first.token};
    const post = (action,body,custom = headers) => fetch(`${origin}/api/training/${action}`,{method:'POST',headers:custom,body:JSON.stringify(body)});
    assert.equal((await post('start',{},{})).status,403);
    assert.equal((await post('start',{games:20})).status,202);
    assert.equal((await post('start',{})).status,409);
    assert.equal(messages[0].config.games,20);
    children[0].stderr.emit('data','progress');
    assert.equal((await state()).active.log,'progress');
    assert.equal((await post('stop',{})).status,200);
    assert.equal(messages[1].type,'stop');
    assert.equal((await state()).active.status,'stopping');
    children[0].emit('exit',0);
    assert.equal((await state()).active.status,'stopped');
    const out = join(root,'.tools/training/run'); await mkdir(out,{recursive:true});
    await writeFile(join(out,'summary.json'),JSON.stringify({config:{games:2},completed:2,records:[]}));
    assert.equal((await savedRuns(join(root,'.tools/training')))[0].completed,2);
  } finally { await new Promise(resolve => app.server.close(resolve)); }
  const viewer = await trainingServer({root,readOnly:true,launch});
  await new Promise(resolve => viewer.server.listen(0,'127.0.0.1',resolve));
  try {
    const address = `http://127.0.0.1:${viewer.server.address().port}`;
    const info = await fetch(`${address}/api/training/state`).then(r => r.json());
    assert.equal(info.controls,false); assert.equal(info.token,undefined);
    assert.equal((await fetch(`${address}/api/training/start`,{method:'POST'})).status,403);
  } finally { await new Promise(resolve => viewer.server.close(resolve)); await rm(root,{recursive:true,force:true}); }
});
