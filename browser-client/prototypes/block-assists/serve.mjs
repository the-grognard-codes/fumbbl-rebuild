// Local, throwaway visual review only. No match server or production route changes.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, configFile: false,
  server: { host: '127.0.0.1', port: 5181, strictPort: true },
  plugins: [{ name: 'block-assist-mockups', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (request.url?.split('?')[0] !== '/pitch-preview') return next();
      const html = await vite.transformIndexHtml(request.url,
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MUTP · Block & assist mockups</title></head><body><div id="root"></div><script type="module" src="/prototypes/block-assists/Mockups.tsx"></script></body></html>');
      response.setHeader('Content-Type', 'text/html'); response.end(html);
    });
  } }],
});
await server.listen();
console.log('Block & assist mockups: http://127.0.0.1:5181/pitch-preview?variant=A');
