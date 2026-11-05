import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('./art-samples/', import.meta.url);
// Middle ground between v1's pastel cyan and v2's near-black navy.
const palette = {
  '#315d96': '#477daf', '#1d3b70': '#2b598a', '#0b1630': '#193354',
  '#183566': '#2b598a', '#387cb5': '#78b5d8', '#091222': '#192c43',
  '#080f20': '#14263b', '#101d38': '#213d5f', '#d89a22': '#e6b847',
  '#e8b343': '#f1cb68', '#c58a1b': '#dca630', '#8e5711': '#aa721c',
  '#b77b16': '#cf972e',
};
const names = ['dodge', 'rush', 'pass', 'catch', 'tentacles', 'weather', 'deviation', 'scatter'];
for (const name of names) {
  let svg = await readFile(new URL(`${name}-v2.svg`, dir), 'utf8');
  svg = svg.replace(/#[0-9a-f]{6}/g, color => palette[color] ?? color);
  if (name === 'catch') {
    // Change only the two glove silhouettes; retain the leather football.
    svg = svg.replace(/(<path d="M10 40[^"]+" fill=")url\(#leather\)/g, '$1url(#blue)')
      .replaceAll('stroke="#48230f"', 'stroke="#193354"')
      .replaceAll('stroke="#d9bd89"', 'stroke="#a1c9df"');
  }
  await writeFile(new URL(`${name}-v3.svg`, dir), svg);
}
let html = await readFile(new URL('index-v2.html', dir), 'utf8');
html = html.replaceAll('-v2.svg', '-v3.svg').replaceAll('review 2', 'review 3').replaceAll('Review 2', 'Review 3')
  .replace('mole-inspired navy, rich blue, warm gold and leather', 'balanced blue and gold · blue catch gloves · pitch turf #486326')
  .replace('background:#235746', 'background:#486326')
  .replace('.large{display:flex;', '.large{background:#486326;display:flex;')
  .replace('Revision 2: deeper palette, dark keylines, sharper equipment silhouettes, leather football and articulated gloves.',
    'Revision 3: intermediate blue/gold palette, blue catching gloves, and the runtime pitch turf green (#486326 from pitch-scenery.css). Enlarged and native-size previews use the same pitch green. Sharp silhouettes and leather football retained.');
await writeFile(new URL('index-v3.html', dir), html);
console.log('Created eight v3 SVGs and index-v3.html; earlier revisions retained.');
