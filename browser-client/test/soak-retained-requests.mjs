export class SoakRetainedRequests {
  // Keep the first observed cause across page reloads; an earlier process's cause is UNKNOWN.
  #causes = new Map();
  #retries = new Map();

  constructor(getPage, log) { this.getPage = getPage; this.log = log; }

  async captureRefusals() {
    let failures;
    try {
      failures = await this.getPage().evaluate(() => {
        const soak = window.__soak;
        if (!soak) return [];
        // Keep action failures available to advanced(); the cursor resets with page instrumentation.
        const pending = soak.failures.filter(failure => failure.seq > (soak.capturedFailureSeq ?? -1));
        if (pending.length) soak.capturedFailureSeq = Math.max(...pending.map(failure => failure.seq));
        return pending;
      });
    }
    catch { this.log('refusal-capture-unavailable'); return; }
    for (const failure of failures) {
      if (failure.requestId && !this.#causes.has(failure.requestId)) this.#causes.set(failure.requestId, failure.code);
      if (this.#causes.size > 200) this.#causes.delete(this.#causes.keys().next().value);
      this.log('setup-refused', { code: failure.code, operation: failure.operation, seq: failure.seq });
    }
  }

  counts() { return Object.fromEntries(this.#retries); }

  async repeat() {
    const page = this.getPage();
    await this.captureRefusals();
    const repeat = page.getByRole('button', { name: 'Repeat retained request', exact: true });
    if (!await repeat.isVisible().catch(() => false)) return false;
    const mark = await page.evaluate(() => window.__soak.seq);
    await repeat.click();
    await page.waitForFunction(mark => window.__soak.outgoing.some(request => request.seq > mark), mark, { timeout: 30_000 });
    // The click sends the retry first; subsequent reconnect/status traffic must not replace it.
    const sent = await page.evaluate(mark => window.__soak.outgoing.find(request => request.seq > mark), mark);
    if (!sent) throw Error('Retained request did not send a setup command');
    const code = this.#causes.get(sent.requestId) ?? 'UNKNOWN';
    this.#retries.set(code, (this.#retries.get(code) ?? 0) + 1);
    this.log('retained-request-repeated', { url: page.url(), code });
    await page.waitForFunction(seq => window.__soak.receipts.some(reply => reply.seq === seq), sent.seq, { timeout: 30_000 });
    const reply = await page.evaluate(seq => window.__soak.receipts.find(reply => reply.seq === seq), sent.seq);
    if (reply.code !== 'ACCEPTED') throw Error(`Retained request rejected: ${reply.code}`);
    await repeat.waitFor({ state: 'hidden', timeout: 30_000 });
    this.log('retained-request-accepted', { revision: await page.evaluate(() => window.__soak.revision), code });
    return true;
  }
}
