import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('./art-samples/', import.meta.url);
const names = ['dodge', 'rush', 'pass', 'catch', 'tentacles', 'weather', 'deviation', 'scatter'];
const hand = `<path d="M10 46 10 39Q5 35 4 29L3 18Q3 15 5 15t2 3l1 9 1 1V12q0-3 2-3t2 3v13l1 1V10q0-3 2-3t2 3v15l1 1V14q0-3 2-3t2 3v16l4-5q2-2 4 0 1 2-1 4l-7 10-1 7Z" fill="url(#skin)" stroke="#67442f" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 29q5-1 10 4m-8 1q2 3 6 3m2-9q-4 2-3 7" fill="none" stroke="#a16b49" stroke-width=".9" stroke-linecap="round"/><path d="M10 14h2m3-2h2m3 4h2M4 20h2" stroke="#e7ba8d" stroke-width="1.2"/><path d="m12 42 8 0" stroke="#b58057" stroke-width=".7"/>`;
for (const name of names) {
  let svg = await readFile(new URL(`${name}-${name === 'weather' ? 'v1' : 'v3'}.svg`, dir), 'utf8');
  if (name === 'catch') {
    svg = svg.replace('</defs>', '<linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e3b483"/><stop offset=".55" stop-color="#c99361"/><stop offset="1" stop-color="#aa744e"/></linearGradient></defs>')
      .replace(/(<g transform="translate\(0 7\) scale\(\.78\)">).*?<\/g>/, `$1${hand}</g>`)
      .replace(/(<g transform="translate\(48 7\) scale\(-\.78 \.78\)">).*?<\/g>/, `$1${hand}</g>`);
  }
  await writeFile(new URL(`${name}-v4.svg`, dir), svg);
}
let html = await readFile(new URL('index-v3.html', dir), 'utf8');
html = html.replaceAll('-v3.svg', '-v4.svg').replaceAll('review 3', 'review 4').replaceAll('Review 3', 'Review 4')
  .replaceAll('#486326', '#729747')
  .replace('balanced blue and gold · blue catch gloves · pitch turf #729747', 'tan human hands · original Weather icon · lighter pitch-green comparison')
  .replace(/Revision 3:.*?Dodge: curved escape path\./, 'Revision 4: bare tan human hands for Catch, the exact Weather artwork from revision 1, and a lighter pitch-green comparison (#729747). Other icons retain the balanced revision 3 palette. Dodge: curved escape path.')
  .replace('Catch: receiving gloves.', 'Catch: bare receiving hands.');
await writeFile(new URL('index-v4.html', dir), html);
console.log('Created eight v4 samples, exact v1 Weather, tan hands and lighter preview turf.');
