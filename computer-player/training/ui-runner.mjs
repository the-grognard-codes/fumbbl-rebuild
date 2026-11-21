// IPC gives Windows the same graceful stop path as a terminal SIGINT.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { run } = await import(pathToFileURL(resolve('computer-player/training/run.mjs')));
let started = false;
let stopping;
function stop() {
  process.emit('SIGINT');
  // A request can arrive while run() is still reading its build/parameter files.
  stopping ??= setInterval(() => process.emit('SIGINT'),100);
  stopping.unref();
}
process.on('message', async message => {
  if (message.type === 'stop') stop();
  if (message.type !== 'start' || started) return;
  started = true;
  try { await run(message.config); process.exitCode = 0; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { clearInterval(stopping); if (process.connected) process.disconnect(); }
});
process.on('disconnect', () => { if (started) stop(); });
