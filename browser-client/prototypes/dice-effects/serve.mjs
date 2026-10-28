// Throwaway visual review only; never imported by production entry points.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

export async function startDiceReview(port = 5182) {
  const server = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false,
    server: { host: '127.0.0.1', port, strictPort: true },
    plugins: [{ name: 'dice-effect-review', configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/pitch-preview') return next();
        const round = new URL(request.url, 'http://localhost').searchParams.get('round');
        const entry = round === '4' ? 'RoundFourReview.tsx' : round === '3' ? 'RoundThreeReview.tsx' : round === '2' ? 'RoundTwoReview.tsx' : 'Review.tsx';
        const html = await vite.transformIndexHtml(request.url,
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MUTP · Dice effect review${round === '4' ? ' · Round four' : round === '3' ? ' · Round three' : round === '2' ? ' · Round two' : ''}</title></head><body><div id="root"></div><script type="module" src="/prototypes/dice-effects/${entry}"></script></body></html>`);
        response.setHeader('Content-Type', 'text/html'); response.end(html);
      });
    } }],
  });
  await server.listen();
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = await startDiceReview();
  console.log('Round four: http://127.0.0.1:5182/pitch-preview?round=4');
  console.log('Round three: http://127.0.0.1:5182/pitch-preview?round=3');
  console.log('Round two: http://127.0.0.1:5182/pitch-preview?round=2&variant=MUTP');
  console.log('Preserved round one: http://127.0.0.1:5182/pitch-preview?round=1&variant=MUTP');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
}
