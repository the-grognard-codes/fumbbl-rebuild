import argparse
import asyncio
import hashlib
import json
import random
import struct
from pathlib import Path
import torch
from .check import device_info, memory_budget
from .model import batch, load


async def serve(args):
    torch.set_num_threads(args.threads)
    info = device_info(args.device)
    memory_budget(args.device, args.gpu_memory_fraction)
    model, _ = load(args.checkpoint, args.device)
    model.eval()
    model_hash = hashlib.sha256(Path(args.checkpoint).read_bytes()).hexdigest()
    queue = asyncio.Queue(maxsize=256)

    async def infer_loop():
        while True:
            items = [await queue.get()]
            await asyncio.sleep(args.batch_wait_ms / 1000)
            while len(items) < args.batch_size and not queue.empty():
                items.append(queue.get_nowait())
            try:
                with torch.inference_mode():
                    logits, values = model(*batch([f for f, _ in items], args.device))
                    probabilities = logits.softmax(-1).cpu().tolist()
                    values = values.cpu().tolist()
                for (features, future), probs, value in zip(items, probabilities, values):
                    count = len(features['candidates'])
                    if features.get('sample'):
                        index = random.Random(features.get('seed', 0)).choices(range(count), weights=probs[:count])[0]
                    else:
                        index = max(range(count), key=lambda i: probs[i])
                    import math
                    result = dict(index=index, logProbability=math.log(max(1e-30, probs[index])), value=value, modelHash=model_hash)
                    if not future.done():
                        future.set_result(result)
            except Exception as error:
                for _, future in items:
                    if not future.done():
                        future.set_exception(error)

    async def client(reader, writer):
        try:
            header = await asyncio.wait_for(reader.readexactly(4), 5)
            length = struct.unpack('!I', header)[0]
            if length > 4 * 1048576:
                raise ValueError('Request exceeds 4 MiB')
            features = json.loads(await asyncio.wait_for(reader.readexactly(length), 5))
            if len(features.get('candidates', [])) > 4096:
                raise ValueError('Too many candidates')
            future = asyncio.get_running_loop().create_future()
            queue.put_nowait((features, future))
            result = await asyncio.wait_for(future, args.timeout)
            body = json.dumps(result).encode()
            writer.write(struct.pack('!I', len(body)) + body)
            await writer.drain()
        except (Exception, asyncio.CancelledError):
            pass  # Closing the connection invokes the runner's counted Bogruk fallback.
        finally:
            writer.close()
            await writer.wait_closed()

    task = asyncio.create_task(infer_loop())
    server = await asyncio.start_server(client, '127.0.0.1', args.port)
    ready = dict(port=server.sockets[0].getsockname()[1], modelHash=model_hash, device=info)
    if args.ready:
        Path(args.ready).write_text(json.dumps(ready))
    print(json.dumps(ready), flush=True)
    try:
        async with server:
            await server.serve_forever()
    finally:
        task.cancel()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkpoint', required=True)
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cuda')
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--ready')
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--batch-wait-ms', type=int, default=5)
    parser.add_argument('--threads', type=int, default=1)
    parser.add_argument('--timeout', type=float, default=5)
    parser.add_argument('--gpu-memory-fraction', type=float, default=.5)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535 or min(args.batch_size, args.threads, args.timeout) <= 0 or args.batch_wait_ms < 0:
        parser.error('Invalid inference resource limits')
    asyncio.run(serve(args))


if __name__ == '__main__':
    main()
