import { parentPort, workerData } from 'node:worker_threads';
import { Engine } from './engine.mjs';
import { play } from './match.mjs';
import { Shards } from './records.mjs';

const { config, jobs, index } = workerData;
let stopped = false, engine;
parentPort.on('message', message => { if (message === 'stop') { stopped = true; engine?.close(); } });
const trajectories = config.trajectories === 'on' ? new Shards(config.output, `trajectory-${index}`, config.shardMiB * 1048576, config.trajectoryMiB * 1048576 / config.workers) : null;
try {
  let completed = config.recycle;
  for (let start = 0; start < jobs.length && !stopped; start += config.matchesPerJvm) {
    if (!engine || engine.error || completed >= config.recycle) {
      await engine?.close(); engine = new Engine(config, pid => parentPort.postMessage({ pid }), exitedPid => parentPort.postMessage({ exitedPid })); completed = 0;
    }
    const batch = jobs.slice(start, start + config.matchesPerJvm);
    // Shard writes are serialized even when matches await engine replies concurrently.
    let writes = Promise.resolve();
    const sink = trajectories && { add: row => { const result = writes.then(() => trajectories.add(row)); writes = result; return result; } };
    await Promise.all(batch.map(async job => {
      const record = await play(engine, job, config, sink, progress => parentPort.postMessage({ progress }));
      parentPort.postMessage({ record }); completed++;
    }));
    await trajectories?.flush();
  }
} catch (error) { parentPort.postMessage({ error: error.stack }); }
finally { await engine?.close(); await trajectories?.flush(); parentPort.close(); }
