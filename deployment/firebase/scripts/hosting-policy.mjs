export function hostingConfiguration(base, config) {
  const result = structuredClone(base);
  if (config.environment === 'local') return result;
  const game = new URL(config.gameWebSocketUrl);
  if (game.protocol !== 'wss:') throw new Error('Hosted game transport must use WSS.');
  const policy = [
    "default-src 'self'",
    "script-src 'self' https://www.gstatic.com https://apis.google.com",
    "style-src 'self' https://fonts.googleapis.com",
    "img-src 'self' data:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' https://www.gstatic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://${config.projectId}.firebaseapp.com ${game.origin}`,
    `frame-src 'self' https://${config.projectId}.firebaseapp.com https://accounts.google.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests'
  ].join('; ');
  result.hosting.headers.push({ source: '**', headers: [
    { key: 'Content-Security-Policy', value: policy },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }
  ] });
  result.hosting.headers.push({ source: '/firebase-web-config.js', headers: [
    { key: 'Cache-Control', value: 'no-store' }
  ] });
  return result;
}
