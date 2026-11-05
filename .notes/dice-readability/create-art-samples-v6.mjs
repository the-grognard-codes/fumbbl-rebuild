import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('./art-samples/', import.meta.url);
const names = ['dodge', 'rush', 'pass', 'catch', 'tentacles', 'weather', 'deviation', 'scatter'];
// Open receiving palm. Fingers form a simple relaxed silhouette behind the ball,
// rather than individually hooked fingers. Thumb and palm pad remain visible below.
const hand = `<path d="M5 37 8 28 13 20Q16 17 20 18l5 3q2 2 0 4l-5 3 4-1q3-1 4 1 1 2-2 4l-7 5-5 5Z" fill="url(#blue)" stroke="#192c43" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 29q3 4 8 5m-3-8q-2 3 0 6" fill="none" stroke="#78b5d8" stroke-width="1.2" stroke-linecap="round"/><path d="m5 35 11 6-3 5-11-6Z" fill="#193354" stroke="#192c43" stroke-width="1.2"/><path d="m5 37 9 5m-10-2 8 4" stroke="#e6b847" stroke-width="1.5"/>`;
for (const name of names) {
  let svg = await readFile(new URL(`${name}-v5.svg`, dir), 'utf8');
  if (name === 'catch') {
    const defs = svg.match(/<defs>.*?<\/defs>/s)?.[0];
    const football = svg.match(/<g transform="translate\(5 -3\) scale\(\.8\) rotate\(-18 24 24\)">.*?<\/g>/s)?.[0];
    if (!defs || !football) throw new Error('Missing preserved Catch football or palette');
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="Catch">${defs}<g stroke="#192c43" stroke-width="1.3" stroke-linejoin="round">${hand}<g transform="translate(48 0) scale(-1 1)">${hand}</g>${football.replace('translate(5 -3)', 'translate(5 1)')}<path d="m6 8 3 4m33-4-3 4M24 3v4" stroke="#e6b847" stroke-width="1.8"/></g></svg>\n`;
  }
  await writeFile(new URL(`${name}-v6.svg`, dir), svg);
}
let html = await readFile(new URL('index-v5.html', dir), 'utf8');
html = html.replaceAll('-v5.svg', '-v6.svg').replaceAll('review 5', 'review 6').replaceAll('Review 5', 'Review 6')
  .replace('cupped navy-and-gold catching gloves', 'open palm-up navy-and-gold gloves')
  .replace(/Revision 5:.*?Dodge: curved escape path\./, 'Revision 6: simple palm-up gloves behind the football, with relaxed silhouettes and no individually hooked fingers. Other icons and the lighter pitch green are unchanged. Dodge: curved escape path.')
  .replace('Catch: cupped navy-and-gold gloves.', 'Catch: open palm-up gloves behind the ball.');
await writeFile(new URL('index-v6.html', dir), html);
console.log('Created v6 Catch with open palms behind the ball; other seven icons preserved.');
