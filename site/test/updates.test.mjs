import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { updatesState, selectUpdates, updatesHref, paginationPages } from '../src/assets/updates.js';
import { renderUpdatesPage, validateUpdates } from '../scripts/render-updates.mjs';

const history = JSON.parse(await readFile(new URL('../updates.json', import.meta.url), 'utf8'));
const entries = history.map(entry => ({ ...entry, searchText: `PR #${entry.number} pr${entry.number} ${entry.title} ${entry.summary}` }));

test('pagination preserves every entry once, clamps large pages and handles the final partial page', () => {
  const sample = entries.slice(0, 23);
  const pages = [1, 2, 3].map(page => selectUpdates(sample, { query: '', category: '', page }));
  assert.deepEqual(pages.map(page => page.entries.length), [10, 10, 3]);
  assert.deepEqual(pages.flatMap(page => page.entries), sample);
  assert.equal(selectUpdates(sample, { query: '', category: '', page: 999 }).page, 3);
});

test('search matches PR numbers and multiple words without case sensitivity and combines with category', () => {
  assert.deepEqual(selectUpdates(entries, { query: 'PR #125', category: '', page: 1 }).entries.map(entry => entry.number), [125]);
  assert.deepEqual(selectUpdates(entries, { query: 'pr125', category: '', page: 1 }).entries.map(entry => entry.number), [125]);
  const search = selectUpdates(entries, { query: '  REROLL    BB2025  ', category: 'Gameplay', page: 1 });
  assert.ok(search.total > 0 && search.entries.some(entry => entry.number === 125));
  assert.ok(search.entries.every(entry => entry.category === 'Gameplay'));
  const empty = selectUpdates(entries, { query: 'PR #125', category: 'Project notes', page: 10 });
  assert.deepEqual([empty.total, empty.page, empty.pages, empty.entries.length], [0, 1, 1, 0]);
});

test('URL state rejects invalid page/category values and round trips literal search terms safely', () => {
  for (const page of ['-1', '0', '1.2', 'Infinity', 'bad']) assert.equal(updatesState(`?page=${page}`).page, 1);
  assert.equal(updatesState('?category=unknown').category, '');
  const state = { query: 'team & pitch #125', category: 'Developer tools', page: 3 };
  assert.deepEqual(updatesState(new URL(updatesHref(state), 'https://example.test').search), state);
  assert.equal(updatesState(`?q=${'a'.repeat(500)}`).query.length, 200);
  assert.deepEqual(paginationPages(5, 10), [1, 4, 5, 6, 10]);
});

test('the complete merged history remains in static HTML with escaped prose and local merge dates', () => {
  assert.doesNotThrow(() => validateUpdates(history));
  const page = renderUpdatesPage(history);
  assert.equal((page.match(/class="panel update-entry"/g) ?? []).length, history.length);
  assert.match(page, /PR #1<span/);
  assert.match(page, /PR #126<span/);
  const entry = { ...history[0], title: '<script>unsafe</script>', summary: 'A & B', mergedAt: '2026-10-06T01:06:21Z' };
  const escaped = renderUpdatesPage([entry]);
  assert.match(escaped, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.match(escaped, /A &amp; B/);
  assert.match(escaped, /October 5, 2026/);
  assert.throws(() => validateUpdates([history[0], history[0]]));
  assert.throws(() => validateUpdates([{ ...history[0], url: 'https://foreign.invalid' }]));
  assert.throws(() => validateUpdates([...history].reverse()));
});
