import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { authentication } from './auth-client.js';
import { validateTransportConfiguration } from './transport-policy.js';

export function gameEndpoint(value, page = location, config) {
  validateTransportConfiguration(config, page);
  if (value !== config.gameWebSocketUrl || !value) throw Error('Game connection is unavailable.');
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost'].includes(page.hostname) && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if ((url.protocol !== 'wss:' && !(local && page.protocol === 'http:' && url.protocol === 'ws:'))
    || url.pathname !== '/browser/v2' || url.search || url.hash || url.username || url.password) throw Error('Game connection is unavailable.');
  return url.href;
}

export function startPlay({ auth, config }, status, host) {
  const invitation = new URLSearchParams(location.search).get('invite');
  if (invitation && /^[A-Za-z0-9_-]{22}$/.test(invitation)) {
    // Carry the shareable invitation across sign-in without accepting arbitrary return URLs.
    sessionStorage.setItem('moles.play.invitation', invitation);
  }
  let dispose;
  let generation = 0;
  const unsubscribe = onAuthStateChanged(auth, async user => {
    const current = ++generation;
    dispose?.(); dispose = null; host.replaceChildren();
    if (!user) { location.assign('/login?returnTo=%2Fplay'); return; }
    try {
      const url = gameEndpoint(config.gameWebSocketUrl, location, config);
      const { mountPlay } = await import('/assets/game/game.js');
      if (generation !== current) return;
      status.textContent = '';
      dispose = mountPlay(host, { url, getToken: () => user.getIdToken(true) });
    } catch { if (generation === current) status.textContent = 'The game connection is not configured. Please try again later.'; }
  });
  return () => { generation++; unsubscribe(); dispose?.(); host.replaceChildren(); };
}

if (typeof document !== 'undefined' && document.querySelector('#game-root')) {
  const status = document.querySelector('#play-status');
  try { startPlay(authentication(), status, document.querySelector('#game-root')); }
  catch { status.textContent = 'Sign-in is unavailable. Please try again later.'; }
}
