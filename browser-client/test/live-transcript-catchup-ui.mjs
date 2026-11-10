import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const journey = JSON.parse(readFileSync(new URL('./fixtures/manual-skill-rerolls.json', import.meta.url), 'utf8'))[0];
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  // Exercise both a latest predecessor with a gap and a state whose optional frame was omitted.
  for (const liveFrame of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(6000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/play/match?**', route => route.fulfill({ contentType: 'text/html', body:
      '<div id="app"></div><script type="module">import {mountPlay} from "/src/play-entry.tsx"; mountPlay(document.getElementById("app"), {environment:"dev",url:"ws://unused",getToken:async()=>"token"});</script>' }));
    await page.addInitScript(journey => {
      const transport = { frame: journey.frames[0], reads: [], deliveredStates: [], pending: null, loads: 0, holdLoad: false, releaseLoad: null, chat: [] };
      window.testTransport = transport;
      window.WebSocket = class {
        static OPEN = 1;
        readyState = 1;
        constructor() { window.testSocket = this; queueMicrotask(() => this.onopen?.()); }
        emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
        send(raw) {
          const request = JSON.parse(raw);
          const reply = value => this.emit({ version: 2, requestId: request.requestId, ...value });
          if (request.type === 'authenticate') queueMicrotask(() => reply({ type:'authentication',code:'ACCEPTED',
            accountId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',liveTranscript:true }));
          if (request.type === 'matchChat') queueMicrotask(() => {
            const from = request.from, next = Math.min(transport.chat.length, from + request.limit);
            reply({type:'matchChat',code:'ACCEPTED',duplicate:false,matchId:transport.frame.state.matchId,
              page:{formatVersion:1,from,next,total:transport.chat.length,messages:transport.chat.slice(from,next)}});
          });
          if (request.type === 'setup') {
            transport.loads++;
            const loaded = () => reply({ type:'setupState',code:'ACCEPTED',duplicate:false,state:transport.frame.state });
            if (transport.holdLoad) transport.releaseLoad = loaded; else queueMicrotask(loaded);
          }
          if (request.type === 'matchTranscript') {
            const records = transport.frame.records, from = request.from, next = Math.min(records.length, from + request.limit);
            transport.reads.push({ from, next });
            setTimeout(() => reply({ type:'matchTranscript',code:'ACCEPTED',matchId:transport.frame.state.matchId,
              page:{formatVersion:2,from,next,total:records.length,records:records.slice(from,next)} }), 30);
          }
        }
        close() { this.readyState = 3; this.onclose?.(); }
      };
      window.flushCoalesced = liveFrame => {
        // Model the tested server boundary: revisions 3 and 4 are superseded by full state 5.
        for (const frame of journey.frames.slice(1)) transport.pending = frame;
        transport.frame = transport.pending; transport.pending = null;
        const frame = transport.frame, revision = frame.state.revision;
        if (liveFrame) window.testSocket.emit({version:2,type:'matchTranscript',requestId:null,code:'ACCEPTED',matchId:frame.state.matchId,
          page:{formatVersion:2,from:revision,next:revision+1,total:revision+1,records:[frame.records.at(-1)]}});
        transport.deliveredStates.push(revision);
        window.testSocket.emit({version:2,type:'setupState',requestId:null,code:'ACCEPTED',duplicate:false,state:frame.state});
      };
    }, journey);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/play/match?matchId=${journey.frames[0].state.matchId}`);
    const log = page.getByRole('log', { name: 'Authoritative match events' }); await log.waitFor();
    await page.waitForFunction(() => document.querySelector('[role="log"] [data-revision="2"]'));
    await page.evaluate(liveFrame => window.flushCoalesced(liveFrame), liveFrame);
    await page.waitForFunction(() => document.querySelector('[role="log"] [data-revision="5"]'));
    const reads = await page.evaluate(() => window.testTransport.reads);
    assert.deepEqual(reads, [{from:0,next:3},{from:3,next:6}], 'The gap triggers one complete paged recovery from the accepted prefix');
    assert.deepEqual(await page.evaluate(() => window.testTransport.deliveredStates), [5], 'Intermediate states were not pushed');
    for (const revision of [3,4,5]) assert.ok(await log.locator(`[data-revision="${revision}"]`).count(), `Recovered revision ${revision}`);
    const before = await log.locator('p').count();
    await page.evaluate(liveFrame => window.flushCoalesced(liveFrame), liveFrame);
    assert.equal(await log.locator('p').count(), before, 'Duplicate latest delivery does not duplicate history');
    assert.deepEqual(await page.evaluate(() => window.testTransport.reads), reads, 'Complete history needs no duplicate read');
    await page.evaluate(() => {
      window.testTransport.holdLoad = true;
      window.testSocket.emit({version:2,type:'publicationDelayed',requestId:null,code:'PUBLICATION_DELAYED',matchId:window.testTransport.frame.state.matchId,family:'STATE'});
    });
    await page.waitForFunction(() => !!window.testTransport.releaseLoad);
    assert.equal(await page.getByLabel('Live match pitch').count(), 1, 'The board remains visible while the authorized read is pending');
    assert.equal(await page.evaluate(() => window.testTransport.loads), 2, 'Recovery requests a fresh state');
    await page.evaluate(() => window.testTransport.releaseLoad());
    await page.getByLabel('Live match pitch').waitFor();
    await page.evaluate(() => {
      window.testTransport.chat.push({index:0,at:100,revision:5,authorId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',role:'home',text:'Recovered delayed chat'});
      window.testSocket.emit({version:2,type:'publicationDelayed',requestId:null,code:'PUBLICATION_DELAYED',matchId:window.testTransport.frame.state.matchId,family:'CHAT'});
    });
    await page.getByText('Recovered delayed chat', {exact:true}).waitFor();
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('PASS: coalesced live states recover every missing transcript revision through the production browser page, with or without the optional latest frame.');
} finally { await browser.close(); await server.close(); }
