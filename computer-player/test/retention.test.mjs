import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, mkdir, writeFile, utimes, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retentionPlan, applyRetention } from '../training/retention.mjs';
import { Shards, atomicJson } from '../training/records.mjs';
import { DiagnosticTrace } from '../training/diagnostics.mjs';

test('diagnostic tails and shard caps remain bounded and report omitted data',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'training-details-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const trace=new DiagnosticTrace(4);
  for(let i=0;i<100;i++) trace.add({operation:'apply',request:'x'.repeat(3000)});
  const record=trace.snapshot({id:'a',seed:1}, {phase:'PLAY',huge:'x'.repeat(300000)},'y'.repeat(5000));
  assert.equal(record.events.length,4);assert.equal(record.stateTruncated,true);assert.equal(record.stderr.length,4096);
  const shards=new Shards(directory,'diagnostics-0',100,100);
  assert.equal(await shards.add({small:true}),true);
  assert.equal(await shards.add(record),false);await shards.flush();
  const index=JSON.parse(await readFile(join(directory,'diagnostics-0-index.json'),'utf8'));
  assert.equal(index.droppedRows,1);assert.ok(index.retainedBytes<=100);
});

async function run(root,name,{pin=false,finished=true}={}) {
  const directory=join(root,name);await mkdir(directory);
  await atomicJson(join(directory,finished?'summary.json':'metadata.json'),{schemaVersion:1,records:[]});
  await writeFile(join(directory,'checkpoint.pt'),'model');
  if(pin)await writeFile(join(directory,'keep-details'),'');
  const shards=new Shards(directory,'trajectory-0');await shards.add({episode:'a',features:[1,2,3]});await shards.flush();
  if(finished)await utimes(join(directory,'summary.json'),new Date(0),new Date(0));
  return directory;
}
test('cleanup previews first, preserves compact evidence/checkpoints/pins/active runs and marks pruned indices',async t=>{
  const root=await mkdtemp(join(tmpdir(),'training-retain-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const old=await run(root,'old');const pinned=await run(root,'pinned',{pin:true});const active=await run(root,'active',{finished:false});
  const plan=await retentionPlan(root,{days:30,maxMiB:0});
  assert.equal(plan.selected.length,1);assert.equal(plan.selected[0].directory,await realpath(old));assert.equal(plan.overBudget,true);
  assert.ok((await readFile(join(old,'trajectory-0-00000.jsonl.gz'))).length);
  await applyRetention(plan);
  await assert.rejects(readFile(join(old,'trajectory-0-00000.jsonl.gz')),{code:'ENOENT'});
  for(const path of [join(old,'summary.json'),join(old,'checkpoint.pt'),join(pinned,'trajectory-0-00000.jsonl.gz'),join(active,'trajectory-0-00000.jsonl.gz')])await readFile(path);
  assert.equal(JSON.parse(await readFile(join(old,'trajectory-0-index.json'),'utf8')).pruned,true);
  assert.equal((await retentionPlan(root)).selected.length,0);
});
test('cleanup refuses changed shards and traversal in a manifest',async t=>{
  const root=await mkdtemp(join(tmpdir(),'training-retain-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const old=await run(root,'old');const plan=await retentionPlan(root);
  await writeFile(join(old,'trajectory-0-00000.jsonl.gz'),'changed');
  await assert.rejects(applyRetention(plan),/changed/);
  await atomicJson(join(old,'trajectory-0-index.json'),{schemaVersion:1,shards:[{file:'../checkpoint.pt'}]});
  await assert.rejects(retentionPlan(root),/Unsafe shard/);
});
test('cleanup protects recent runs, skips linked directories and notices pins added after preview',async t=>{
  const root=await mkdtemp(join(tmpdir(),'training-retain-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const recent=await run(root,'recent');await utimes(join(recent,'summary.json'),new Date(),new Date());
  assert.equal((await retentionPlan(root,{maxMiB:0})).selected.length,0);
  const old=await run(root,'old');const plan=await retentionPlan(root);
  await writeFile(join(old,'keep-details'),'');
  await assert.rejects(applyRetention(plan),/pinned/);
  const outside=await mkdtemp(join(tmpdir(),'training-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));
  await run(outside,'external');
  await symlink(outside,join(root,'linked'),process.platform==='win32'?'junction':'dir');
  assert.equal((await retentionPlan(root)).selected.length,0);
  await assert.rejects(retentionPlan(join(root,'linked')),/Unsafe linked/);
  await assert.rejects(retentionPlan(join(root,'linked','external')),/Unsafe linked/);
});

test('atomic index updates preserve unrelated predictable temporary files',async t=>{
  const root=await mkdtemp(join(tmpdir(),'training-atomic-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'index.json');await writeFile(`${path}.tmp`,'unrelated evidence');
  await atomicJson(path,{saved:true});
  assert.equal(await readFile(`${path}.tmp`,'utf8'),'unrelated evidence');
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{saved:true});
});
