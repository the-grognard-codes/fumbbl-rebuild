import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('./art-samples/', import.meta.url);
const names = ['dodge', 'rush', 'pass', 'catch', 'tentacles', 'weather', 'deviation', 'scatter'];
// A curled receiving glove: fingers hook inward, thumb cups the lower ball edge.
// Mirrored and rotated around the ball, with wrists spread toward the lower corners.
const glove = `<path d="M9 44 6 35Q3 29 5 22L8 14Q9 11 12 12l6 3q2 1 1 3t-3 1l-5-1-1 5 5-6q1-2 3-1l5 4q2 2 0 3-1 2-3 0l-3-2-4 7 5-4q2-1 3 1l2 4q1 2-1 3-2 1-3-2l-1-1-2 4 7-2 5-6q2-2 4 0 1 2-1 4l-6 9-6 2-1 6Z" fill="url(#blue)" stroke="#14263b" stroke-width="1.2" stroke-linejoin="round"/><path d="m8 24 3 4m-3 2 4 4m3 2 5-2" fill="none" stroke="#477daf" stroke-width="1.3" stroke-linecap="round"/><path d="m9 15 6 2m2 3 3 2m-1 5 1 2" stroke="#e6b847" stroke-width="1.4" stroke-linecap="round"/><path d="m7 36 12 3-1 6-10-2Z" fill="#193354" stroke="#14263b"/><path d="m8 38 10 3m-9 1 8 2" stroke="#e6b847" stroke-width="1.4"/>`;
for (const name of names) {
  let svg = await readFile(new URL(`${name}-v4.svg`, dir), 'utf8');
  if (name === 'catch') {
    svg = svg.replace(/<g transform="translate\(0 7\) scale\(\.78\)">.*?<\/g>/,
      `<g transform="translate(-3 4) rotate(23 19 29) scale(.86)">${glove}</g>`)
      .replace(/<g transform="translate\(48 7\) scale\(-\.78 \.78\)">.*?<\/g>/,
        `<g transform="translate(51 4) scale(-1 1) rotate(23 19 29) scale(.86)">${glove}</g>`)
      .replace('translate(5 -9) scale(.8) rotate(-18 24 24)', 'translate(5 -3) scale(.8) rotate(-18 24 24)');
  }
  await writeFile(new URL(`${name}-v5.svg`, dir), svg);
}
let html = await readFile(new URL('index-v4.html', dir), 'utf8');
html = html.replaceAll('-v4.svg', '-v5.svg').replaceAll('review 4', 'review 5').replaceAll('Review 4', 'Review 5')
  .replace('tan human hands · original Weather icon · lighter pitch-green comparison', 'cupped navy-and-gold catching gloves · original Weather · lighter pitch green')
  .replace(/Revision 4:.*?Dodge: curved escape path\./, 'Revision 5: Catch now has inward-curved navy gloves with gold accents and angled wrists, cupping the football. Other icons and the lighter pitch green are unchanged from revision 4. Dodge: curved escape path.')
  .replace('Catch: bare receiving hands.', 'Catch: cupped navy-and-gold gloves.');
await writeFile(new URL('index-v5.html', dir), html);
console.log('Created v5 review with revised Catch; other seven icons preserved.');
