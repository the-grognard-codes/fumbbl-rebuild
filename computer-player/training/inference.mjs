import net from 'node:net';

export async function withFallback(teacher, request) {
  try { return { outcome: await request(), fallback: false }; }
  catch { return { outcome: teacher, fallback: true }; }
}

export function infer(port, features, timeoutMs, sample = false, seed = 0) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let data = Buffer.alloc(0), done = false;
    const timer = setTimeout(() => finish(Error('Inference timeout')), timeoutMs);
    function finish(error, value) { if (done) return; done = true; clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(value); }
    socket.on('error', finish);
    socket.on('end', () => { if (!done) finish(Error('Inference disconnected')); });
    socket.on('connect', () => {
      const body = Buffer.from(JSON.stringify({ ...features, sample, seed })), header = Buffer.alloc(4); header.writeUInt32BE(body.length);
      socket.write(Buffer.concat([header, body]));
    });
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk]);
      if (data.length > 1048576) return finish(Error('Inference response too large'));
      if (data.length >= 4 && data.length >= data.readUInt32BE(0) + 4) {
        try { const value = JSON.parse(data.subarray(4).toString());
          if (!Number.isInteger(value.index) || value.index < 0 || value.index >= features.candidates.length || !Number.isFinite(value.logProbability)
            || !Number.isFinite(value.value) || !/^[a-f0-9]{64}$/.test(value.modelHash)) throw Error('Invalid inference result');
          finish(null, value);
        } catch (error) { finish(error); }
      }
    });
  });
}
