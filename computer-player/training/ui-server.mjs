import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argumentsOf } from './config.mjs';
import { renderSiteHeader } from '../../site/scripts/site-header.mjs';

const checkout = fileURLToPath(new URL('../../', import.meta.url));
const source = join(checkout, 'site/src');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
export function runOptions(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected run settings');
  for (const key of Object.keys(value)) if (!['games','seed','budgetSeconds','profile','workers','heapMiB','home','away'].includes(key)) throw Error(`Unsupported setting: ${key}`);
  for (const [key, min, max, fallback] of [['games',2,10000,20],['seed',0,4294962295,42],['budgetSeconds',10,86400,900],['workers',1,32,1],['heapMiB',256,8192,768]]) {
    if (key === 'workers' && (value[key] === undefined || value[key] === '')) continue;
    const n = Number(value[key] ?? fallback);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw Error(`Invalid ${key}: expected ${min}–${max}`);
    result[key] = n;
  }
  if (result.games % 2) throw Error('Use an even game count for paired seeds');
  for (const [key, choices, fallback] of [['profile',['low','balanced','high'],'low'],['home',['bogruk','gobbo'],'bogruk'],['away',['bogruk','gobbo'],'gobbo']]) {
    result[key] = value[key] ?? fallback;
    if (!choices.includes(result[key])) throw Error(`Invalid ${key}`);
  }
  return result;
}
async function jsonFile(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } }
export async function savedRuns(root) {
  const result = [];
  async function scan(directory, depth) {
    if (result.length >= 500) return;
    const summary = await jsonFile(join(directory, 'summary.json'));
    const metadata = summary ? null : await jsonFile(join(directory, 'metadata.json'));
    if (summary || metadata) {
      const data = summary ?? metadata;
      result.push({ id: directory.slice(root.length + 1).replaceAll('\\','/'), started: metadata?.started ?? null, summary: !!summary, config: data.config, completed: data.completed, failures: data.failures, durationMs: data.durationMs, samples: data.samples?.slice(-1), records: data.records });
      return;
    }
    if (depth === 0) return;
    for (const item of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      if (item.isDirectory() && !item.isSymbolicLink()) await scan(join(directory,item.name),depth-1);
    }
  }
  await scan(root,3);
  return result.sort((a,b) => b.id.localeCompare(a.id));
}
export async function trainingServer({ root = checkout, output, readOnly = false, launch = fork } = {}) {
  root = resolve(root); output = resolve(output ?? join(root,'.tools/training'));
  const token = randomBytes(32).toString('hex');
  let active = null;
  let starting = false;
  const server = createServer(async (req,res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const send = (status, data) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
    // Reject DNS rebinding and cross-origin reads/writes; never emit CORS headers.
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return send(403,{error:'Use the local launcher address'});
    try {
      const path = new URL(req.url,origin).pathname;
      if (path.startsWith('/api/training/')) {
        if (req.method === 'GET' && path === '/api/training/state') return send(200,{ controls:!readOnly, token:readOnly ? undefined : token, active: active && {id:active.id,status:active.status,log:active.log,config:active.config}, runs:await savedRuns(output) });
        if (req.method !== 'POST' || readOnly || req.headers['x-training-token'] !== token || req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') return send(403,{error:'Local execution controls are unavailable'});
        if (path === '/api/training/stop') {
          if (active?.status === 'running') { active.status = 'stopping'; active.child.send({type:'stop'}); }
          return send(200,{ok:true});
        }
        if (path !== '/api/training/start') return send(404,{error:'Unknown action'});
        if (starting || active && ['running','stopping'].includes(active.status)) return send(409,{error:'A run is already active. Wait for it to finish or stop it.'});
        starting = true;
        try {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 8192) throw Error('Request too large'); }
        const config = runOptions(JSON.parse(body));
        await stat(join(root,'.tools/training-classpath.txt')).catch(() => { throw Error('Prepare the engine in the harness checkout first (see training README).'); });
        const id = `ui-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
        const child = launch(fileURLToPath(new URL('./ui-runner.mjs',import.meta.url)),[],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
        const job = {id,config,status:'running',child,log:''}; active = job;
        const append = chunk => { job.log = (job.log + chunk).slice(-16000); };
        child.stdout.on('data',append); child.stderr.on('data',append);
        child.on('error',error => { append(error.message); job.status = 'failed'; });
        child.on('exit',code => { job.status = code === 0 ? (job.status === 'stopping' ? 'stopped' : 'finished') : 'failed'; });
        child.send({type:'start',config:{...config,output,runId:id}});
        return send(202,{id});
        } finally { starting = false; }
      }
      if (req.method !== 'GET') return send(405,{error:'Method not allowed'});
      const relative = path === '/training' || path === '/training/' ? 'training/index.html' : path.slice(1);
      if (!['training/index.html','assets/site.css','assets/training.css','assets/training.js','assets/brand-package-v4/moles-under-the-pitch-logo.svg'].includes(relative)) return send(404,{error:'Not found'});
      let content = await readFile(join(source,relative));
      if (relative.endsWith('.html')) {
        // The standalone launcher serves only the lab, not the authenticated game site.
        const header = renderSiteHeader('training').replace('href="/"','href="/training"').replace(/<nav[\s\S]*?<\/nav>/,'<nav aria-label="Local navigation"><a href="/training" aria-current="page">Training</a></nav>');
        content = content.toString().replace('<!-- site-header -->', header)
          .replace('<body class="training-page">', '<body class="training-page" data-training-launcher>')
          .replace('  <script type="module" src="/assets/account-menu.js"></script>', '');
      }
      res.writeHead(200,{'Content-Type':mime[extname(relative)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"}); res.end(content);
    } catch (error) { send(400,{error:error.message}); }
  });
  return {server, stop:() => { if (active && ['running','stopping'].includes(active.status)) active.child.send({type:'stop'}); }};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = argumentsOf();
  for (const key of Object.keys(args)) if (!['root','output','port','readOnly'].includes(key)) throw Error(`Unknown option: ${key}`);
  if (args.readOnly !== undefined && !['on', 'off'].includes(args.readOnly)) throw Error('--read-only expects on or off');
  const app = await trainingServer({root:args.root,output:args.output,readOnly:args.readOnly === 'on'});
  app.server.listen(Number(args.port ?? 8787),'127.0.0.1',() => console.log(`Training: http://127.0.0.1:${app.server.address().port}/training`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => { app.stop(); app.server.close(); });
}
