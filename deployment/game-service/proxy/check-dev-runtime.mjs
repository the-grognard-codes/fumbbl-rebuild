import https from 'node:https';
import { randomBytes } from 'node:crypto';

const host = 'game-dev.molesunderthepitch.org';
const origin = 'https://dev.molesunderthepitch.org';
const request = https.request({
  hostname: host,
  servername: host,
  path: '/browser/v2',
  headers: {
    Host: host,
    Origin: origin,
    Upgrade: 'websocket',
    Connection: 'Upgrade',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Key': randomBytes(16).toString('base64')
  },
  timeout: 5000
}, response => {
  response.resume();
  console.error(`DEV WSS health probe received HTTP ${response.statusCode}; expected 101.`);
  process.exitCode = 1;
});

request.on('upgrade', (response, socket) => {
  socket.destroy();
  if (response.statusCode !== 101) {
    console.error(`DEV WSS health probe received HTTP ${response.statusCode}; expected 101.`);
    process.exitCode = 1;
  }
});

request.on('timeout', () => request.destroy(new Error('DEV WSS health probe timed out.')));
request.on('error', error => {
  console.error(`DEV WSS health probe failed: ${error.message}`);
  process.exitCode = 1;
});
request.end();
