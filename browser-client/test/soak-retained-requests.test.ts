import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as turn } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { SoakRetainedRequests } from './soak-retained-requests.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

class PageFixture {
  soak = { seq: 0, revision: 10, outgoing: [], receipts: [], failures: [] };
  visible = true;
  delayedSend = false;
  clicked = deferred();
  waiting = new Set();
  events = [];
  recovery = new SoakRetainedRequests(() => this, (event, details) => this.events.push({ event, ...details }));

  url() { return 'http://localhost:5000/play/match?matchId=synthetic'; }
  evaluateValue(fn, arg) { return runInNewContext(`(${fn.toString()})(arg)`, { window: { __soak: this.soak }, arg }); }
  async evaluate(fn, arg) { return this.evaluateValue(fn, arg); }
  async waitForFunction(fn, arg) {
    while (!this.evaluateValue(fn, arg)) await new Promise(done => this.waiting.add(done));
  }
  changed() { for (const done of this.waiting) done(); this.waiting.clear(); }
  send() {
    this.soak.outgoing.push({ seq: ++this.soak.seq, requestId: 'held', operation: 'action' });
    this.changed();
  }
  reply(code) {
    this.soak.receipts.push({ seq: this.soak.seq, code });
    if (code !== 'ACCEPTED') this.soak.failures.push({ seq: this.soak.seq, requestId: 'held', operation: 'action', code });
    this.changed();
  }
  getByRole() {
    return {
      isVisible: async () => this.visible,
      click: async () => { this.visible = false; if (!this.delayedSend) this.send(); this.clicked.resolve(); },
      waitFor: async () => { assert.equal(this.visible, false); },
    };
  }
  refuse(code = 'PERSISTENCE_FAILED') {
    this.soak.failures.push({ seq: 0, requestId: 'held', operation: 'action', code });
  }
}

test('a retained retry waits for an asynchronous send and its acknowledgment after the button hides', async () => {
  const page = new PageFixture();
  page.delayedSend = true;
  page.refuse();
  let settled = false;
  const result = page.recovery.repeat().then(value => { settled = true; return value; }, error => { settled = true; throw error; });
  // Attach a rejection observer while asserting that no early rejection occurs.
  result.catch(() => {});
  await page.clicked.promise;
  await turn();
  assert.equal(settled, false, 'an asynchronous send must not be reported as missing');
  page.send();
  await turn();
  assert.equal(settled, false, 'a hidden button is not an accepted receipt');
  page.reply('ACCEPTED');
  assert.equal(await result, true);
  assert.deepEqual(page.recovery.counts(), { PERSISTENCE_FAILED: 1 });
  assert.equal(page.events.find(event => event.event === 'retained-request-repeated').code, 'PERSISTENCE_FAILED');
});

test('original refusal codes survive retries and remain visible when a repeat is rejected', async () => {
  const page = new PageFixture();
  page.refuse();
  const first = page.recovery.repeat();
  await page.clicked.promise;
  await turn();
  page.reply('STALE_REVISION');
  await assert.rejects(first, /STALE_REVISION/);
  page.visible = true;
  page.clicked = deferred();
  const second = page.recovery.repeat();
  await page.clicked.promise;
  await turn();
  page.reply('ACCEPTED');
  await second;
  assert.deepEqual(page.recovery.counts(), { PERSISTENCE_FAILED: 2 });
  assert.equal(page.events.filter(event => event.event === 'setup-refused').length, 2);
});

test('an old receipt for a reused request ID cannot acknowledge the new send', async () => {
  const page = new PageFixture();
  page.send();
  page.reply('ACCEPTED');
  page.refuse();
  let settled = false;
  const result = page.recovery.repeat().then(value => { settled = true; return value; });
  await page.clicked.promise;
  await turn();
  assert.equal(settled, false);
  page.reply('ACCEPTED');
  await result;
  assert.deepEqual(page.recovery.counts(), { PERSISTENCE_FAILED: 1 });
});

test('a resumed request with unavailable cause is counted explicitly as UNKNOWN', async () => {
  const page = new PageFixture();
  const result = page.recovery.repeat();
  await page.clicked.promise;
  await turn();
  page.reply('ACCEPTED');
  await result;
  assert.deepEqual(page.recovery.counts(), { UNKNOWN: 1 });
});

test('refusals are logged even when no retained retry is sent', async () => {
  const page = new PageFixture();
  page.refuse('COMPLETION_PENDING');
  page.visible = false;
  await page.recovery.captureRefusals();
  assert.equal(await page.recovery.repeat(), false);
  assert.deepEqual(page.recovery.counts(), {});
  assert.equal(page.events.find(event => event.event === 'setup-refused').code, 'COMPLETION_PENDING');
});

test('later setup traffic cannot acknowledge or reclassify the retained retry', async () => {
  const page = new PageFixture();
  page.refuse();
  const originalSend = page.send.bind(page);
  page.send = () => {
    originalSend();
    page.soak.outgoing.push({ seq: ++page.soak.seq, requestId: 'load', operation: 'load' });
    page.reply('ACCEPTED');
  };
  let settled = false;
  const result = page.recovery.repeat().then(value => { settled = true; return value; });
  await page.clicked.promise;
  await turn();
  assert.equal(settled, false);
  assert.deepEqual(page.recovery.counts(), { PERSISTENCE_FAILED: 1 });
  page.soak.receipts.push({ seq: 1, code: 'ACCEPTED' });
  page.changed();
  assert.equal(await result, true);
});

test('capture preserves action failures, logs each sequence once and resets on a new page', async () => {
  const page = new PageFixture();
  page.refuse();
  await page.recovery.captureRefusals();
  await page.recovery.captureRefusals();
  assert.equal(page.soak.failures.length, 1, 'action polling must still see its refusal');
  assert.equal(page.events.filter(event => event.event === 'setup-refused').length, 1);
  page.send();
  page.reply('STALE_REVISION');
  await page.recovery.captureRefusals();
  assert.equal(page.soak.failures.length, 2);
  assert.equal(page.events.filter(event => event.event === 'setup-refused').length, 2);
  page.soak = { seq: 0, revision: 10, outgoing: [], receipts: [], failures: [] };
  page.refuse('COMPLETION_PENDING');
  await page.recovery.captureRefusals();
  assert.equal(page.events.filter(event => event.event === 'setup-refused').length, 3);
});
