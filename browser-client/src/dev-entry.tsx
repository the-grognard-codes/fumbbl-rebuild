import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

// Vite remains available for independent artwork studies. Live play and account
// authentication belong to the dev-local site, which mounts the V2 library.
if (import.meta.env.DEV) {
  const route = location.pathname;
  const Preview = route === '/pitch-preview'
    ? lazy(() => new URLSearchParams(location.search).get('variant') === 'stadium-hybrid'
      ? import('./StadiumHybridPrototype').then(module => ({ default: module.StadiumHybridPrototype }))
      : import('./PitchPreview').then(module => ({ default: module.PitchPreview })))
    : route === '/pitch-parity'
      ? lazy(() => import('./PitchParityPreview').then(module => ({ default: module.PitchParityPreview })))
      : route === '/ui-ux-draft-v2'
        ? lazy(() => import('./draft-v2/PitchPreview').then(module => ({ default: module.PitchPreview })))
        : null;
  if (Preview) createRoot(document.getElementById('root')!).render(<Suspense fallback={<p>Opening artwork preview…</p>}><Preview/></Suspense>);
  else {
    const target = `http://localhost:5000${route === '/play' || route.startsWith('/play/') ? route : '/play'}${location.search}${location.hash}`;
    // Retain the startup instructions when the local site has not started yet.
    fetch(target, { mode: 'no-cors', signal: AbortSignal.timeout(3000) })
      .then(() => location.replace(target)).catch(() => {});
  }
}
