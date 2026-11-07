import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { updateCategories } from '../src/assets/updates.js';
import { renderSiteHeader } from './site-header.mjs';

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
      <h3>${escape(entry.title)}</h3><p>${escape(entry.summary)}</p>
    </article>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Explore the educational roots and AI-assisted development of Moles Under the Pitch, with a searchable history of merged changes.">
  <title>Development · Moles Under the Pitch</title>
  <link rel="stylesheet" href="/assets/site.css?v=20261008-6">
  <link rel="stylesheet" href="/assets/updates.css">
</head>
<body>
  ${renderSiteHeader('development')}
  <main class="updates-page">
    <div class="updates-intro"><h1>Development</h1>
      <p>The learning, design and engineering behind Moles Under the Pitch, from its educational roots to the latest game improvements.</p>
      <p class="development-links"><a href="#learning">Learning by building</a><a href="#history">Merged changes</a><a href="https://github.com/the-grognard-codes/fumbbl-rebuild">Source on GitHub</a></p>
    </div>
    <section class="development-background" id="learning" aria-labelledby="learning-title">
      <h2 id="learning-title">Learning by building a game</h2>
      <p>MUTP began as an educational project exploring AI-assisted development. Building a browser game puts that learning into practice through interface design, BB2025 rules, testing and match recovery.</p>
      <p>The browser interface evolves alongside a retained Java game engine. Local development offers a place to explore both, with separate development and production sign-in environments. MUTP accounts and services remain separate from FUMBBL.</p>
      <p>To explore the implementation, start with the <a href="https://github.com/the-grognard-codes/fumbbl-rebuild/blob/main/README.md">local development setup</a> and the <a href="https://github.com/the-grognard-codes/fumbbl-rebuild/blob/main/docs/development-and-release.md">build, test and release guide</a>.</p>
    </section>
    <section class="development-history" id="history" aria-labelledby="history-title">
    <h2 id="history-title">Merged changes</h2>
    <p>One entry per merged pull request. Follow its GitHub link for the implementation and review details.</p>
    <p class="updates-coverage">${entries.length} merged pull requests · Latest merge ${date.format(new Date(entries[0].mergedAt))} · Newest first</p>
    <form id="updates-search" class="updates-tools" action="/development" method="get" hidden>
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
    </section>
  </main>
  <footer><span>© 2026 Moles Under the Pitch</span><a href="/privacy">Privacy</a><a href="/support">Support</a></footer>
  <script type="module" src="/assets/updates.js"></script>
  <script src="/firebase-web-config.js"></script>
  <script type="module" src="/assets/account-menu.js"></script>
</body>
</html>
`;
}

export async function renderUpdates({ check = false } = {}) {
  const entries = JSON.parse(await readFile(new URL('../updates.json', import.meta.url), 'utf8'));
  const page = renderUpdatesPage(entries);
  const target = new URL('../src/development/index.html', import.meta.url);
  if (check) {
    if ((await readFile(target, 'utf8')).replace(/\r\n/g, '\n') !== page) throw Error('Development page is stale. Run npm run updates:render --prefix site.');
  } else {
    await mkdir(new URL('.', target), { recursive: true });
    await writeFile(target, page);
  }
  return entries.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`${process.argv.includes('--check') ? 'Checked' : 'Rendered'} ${await renderUpdates({ check: process.argv.includes('--check') })} merged PR updates.`);
}
