import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('./art-samples/', import.meta.url);
const names = ['dodge', 'rush', 'pass', 'catch', 'tentacles', 'weather', 'deviation', 'scatter'];
for (const name of names) {
  let svg = await readFile(new URL(`${name}-v6.svg`, dir), 'utf8');
  if (name === 'catch') {
    const defs = svg.match(/<defs>.*?<\/defs>/s)?.[0];
    const football = svg.match(/<g transform="translate\(5 1\) scale\(\.8\) rotate\(-18 24 24\)">(.*?)<\/g>/s)?.[1];
    if (!defs || !football) throw new Error('Missing football or palette');
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="Catch">${defs}
<g stroke="#192c43" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">
<!-- Two open gloves reach toward the incoming ball from the lower right. -->
<path d="M43 27 37 23 30 17q-2-2-3 0-1 1 1 3l4 5-6-4q-2-1-3 1-1 1 1 3l8 7-6-2q-3-1-3 2 0 2 3 3l9 3 9-4Z" fill="url(#blue)"/>
<path d="m33 26 4 4m-7-2 5 4m-4 2 5 1" fill="none" stroke="#78b5d8" stroke-width="1"/>
<path d="m39 25 7 4-2 10-8-3Z" fill="#193354"/>
<path d="m41 28 3 2-2 6m-4-1 4 2" fill="none" stroke="#e6b847" stroke-width="1.6"/>
<path d="m28 43-8-5-5-9-1-6q0-3 2-3 2 0 3 3l2 5-1-9q0-3 2-3t2 3l1 11 3-4q2-2 4 0 1 2-1 4l-2 5 6 4Z" fill="url(#blue)"/>
<path d="M19 30q2 4 6 5m0-7q-2 3 0 5" fill="none" stroke="#78b5d8" stroke-width="1.1"/>
<path d="m24 38 10-2 5 8-10 3Z" fill="#193354"/>
<path d="m27 40 6-1 3 5m-7 1 7-2" fill="none" stroke="#e6b847" stroke-width="1.6"/>
<!-- The ball remains in front of the outstretched fingers. -->
<g transform="translate(18 17) rotate(40) scale(.65) translate(-24 -24)">${football}</g>
<path d="m3 7 5 5m6-10 6 6" stroke="#192c43" stroke-width="4"/>
<path d="m3 7 5 5m6-10 6 6" stroke="#e6b847" stroke-width="2"/>
<path d="m5 12 5 2-2-5m9-1 5 2-2-5" fill="#e6b847" stroke="#192c43" stroke-width=".7"/>
</g></svg>\n`;
  }
  await writeFile(new URL(`${name}-v7.svg`, dir), svg);
}
let html = await readFile(new URL('index-v6.html', dir), 'utf8');
html = html.replaceAll('-v6.svg', '-v7.svg').replaceAll('review 6', 'review 7').replaceAll('Review 6', 'Review 7')
  .replace('open palm-up navy-and-gold gloves', 'diagonal incoming football · outstretched navy-and-gold gloves')
  .replace(/Revision 6:.*?Dodge: curved escape path\./, 'Revision 7: Catch rebuilt with a football moving from upper left to lower right, gold motion arrows, and two outstretched navy-and-gold gloves reaching to receive it. Other icons and preview backgrounds remain unchanged. Dodge: curved escape path.')
  .replace('Catch: open palm-up gloves behind the ball.', 'Catch: diagonal incoming ball and outstretched gloves.');
await writeFile(new URL('index-v7.html', dir), html);
console.log('Created v7 Catch with diagonal motion and two receiving gloves.');
