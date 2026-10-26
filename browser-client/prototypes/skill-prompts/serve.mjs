// THROWAWAY local visual review. No production routes or native game actions.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const server = await createServer({
  root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false,
  server: { host: '127.0.0.1', port: 5183, strictPort: true },
  plugins: [{ name: 'skill-prompt-mockups', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      if (request.url?.split('?')[0] !== '/pitch-preview') return next();
      const html = await vite.transformIndexHtml(request.url,
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MUTP · Skill prompt mockups</title></head><body><div id="root"></div><script type="module" src="/prototypes/skill-prompts/Mockups.tsx"></script></body></html>');
      response.setHeader('Content-Type', 'text/html'); response.end(html);
    });
  } }],
});
await server.listen();
console.log('Skill prompt mockups: http://127.0.0.1:5183/pitch-preview?variant=A');
