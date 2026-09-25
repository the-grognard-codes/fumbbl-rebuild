import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = new URL('../src/', import.meta.url);
const output = new URL('../dist/', import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await cp(new URL('../../browser-client/dist-play/', import.meta.url), new URL('../dist/assets/game/', import.meta.url), { recursive: true });
await cp(new URL('../../browser-client/public/live-pitch.svg', import.meta.url), new URL('../dist/assets/game/live-pitch.svg', import.meta.url));
await cp(new URL('../../browser-client/public/preview/humans-64px-chibi-v1/', import.meta.url), new URL('../dist/assets/team-sprites/humans/', import.meta.url), { recursive: true });
await cp(new URL('../../browser-client/public/preview/orcs-64px-chibi-v1/', import.meta.url), new URL('../dist/assets/team-sprites/orcs/', import.meta.url), { recursive: true });
console.log(`Built static site from ${root}src to ${root}dist`);
