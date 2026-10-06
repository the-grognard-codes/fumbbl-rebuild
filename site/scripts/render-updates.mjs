import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { updateCategories } from '../src/assets/updates.js';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const date = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric' });

export function validateUpdates(entries) {
  if (!Array.isArray(entries) || !entries.length) throw Error('Updates must contain merged PR entries.');
  const numbers = new Set();
  let previous = Infinity;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.number) || entry.number < 1 || numbers.has(entry.number)
      || entry.url !== `https://github.com/the-grognard-codes/fumbbl-rebuild/pull/${entry.number}`
      || !updateCategories.includes(entry.category) || typeof entry.title !== 'string' || !entry.title.trim()
      || typeof entry.summary !== 'string' || !entry.summary.trim() || !Number.isFinite(Date.parse(entry.mergedAt))
      || Date.parse(entry.mergedAt) > previous) throw Error(`Invalid or unsorted update: PR #${entry.number}`);
    numbers.add(entry.number); previous = Date.parse(entry.mergedAt);
  }
}

export function renderUpdatesPage(entries) {
  validateUpdates(entries);
  const articles = entries.map(entry => `    <article class="panel update-entry" id="pr-${entry.number}" data-pr="${entry.number}" data-category="${escape(entry.category)}">
      <div class="update-meta"><span class="update-category">${escape(entry.category)}</span><time datetime="${escape(entry.mergedAt)}">${date.format(new Date(entry.mergedAt))}</time><a href="${escape(entry.url)}" target="_blank" rel="noreferrer">PR #${entry.number}<span class="update-external" aria-hidden="true"> ↗</span></a></div>
      <h2>${escape(entry.title)}</h2><p>${escape(entry.summary)}</p>
    </article>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Brief updates for every merged Moles Under the Pitch pull request, covering gameplay, design and project development.">
  <title>Updates · Moles Under the Pitch</title>
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/updates.css">
</head>
<body>
  <header class="site-header updates-site-header"><a class="brand" href="/"><img src="/assets/brand-package-v4/moles-under-the-pitch-logo.svg" alt="Moles Under the Pitch"></a><nav aria-label="Primary navigation"><a href="/teambuilder">Team Builder</a><a href="/play">Play</a><a href="/spectate">Spectate</a><a href="/updates" aria-current="page">Updates</a><a href="/support">Support</a></nav></header>
  <main class="updates-page">
    <div class="updates-intro"><p class="kicker">Project updates</p><h1>What's new under the pitch.</h1>
      <p>A brief look at the work behind MUTP, from game-day improvements to the tools that keep the project moving. Each entry links to its merged pull request for the full details.</p>
      <p class="updates-coverage">${entries.length} merged pull requests · Latest merge ${date.format(new Date(entries[0].mergedAt))} · Newest first</p></div>
    <form id="updates-search" class="updates-tools" action="/updates" method="get" hidden>
      <label>Search updates<input type="search" name="q" maxlength="200" placeholder="Topic, feature or PR number" autocomplete="off"></label>
      <label>Category<select name="category"><option value="">All updates</option>${updateCategories.map(category => `<option>${escape(category)}</option>`).join('')}</select></label>
      <div class="updates-tool-actions"><button type="submit">Find updates</button><button type="button" class="updates-clear" data-clear-updates>Clear filters</button></div>
    </form>
    <p class="updates-status" id="updates-status" role="status">${entries.length} merged pull request updates, newest first.</p>
    <nav class="updates-pagination" aria-label="Updates pages, top" hidden></nav>
    <noscript><p>All updates are shown below. Use your browser's Find command to search the history.</p></noscript>
    <section class="updates-list" id="updates-list" aria-label="Merged pull request updates" tabindex="-1">
${articles}
    </section>
    <div class="updates-empty" id="updates-empty" hidden><h2>No matching updates</h2><p>Try another topic or PR number, or choose a different category.</p><button type="button" data-clear-updates>Show all updates</button></div>
    <nav class="updates-pagination" aria-label="Updates pages, bottom" hidden></nav>
  </main>
  <footer><span>© 2026 Moles Under the Pitch</span><a href="/privacy">Privacy</a><a href="/support">Support</a></footer>
  <script type="module" src="/assets/updates.js"></script>
</body>
</html>
`;
}

export async function renderUpdates({ check = false } = {}) {
  const entries = JSON.parse(await readFile(new URL('../updates.json', import.meta.url), 'utf8'));
  const page = renderUpdatesPage(entries);
  const target = new URL('../src/updates/index.html', import.meta.url);
  if (check) {
    if ((await readFile(target, 'utf8')).replace(/\r\n/g, '\n') !== page) throw Error('Updates page is stale. Run npm run updates:render --prefix site.');
  } else await writeFile(target, page);
  return entries.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`${process.argv.includes('--check') ? 'Checked' : 'Rendered'} ${await renderUpdates({ check: process.argv.includes('--check') })} merged PR updates.`);
}
