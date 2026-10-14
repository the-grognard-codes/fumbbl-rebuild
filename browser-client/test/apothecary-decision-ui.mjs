import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from './browser-test-server.mjs';

const base = JSON.parse(readFileSync(new URL('./fixtures/adr0003-pass-ranges.json', import.meta.url), 'utf8'))[0].frames[0].actor;
const evidence = fileURLToPath(new URL('../../.tools/validation/apothecary/', import.meta.url));
mkdirSync(evidence, { recursive: true });
const harness = `
    import React from 'react';
    import ReactDOM from 'react-dom/client';
    const {useState} = React, {createRoot} = ReactDOM;
    import {MatchDecisionDialog} from '/src/MatchDecisionDialog.tsx';
    import {LiveMatchScoreboard} from '/src/LiveMatchScoreboard.tsx';
    import {matchDecision} from '/src/match-decision.ts';
    import '/src/play-brand.css';
    import '/src/coach-match.css';
    import '/src/ui-round-four.css';
    function Review() {
      const [view,setView] = useState(null), [pending,setPending] = useState(false);
      window.showView = next => { setPending(false); setView(next); };
      const decision = view ? matchDecision(view, view.actions) : null;
      return React.createElement('main', {className:'play-runtime live-match-page'},
        React.createElement('section', {className:'hosted-match coach-match'},
        React.createElement('button', {id:'outside', onClick:()=>window.outsideClicks++}, 'Outside action'),
        view && React.createElement(LiveMatchScoreboard,{view}),
        decision && React.createElement(MatchDecisionDialog,{key:decision.key, decision, disabled:pending, activeX:null,
          onChoice:()=>{throw Error('Unexpected local choice')},
          onAction:id=>{window.selected.push(id); setPending(true)}})));
    }
    window.selected=[]; window.outsideClicks=0;
    createRoot(document.getElementById('app')).render(React.createElement(Review));
    `;
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, plugins: [{ name: 'apothecary-review',
    resolveId(id) { if (id === '/apothecary-review.tsx') return '\0apothecary-review.tsx'; },
    load(id) { if (id === '\0apothecary-review.tsx') return harness; } }],
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/apothecary-review', route => route.fulfill({ contentType: 'text/html', body:
    '<div id="app"></div><script type="module" src="/apothecary-review.tsx"></script>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/apothecary-review`);
  await page.waitForFunction(() => typeof window.showView === 'function').catch(error => { throw new Error(`${error.message}\n${errors.join('\n')}`); });
  let revision = base.revision;
  const state = (role, labels, count = 2) => {
    revision++;
    const player = base.players.find(player => player.role === role);
    return { ...base, callerRole: role, revision, phase: 'PLAY',
      [role === 'home' ? 'homeResources' : 'awayResources']: {apothecaries:count, assistantCoaches:0, cheerleaders:0},
      actions: labels.map(([id,label])=>({id:`${revision}:${id}`, label, actor:role, kind:'apothecary',
        target:{playerId:player.id}, sourcePlayerId:null})) };
  };
  const show = view => page.evaluate(view=>window.showView(view),view);
  const renderedIcons = async () => {
    await page.locator('dialog .injury-icon use').first().waitFor({state:'attached'});
    for (const icon of await page.locator('dialog .injury-icon use').all()) {
      assert.ok(await icon.evaluate(use=>{ const box=use.getBBox(); return box.width>0 && box.height>0; }), 'External injury symbol renders');
    }
  };
  for (const role of ['home', 'away']) {
    const initial = state(role, [['apothecary:no','Accept Head Injury (-1AV, MNG)'], ['apothecary:TEAM','Use Apothecary']]);
    await show(initial);
    const modal = page.getByRole('dialog', {name:'Match decision'});
    await modal.waitFor();
    assert.equal(await modal.getAttribute('aria-modal'),'true');
    await renderedIcons();
    assert.ok(await modal.getByText('Accept Head Injury (-1AV, MNG)', {exact:true}).isVisible());
    assert.ok(await modal.getByText(base.players.find(player=>player.role===role).name,{exact:true}).isVisible());
    await page.keyboard.press('Escape');
    assert.ok(await modal.isVisible(), 'Escape cannot dismiss a required choice');
    await page.evaluate(()=>document.getElementById('outside').focus());
    assert.ok(await page.evaluate(()=>document.activeElement.closest('dialog') !== null), 'Modal contains focus');
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(()=>document.activeElement.closest('dialog') !== null));
    if (role === 'home') await modal.screenshot({path:`${evidence}/initial.png`});
    await modal.getByRole('button',{name:'Use Apothecary',exact:true}).click();
    await page.keyboard.press('Enter');
    assert.equal(await modal.locator('button:enabled').count(),0);
    assert.equal((await page.evaluate(()=>window.selected)).at(-1),initial.actions[1].id);
    assert.equal((await page.evaluate(()=>window.selected)).filter(id=>id===initial.actions[1].id).length,1);
    const rerolled = state(role, [['injury:old','Keep Head Injury (-1AV, MNG)'], ['injury:new','Choose Serious Injury (Niggling Injury, MNG)']],1);
    await show(rerolled);
    await modal.getByRole('heading',{name:'Choose Apothecary Result'}).waitFor();
    await renderedIcons();
    assert.equal(await page.locator(`.live-resources.${role} .apothecary b`).textContent(),'1');
    await modal.getByRole('button',{name:'Choose Serious Injury (Niggling Injury, MNG)',exact:true}).click();
    assert.equal((await page.evaluate(()=>window.selected)).at(-1),rerolled.actions[1].id);
    await show(state(role,[],1));
    await modal.waitFor({state:'hidden'});
  }
  for (const injury of ['Knocked Out','Badly Hurt']) for (const use of [false,true]) {
    const initial = state('home',[['apothecary:no',`Accept ${injury}`],['apothecary:TEAM','Use Apothecary']],1);
    await show(initial);
    const modal = page.getByRole('dialog');
    await renderedIcons();
    await modal.getByRole('button',{name:use?'Use Apothecary':`Accept ${injury}`,exact:true}).click();
    assert.equal((await page.evaluate(()=>window.selected)).at(-1),initial.actions[use?1:0].id);
    await show(state('home',[],use?0:1));
    await modal.waitFor({state:'hidden'});
    assert.equal(await page.locator('.live-resources.home .apothecary').count(),use?0:1);
  }
  await page.setViewportSize({width:360,height:640});
  const same = state('home',[['injury:old','Keep Serious Injury (Niggling Injury, MNG)'],['injury:new','Choose Serious Injury (Niggling Injury, MNG)']],0);
  await show(same);
  const modal = page.getByRole('dialog');
  await modal.waitFor();
  assert.equal(await modal.locator('button').count(),2);
  await renderedIcons();
  const bounds = await modal.boundingBox();
  assert.ok(bounds.x>=0 && bounds.x+bounds.width<=360 && bounds.y>=0 && bounds.y+bounds.height<=640,'Narrow viewport fits');
  for (const button of await modal.locator('button').all()) assert.ok(await button.evaluate(element=>element.scrollWidth<=element.clientWidth),'Injury text fits button');
  await modal.screenshot({path:`${evidence}/injury-choice-mobile.png`});
  await show({...same,callerRole:'spectator'});
  await modal.waitFor({state:'hidden'});
  await show({...same,callerRole:'away'});
  assert.equal(await page.getByRole('dialog').count(),0);

  const multiple = state('home', [['apothecaries:no','Accept all injuries'],
    ['apothecaries:first:TEAM','Use Apothecary: Knocked Out'],
    ['apothecaries:second:WANDERING','Use Wandering Apothecary: Broken Arm (-1PA, MNG)']],2);
  multiple.actions[0].target=null;
  const second = {...multiple.players.find(player=>player.role==='home'), id:'second', name:'Second injured player'};
  multiple.players=[...multiple.players,second];
  multiple.actions[2].target={playerId:second.id};
  await show(multiple);
  await modal.waitFor();
  await renderedIcons();
  await modal.getByRole('button',{name:/Second injured player Use Wandering Apothecary/}).click();
  assert.equal((await page.evaluate(()=>window.selected)).at(-1),multiple.actions[2].id);
  await show(state('home',[],1));
  await modal.waitFor({state:'hidden'});
  await show({...multiple,revision:++revision});
  await modal.getByRole('button',{name:'Accept all injuries',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.selected)).at(-1),multiple.actions[0].id);
  await show(state('home',[],2));
  await modal.waitFor({state:'hidden'});
  assert.equal(await page.locator('.live-resources.home .apothecary b').textContent(),'2');

  const svg = readFileSync(new URL('../../assets/game/ui/injury-icons-v1.svg',import.meta.url),'utf8');
  const symbols = [...svg.matchAll(/<symbol id="([^"]+)"/g)].map(match=>match[1]);
  await page.setViewportSize({width:960,height:640});
  await page.evaluate(symbols=>{
    const gallery=document.createElement('div'); gallery.id='injury-gallery';
    gallery.style.cssText='display:grid;grid-template-columns:repeat(7,1fr);gap:12px;padding:20px;background:#0b1929;color:#f4e5c7;font:14px MUTP,sans-serif;text-align:center';
    for (const symbol of symbols) {
      const entry=document.createElement('div');
      entry.innerHTML=`<svg width="48" height="48" viewBox="0 0 48 48"><use href="/assets/game/ui/injury-icons-v1.svg#${symbol}"/></svg><div>${symbol.replaceAll('-',' ')}</div>`;
      gallery.append(entry);
    }
    document.body.replaceChildren(gallery);
  },symbols);
  for (const icon of await page.locator('#injury-gallery use').all())
    assert.ok(await icon.evaluate(use=>{ const box=use.getBBox(); return box.width>0 && box.height>0; }));
  await page.locator('#injury-gallery').screenshot({path:`${evidence}/injury-icons.png`});
  assert.deepEqual(errors,[]);
  console.log('Apothecary modal, all icons, command IDs, pending input, both coaches, counts, KO/Badly Hurt, mobile, multi-player and observer checks passed.');
} finally { await browser.close(); await server.close(); }
