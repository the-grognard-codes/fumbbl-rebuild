import { mountPlay } from '../src/play-entry.tsx';
import '../../site/src/assets/site.css';

// These lifecycle controls are served only by the test harness, never imported
// by the product entry or exported in the production library.
if (!import.meta.env.DEV) throw Error('Renderer diagnostics require the development test server.');
let dispose: (() => void) | null = null;
Object.assign(window, {
  mountRendererTest() {
    dispose?.();
    dispose = mountPlay(document.getElementById('app')!, {
      environment: "dev", url: `${location.origin.replace('http', 'ws')}/browser/v2`, getToken: async () => 'renderer-test-token'
    });
  },
  unmountRendererTest() { dispose?.(); dispose = null; }
});
