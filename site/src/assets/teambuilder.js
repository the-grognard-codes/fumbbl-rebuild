import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { authentication } from './auth-client.js';
import { gameEndpoint } from './play.js';

const status = document.querySelector('#builder-status');
const host = document.querySelector('#builder-root');
try {
  const { auth, config } = authentication();
  let dispose;
  let generation = 0;
  onAuthStateChanged(auth, async user => {
    const current = ++generation;
    dispose?.(); dispose = null; host.replaceChildren();
    if (!user) { location.assign('/login?returnTo=%2Fteambuilder'); return; }
    try {
      const url = gameEndpoint(config.gameWebSocketUrl, location, config);
      const { mountBuilder } = await import('/assets/game/game.js');
      if (current !== generation) return;
      status.textContent = '';
      dispose = mountBuilder(host, { url, getToken: () => user.getIdToken(true) });
    } catch { if (current === generation) status.textContent = 'The team builder is unavailable. Please try again later.'; }
  });
} catch { status.textContent = 'Sign-in is unavailable. Please try again later.'; }
