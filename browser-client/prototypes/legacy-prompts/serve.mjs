// THROWAWAY visual review: no production route and no game transport.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const server = await createServer({
  root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
  plugins: [{ name: 'legacy-prompt-review', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (request.url?.split('?')[0] !== '/pitch-preview') return next();
      response.setHeader('Content-Type', 'text/html');
      response.end(await vite.transformIndexHtml(request.url, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MUTP decision prompt review</title></head><body><div id="root"></div><script type="module" src="/prototypes/legacy-prompts/Mockups.tsx"></script></body></html>'));
    });
  } }],
});
await server.listen();
console.log('Prompt review: http://127.0.0.1:5187/pitch-preview?variant=horizontal&scenario=coin');
