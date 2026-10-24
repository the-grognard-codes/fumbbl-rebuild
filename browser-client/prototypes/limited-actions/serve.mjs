// THROWAWAY visual review. No match server, persistence, or production route changes.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const server = await createServer({
  root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 5182, strictPort: true },
  plugins: [{ name: 'limited-action-mockups', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (request.url?.split('?')[0] !== '/pitch-preview') return next();
      const html = await vite.transformIndexHtml(request.url,
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MUTP · Limited action markers</title></head><body><div id="root"></div><script type="module" src="/prototypes/limited-actions/Mockups.tsx"></script></body></html>');
      response.setHeader('Content-Type', 'text/html'); response.end(html);
    });
  } }],
});
await server.listen();
console.log('Limited action mockups: http://127.0.0.1:5182/pitch-preview?variant=gold');
