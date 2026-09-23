import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '../../browser-client/node_modules/playwright/index.mjs';

const origin = process.env.R5_BROWSER_ORIGIN ?? 'http://127.0.0.1:5000/play';
const socketEndpoint = process.env.R5_BROWSER_WS_ENDPOINT ?? 'ws://127.0.0.1:22232/browser/v2';
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
	?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

test('live restored v2 browser gate denies unauthenticated read, mutation and exact retry', { timeout: 30000 }, async () => {
	const browser = await chromium.launch({ headless: true, executablePath: chrome });
	try {
		const page = await browser.newPage();
		// Preserve a real loopback document origin without loading authentication assets.
		await page.route('**/*', route => route.request().isNavigationRequest() ? route.continue() : route.abort());
		await page.goto(origin);
		const replies = await page.evaluate(endpoint => new Promise((resolve, reject) => {
			const requests = [
				{ version: 2, type: 'browse', requestId: 'r5-unauth-read' },
				{ version: 2, type: 'setup', requestId: 'r5-unauth-mutation' },
				{ version: 2, type: 'setup', requestId: 'r5-unauth-mutation' }
			];
			const received = [];
			const socket = new WebSocket(endpoint);
			const timeout = setTimeout(() => { socket.close(); reject(new Error('Timed out waiting for real v2 authorization replies')); }, 5000);
			socket.onopen = () => socket.send(JSON.stringify(requests[0]));
			socket.onmessage = event => {
				received.push(JSON.parse(event.data));
				if (received.length === requests.length) { clearTimeout(timeout); socket.close(); resolve(received); }
				else socket.send(JSON.stringify(requests[received.length]));
			};
			socket.onerror = () => { clearTimeout(timeout); reject(new Error('Real v2 proxy connection failed')); };
		}), socketEndpoint);
		assert.deepEqual(replies.map(reply => [reply.version, reply.type, reply.code, reply.matches]), [
			[2, 'error', 'AUTHENTICATION_REQUIRED', undefined],
			[2, 'error', 'AUTHENTICATION_REQUIRED', undefined],
			[2, 'error', 'AUTHENTICATION_REQUIRED', undefined]
		]);
		assert.equal(replies[1].requestId, 'r5-unauth-mutation');
		assert.equal(replies[2].requestId, 'r5-unauth-mutation');
	} finally {
		await browser.close();
	}
});
