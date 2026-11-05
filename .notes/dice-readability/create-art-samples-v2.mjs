import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('./art-samples/', import.meta.url);
const palette = { '#22547c': '#183566', '#4db2ff': '#091222', '#c1e9ff': '#387cb5', '#101c2b': '#080f20', '#ffe17b': '#d89a22' };
const recolor = value => Object.entries(palette).reduce((text, [from, to]) => text.replaceAll(from, to), value);
const defs = `<defs><linearGradient id="blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#315d96"/><stop offset=".5" stop-color="#1d3b70"/><stop offset="1" stop-color="#0b1630"/></linearGradient><linearGradient id="leather" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b56a30"/><stop offset=".5" stop-color="#82401d"/><stop offset="1" stop-color="#48230f"/></linearGradient><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e8b343"/><stop offset=".55" stop-color="#c58a1b"/><stop offset="1" stop-color="#8e5711"/></linearGradient></defs>`;
const boot = `<path d="m19 9 12 3-2 17 5 5 8 3 1 6H25l-11-8 3-12Z" fill="url(#blue)"/><path d="m18 11 12 3-1 5-12-4Z" fill="url(#gold)"/><path d="m16 27 12 3 5 6-7 3-11-6Z" fill="#101d38"/><path d="m30 34 5 1 7 3v4H27l-3-4Z" fill="url(#blue)"/><path d="m17 22 10 3m-11 1 10 3" stroke="#d89a22" stroke-width="1.4"/><path d="m20 17 7 2-1 3-7-2Z" fill="#387cb5" stroke="none"/><path d="m15 35 11 8h17v2H25l-12-9Z" fill="url(#gold)"/><path d="m26 45 1 2h3v-2m7 0 1 2h3v-2" fill="#b77b16"/><path d="m31 36 8 3m-20-6 6 4" stroke="#387cb5" stroke-width="1.1"/>`;
// Pointed prolate leather football, with separate end stripes and raised lacing.
const football = `<path d="M5 24C13 11 35 11 43 24C35 37 13 37 5 24Z" fill="url(#leather)" stroke-width="1.7"/><path d="M11 18q3 6 0 12m26-12q-3 6 0 12" fill="none" stroke="#dcc79e" stroke-width="2.8"/><path d="M7 24q17 8 34 0" fill="none" stroke="#43230f" stroke-width="1"/><path d="M17 21h14" stroke="#382114" stroke-width="3.2"/><path d="M17 20.5h14m-12-2v4m3-4v4m3-4v4m3-4v4" stroke="#f0d9ae" stroke-width="1.6"/><path d="M16 16q9-3 17 1" fill="none" stroke="#c68242" stroke-width="1"/>`;
const glove = `<path d="M10 40 6 34 4 24 4 17Q4 14 6 14q2 0 2 3v8l1 1V12q0-3 2-3t2 3v12l1 1V11q0-3 2-3t2 3v14l1 1V16q0-3 2-3t2 3v14l3-4q2-2 4 0 1 1-1 4l-6 8-3 4Z" fill="url(#leather)"/><path d="M9 28q5 1 10 5m-8-6v-4m5 6v-5m5 7v-5" fill="none" stroke="#48230f" stroke-width="1"/><path d="M5 18h2m3-5h2m3-1h2m3 5h2" stroke="#d9bd89" stroke-width="1.4"/><path d="m9 38 12 2-1 6-12-2Z" fill="url(#blue)"/><path d="m9 39 12 2m-12 1 11 2" stroke="#d89a22" stroke-width="1.4"/>`;
const revised = {
  dodge: `<path d="M10 39C-1 28 6 15 14 13" fill="none" stroke="#091222" stroke-width="5"/><path d="M10 39C-1 28 6 15 14 13" fill="none" stroke="#d89a22" stroke-width="2.6"/><path d="m9 9 10 1-5 9 0-5Z" fill="url(#gold)"/><g transform="translate(1 0) rotate(9 26 27) scale(.94)">${boot}</g>`,
  rush: `<path d="M2 15h12M1 23h12M4 31h8" stroke="#091222" stroke-width="5"/><path d="M2 15h12M1 23h12M4 31h8" stroke="#d89a22" stroke-width="2.5"/><g transform="translate(1 0) rotate(-15 27 29) scale(.94)">${boot}</g><path d="m34 4 10 7-11 3 3-5Z" fill="url(#gold)"/>`,
  pass: `<path d="M4 24Q14 0 39 7" fill="none" stroke="#091222" stroke-width="4.5"/><path d="M4 24Q14 0 39 7" fill="none" stroke="#d89a22" stroke-width="2.3"/><path d="m35 1 10 7-11 5 3-6Z" fill="url(#gold)"/><g transform="translate(0 7) rotate(-32 24 24)">${football}</g><path d="m4 37 8-5m-6 12 8-5" stroke="#387cb5" stroke-width="2"/>`,
  catch: `<g transform="translate(5 -9) scale(.8) rotate(-18 24 24)">${football}</g><g transform="translate(0 7) scale(.78)">${glove}</g><g transform="translate(48 7) scale(-.78 .78)">${glove}</g><path d="m2 8 3 4m38-4-3 4M24 1v4" stroke="#d89a22" stroke-width="1.8"/>`,
};
const names = ['dodge', 'rush', 'pass', 'catch', 'tentacles', 'weather', 'deviation', 'scatter'];
for (const name of names) {
  let svg;
  if (revised[name]) svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="${name}">${defs}<g stroke="#091222" stroke-width="1.3" stroke-linejoin="miter" stroke-linecap="butt">${revised[name]}</g></svg>`;
  else {
    svg = recolor(await readFile(new URL(`${name}-v1.svg`, dir), 'utf8'))
      .replace('stroke-linecap="round" stroke-linejoin="round"', 'stroke-linecap="butt" stroke-linejoin="miter"');
    svg = svg.replace('<g ', `${defs}<g `).replaceAll('fill="#183566"', 'fill="url(#blue)"').replaceAll('fill="#d89a22"', 'fill="url(#gold)"');
    // Deep blue tentacles with warm suckers, instead of near-white coils.
    if (name === 'tentacles') svg = svg.replace('fill="#387cb5" stroke="#091222"', 'fill="url(#blue)" stroke="#387cb5"');
    // Dark keylines keep gold strokes crisp against both pitch and pale themes.
    svg = svg.replace(/<path([^>]*stroke="#d89a22"[^>]*)\/>/g,
      (original, attrs) => `<path${attrs.replace('stroke="#d89a22"', 'stroke="#091222"').replace(/stroke-width="[^"]+"/, 'stroke-width="4.5"')}/>${original}`);
  }
  await writeFile(new URL(`${name}-v2.svg`, dir), `${svg.trim()}\n`);
}
let html = await readFile(new URL('index.html', dir), 'utf8');
html = html.replaceAll('-v1.svg', '-v2.svg').replaceAll('review 1', 'review 2').replaceAll('Review 1', 'Review 2')
  .replace('existing outcome palette', 'mole-inspired navy, rich blue, warm gold and leather')
  .replace('Dodge: curved escape path.', 'Revision 2: deeper palette, dark keylines, sharper equipment silhouettes, leather football and articulated gloves. Dodge: curved escape path.');
await writeFile(new URL('index-v2.html', dir), html);
console.log('Created eight v2 SVG samples and index-v2.html; v1 retained.');
