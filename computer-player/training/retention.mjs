import { readFile, readdir, realpath, lstat, unlink } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { argumentsOf } from './config.mjs';
import { atomicJson, hash } from './records.mjs';

const indexPattern = /^(trajectory-\d+|diagnostics-\d+)-index\.json$/;
const inside = (root, path) => { const rel = relative(root,path); return rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../') && !isAbsolute(rel); };
async function rejectLinkedComponents(path) {
  let current = resolve(path);
  while (true) {
    if ((await lstat(current)).isSymbolicLink()) throw Error(`Unsafe linked retention path: ${current}`);
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
async function safeFile(root, path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || !inside(root,await realpath(path))) throw Error(`Unsafe retention path: ${path}`);
  return info;
}
async function exists(path) { try { await lstat(path); return true; } catch (error) { if(error.code === 'ENOENT') return false; throw error; } }

/** Preview only. Old complete runs are grouped so pruning never leaves a partial training batch. */
export async function retentionPlan(root, { days = 30, maxMiB = 10240, graceHours = 24, now = Date.now() } = {}) {
  for (const [key,value] of Object.entries({days,maxMiB,graceHours})) if (!Number.isFinite(Number(value)) || Number(value) < 0) throw Error(`Invalid ${key}`);
  const requestedRoot = resolve(root);
  await rejectLinkedComponents(requestedRoot);
  root = await realpath(requestedRoot);
  const runs = []; let visited = 0;
  async function scan(directory, depth) {
    if (++visited > 10000) throw Error('Retention scan exceeds 10000 directories; select a smaller output root');
    if (await exists(join(directory,'summary.json'))) {
      const summaryPath = join(directory,'summary.json'), info = await safeFile(root,summaryPath);
      const summary = JSON.parse(await readFile(summaryPath,'utf8'));
      if (summary.schemaVersion !== 1 || !Array.isArray(summary.records)) return;
      const indices = [], files = [];
      for (const name of await readdir(directory)) {
        const match = indexPattern.exec(name); if (!match) continue;
        const path = join(directory,name); await safeFile(root,path);
        const text = await readFile(path,'utf8'), index = JSON.parse(text);
        if (index.schemaVersion !== 1 || !Array.isArray(index.shards)) throw Error(`Invalid index: ${path}`);
        if (index.pruned) continue;
        for (const shard of index.shards) {
          if (typeof shard.file !== 'string' || !new RegExp(`^${match[1]}-\\d{5}\\.jsonl\\.gz$`).test(shard.file)) throw Error(`Unsafe shard in ${path}`);
          const file = join(directory,shard.file);
          if (!await exists(file)) continue; // Allows recovery after interrupted cleanup.
          const stat = await safeFile(root,file);
          files.push({path:file,bytes:stat.size,modified:stat.mtimeMs,sha256:shard.sha256});
        }
        indices.push({path,hash:hash(text),document:index});
      }
      const pinned = await exists(join(directory,'keep-details'));
      runs.push({directory,modified:info.mtimeMs,pinned,protected:pinned || now-info.mtimeMs < Number(graceHours)*3600000,
        bytes:files.reduce((n,f)=>n+f.bytes,0),files,indices});
      return;
    }
    if (!depth) return;
    for (const item of await readdir(directory,{withFileTypes:true})) if(item.isDirectory() && !item.isSymbolicLink()) await scan(join(directory,item.name),depth-1);
  }
  await scan(root,6);
  runs.sort((a,b)=>a.modified-b.modified || a.directory.localeCompare(b.directory));
  let retainedBytes = runs.reduce((n,r)=>n+r.bytes,0);
  const selected = [];
  for (const run of runs) if (!run.protected && run.bytes && (now-run.modified >= Number(days)*86400000 || retainedBytes > Number(maxMiB)*1048576)) {
    selected.push(run); retainedBytes -= run.bytes;
  }
  return {root,requestedRoot,selected,deleteBytes:selected.reduce((n,r)=>n+r.bytes,0),retainedBytes,
    overBudget:retainedBytes > Number(maxMiB)*1048576,protectedRuns:runs.filter(r=>r.protected).length};
}

export async function applyRetention(plan) {
  await rejectLinkedComponents(plan.requestedRoot ?? plan.root);
  await rejectLinkedComponents(plan.root);
  const root = await realpath(plan.root);
  for (const run of plan.selected) {
    await rejectLinkedComponents(run.directory);
    if (!inside(root,await realpath(run.directory)) || await exists(join(run.directory,'keep-details'))) throw Error('Run moved or became pinned; preview again');
    await safeFile(root,join(run.directory,'summary.json'));
    for (const index of run.indices) {
      if (!indexPattern.test(basename(index.path)) || dirname(index.path) !== run.directory) throw Error('Unsafe index path');
      await safeFile(root,index.path);
      if (hash(await readFile(index.path,'utf8')) !== index.hash) throw Error('Index changed; preview again');
    }
    // Validate the whole run before deleting any of its detail files.
    for (const file of run.files) {
      if (!/^(trajectory|diagnostics)-\d+-\d{5}\.jsonl\.gz$/.test(basename(file.path)) || dirname(file.path) !== run.directory) throw Error('Unsafe detail path');
      const info = await safeFile(root,file.path);
      if (info.size !== file.bytes || info.mtimeMs !== file.modified || hash(await readFile(file.path)) !== file.sha256) throw Error('Shard changed; preview again');
    }
    for (const file of run.files) await unlink(file.path);
    for (const index of run.indices) await atomicJson(index.path,{...index.document,pruned:true,prunedAt:new Date().toISOString()});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = argumentsOf();
  for (const name of Object.keys(args)) if(!['output','days','maxMiB','graceHours','apply'].includes(name)) throw Error(`Unknown option: ${name}`);
  if (!['on','off'].includes(args.apply ?? 'off')) throw Error('apply must be on/off');
  const plan = await retentionPlan(args.output ?? '.tools/training',args);
  if(args.apply === 'on') await applyRetention(plan);
  console.log(JSON.stringify({applied:args.apply === 'on',deleteBytes:plan.deleteBytes,retainedBytes:plan.retainedBytes,
    overBudget:plan.overBudget,protectedRuns:plan.protectedRuns,runs:plan.selected.map(r=>r.directory)},null,2));
}
