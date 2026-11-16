import argparse
import json
import random
import signal
import time
from pathlib import Path
import torch
from .check import device_info, memory_budget
from .model import Policy, batch, load
from .data import trajectories


def save(path, model, optimizer, step, **extra):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    torch.save(dict(schema_version=1, width=model.width, model=model.state_dict(),
                    optimizer=optimizer.state_dict(), step=step, **json.loads(json.dumps(extra))), temporary)
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--resume')
    parser.add_argument('--device', choices=['cuda', 'cpu'], default='cuda')
    parser.add_argument('--steps', type=int, default=100)
    parser.add_argument('--batch-size', type=int)
    parser.add_argument('--width', type=int)
    parser.add_argument('--threads', type=int, default=1)
    parser.add_argument('--budget-seconds', type=int, default=60)
    parser.add_argument('--max-rows', type=int, default=2000)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--mixed-precision', choices=['on', 'off'], default='on')
    parser.add_argument('--gpu-memory-fraction', type=float, default=.5)
    args = parser.parse_args()
    if min(args.steps, args.threads, args.budget_seconds, args.max_rows, args.batch_size or 1, args.width or 1) < 1:
        parser.error('Counts must be positive')
    torch.set_num_threads(args.threads)
    torch.manual_seed(args.seed)
    info = device_info(args.device)
    memory_budget(args.device, args.gpu_memory_fraction)
    rows, _ = trajectories(args.data, args.max_rows)
    rows = [r for r in rows if r['teacher'] >= 0 and len(r['features']['candidates']) > 1]
    episodes = sorted({r['episode'] for r in rows})
    if len(episodes) < 2:
        raise ValueError('Record at least two episodes for an episode-disjoint held-out split')
    heldout = set(episodes[::5])
    training = [r for r in rows if r['episode'] not in heldout]
    validation = [r for r in rows if r['episode'] in heldout]
    model = Policy(args.width or info['profile']['width']).to(args.device)
    step = 0
    checkpoint = None
    if args.resume:
        model, checkpoint = load(args.resume, args.device)
        step = checkpoint['step']
    optimizer = torch.optim.Adam(model.parameters(), lr=3e-4)
    if checkpoint:
        optimizer.load_state_dict(checkpoint['optimizer'])
    stopped = False
    def stop(*_):
        nonlocal stopped
        stopped = True
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    started = time.monotonic()
    samples = 0
    size = args.batch_size or info['profile']['batch_size']
    mixed = args.device == 'cuda' and args.mixed_precision == 'on'
    scaler = torch.amp.GradScaler('cuda', enabled=mixed)
    while step < args.steps and not stopped and time.monotonic() - started < args.budget_seconds:
        selected = random.Random(args.seed + step).choices(training, k=size)
        tensors = batch([r['features'] for r in selected], args.device)
        targets = torch.tensor([r['teacher'] for r in selected], device=args.device)
        optimizer.zero_grad()
        with torch.autocast(device_type=args.device, enabled=mixed):
            logits, _ = model(*tensors)
            loss = torch.nn.functional.cross_entropy(logits, targets)
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        step += 1
        samples += size
        if step % 10 == 0:
            save(args.output, model, optimizer, step, training='bc')
    model.eval()
    correct = 0
    with torch.inference_mode():
        for start in range(0, len(validation), size):
            selected = validation[start:start + size]
            logits, _ = model(*batch([r['features'] for r in selected], args.device))
            correct += sum(a == r['teacher'] for a, r in zip(logits.argmax(-1).tolist(), selected))
    metrics = dict(device=info, steps=step, heldout_agreement=correct / len(validation),
                   training_rows=len(training), heldout_rows=len(validation), samples_per_second=samples / (time.monotonic() - started))
    save(args.output, model, optimizer, step, training='bc', metrics=metrics)
    Path(args.output + '.json').write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics))


if __name__ == '__main__':
    main()
