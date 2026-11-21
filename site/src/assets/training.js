const $ = id => document.getElementById(id);
const launcher = document.body.hasAttribute('data-training-launcher') && location.hostname === '127.0.0.1';
let token, runs = [], selected, busy = false, local = false, connected = false;
const imported = new Map();
function message(text = '') { $('message').textContent = text; $('message').hidden = !text; }
function select(run) {
  selected = run;
  $('detail').hidden = false;
  $('run-id').textContent = run.id;
  $('config').textContent = JSON.stringify(run.config ?? {}, null, 2);
  const failures = Object.values(run.failures ?? {}).reduce((a,b) => a + Number(b),0);
  const completed = Number(run.completed ?? 0);
  const rate = run.durationMs > 0 ? (completed * 3600000 / run.durationMs).toFixed(1) : '—';
  $('metrics').replaceChildren();
  for (const [name,value] of [['Completed',run.summary ? completed : '—'],['Failed / capped',run.summary ? failures : '—'],['Games / hour',rate]]) {
    const group = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = name; dd.textContent = value; group.append(dt,dd); $('metrics').append(group);
  }
  $('run-note').textContent = run.summary ? 'Throughput counts completed games only. Small samples measure speed; they do not establish coach strength.' : 'No final summary yet. This may be an active or interrupted command-line run; the viewer cannot determine which.';
  $('games').replaceChildren();
  for (const record of (run.records ?? []).slice(0,10000)) {
    const row = document.createElement('tr');
    for (const value of [record.id, record.coaches?.join(' / '),record.seed,record.score?.join(' – '),record.completed ? 'Completed' : record.failureCode ?? 'Incomplete']) {
      const cell = document.createElement('td'); cell.textContent = value ?? '—'; row.append(cell);
    }
    $('games').append(row);
  }
  $('download').disabled = !run.summary;
  for (const button of $('runs').children) button.setAttribute('aria-pressed',String(button.dataset.id === run.id));
}
function history() {
  $('runs').replaceChildren();
  const all = [...imported.values(),...runs];
  $('empty').hidden = !launcher || all.length > 0;
  $('empty').textContent = 'No saved runs yet. Open a summary.json to inspect an experiment.';
  for (const run of all) {
    const button = document.createElement('button'), detail = document.createElement('small');
    button.type = 'button'; button.dataset.id = run.id; button.textContent = run.id;
    detail.textContent = `${run.config?.home ?? 'Coach'} / ${run.config?.away ?? 'opponent'} · ${run.summary ? `${run.completed} completed` : 'Awaiting summary'}`;
    button.append(detail); button.setAttribute('aria-pressed', String(selected?.id === run.id)); button.onclick = () => select(run); $('runs').append(button);
  }
  if (selected) { const updated = all.find(run => run.id === selected.id); if (updated) select(updated); }
}
async function refresh() {
  try {
    const response = await fetch('/api/training/state',{cache:'no-store'});
    if (!response.ok) throw Error('Viewer only');
    const data = await response.json();
    if (!Array.isArray(data.runs) || typeof data.controls !== 'boolean') throw Error('Viewer only');
    connected = true; local = data.controls; token = data.token; runs = data.runs;
    $('connection').textContent = local ? 'Local controls connected' : 'Read-only viewer';
    $('viewer-note').textContent = 'Saved results stay on this machine. Nothing is uploaded.';
    $('controls').hidden = !local;
    $('active-section').hidden = !data.active;
    busy = ['running','stopping'].includes(data.active?.status);
    $('settings').disabled = busy; $('start').disabled = busy; $('stop').disabled = !local || data.active?.status !== 'running';
    if (data.active) { $('active-status').textContent = `${data.active.status} · ${data.active.config.games} games requested · ${data.active.id}`; $('log').textContent = data.active.log || 'Starting engine…'; }
    history();
  } catch {
    $('connection').textContent = connected ? 'Launcher disconnected' : 'Read-only viewer';
    $('viewer-note').textContent = connected ? 'Connection lost. Reconnect to the launcher to check the run; it may still be active.' : 'Open a saved summary to view results. Execution controls are available only through the local launcher.';
    $('controls').hidden = true; $('stop').disabled = true; local = false;
    history();
  }
}
async function action(name, body = {}) {
  message();
  try {
    const response = await fetch(`/api/training/${name}`,{method:'POST',headers:{'Content-Type':'application/json','X-Training-Token':token},body:JSON.stringify(body)});
    const data = await response.json(); if (!response.ok) throw Error(data.error ?? 'Request failed');
  } catch (error) { message(error.message); }
  await refresh();
}
$('run-form').onsubmit = event => {
  event.preventDefault(); if (!local || busy) return;
  const data = Object.fromEntries(new FormData(event.currentTarget)); data.budgetSeconds = Number(data.minutes)*60; delete data.minutes;
  $('start').disabled = true; action('start',data);
};
$('stop').onclick = () => { $('stop').disabled = true; action('stop'); };
$('refresh').onclick = refresh;
$('import').onchange = async event => {
  message();
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 32*1024*1024) throw Error('Choose a summary smaller than 32 MiB.');
    const data = JSON.parse(await file.text());
    if (data.schemaVersion !== 1 || !Array.isArray(data.records) || !Number.isInteger(data.completed) || !data.config) throw Error('Choose a schema version 1 harness summary.json.');
    const run = {...data,id:`Imported · ${file.name} · ${new Date().toLocaleTimeString()}`,summary:true}; imported.set(run.id,run); history(); select(run);
  } catch (error) { message(error.message); }
};
$('download').onclick = () => {
  if (!selected?.summary) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify({...selected,schemaVersion:1},null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'summary.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
};
if (launcher) {
  $('refresh').hidden = false;
  await refresh();
  setInterval(() => { if (!document.hidden) refresh(); },5000);
}
