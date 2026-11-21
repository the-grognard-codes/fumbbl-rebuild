"""Synchronous actor/learner PPO: freeze a policy for each rollout, then update.

Only complete episodes with matching behavior-policy hashes contribute. Rewards
are terminal win/draw/loss (+1/0/-1); shaping is zero throughout (no annealing).
"""
import argparse
import hashlib
import json
import math
import os
import random
import signal
import subprocess
import sys
import time
from pathlib import Path
import torch
from .check import device_info, memory_budget
from .data import trajectories
from .model import batch, load
from .train_bc import save

ROOT = Path(__file__).resolve().parents[2]
CHILDREN = []


def stop_process(process):
    if process.poll() is None:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
        else:
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=10)
    if process in CHILDREN:
        CHILDREN.remove(process)


def start_server(checkpoint, output, device, threads):
    ready = output / 'inference-ready.json'
    ready.unlink(missing_ok=True)
    log = (output / 'inference.log').open('a')
    process = subprocess.Popen([sys.executable, '-m', 'ml.serve', '--checkpoint', str(checkpoint), '--ready', str(ready),
                                '--device', device, '--threads', str(threads)], cwd=ROOT / 'computer-player', stdout=log, stderr=log,
                               start_new_session=os.name != 'nt')
    log.close()
    CHILDREN.append(process)
    until = time.monotonic() + 30
    while not ready.exists() and process.poll() is None and time.monotonic() < until:
        time.sleep(0.1)
    if not ready.exists():
        stop_process(process)
        raise RuntimeError('Inference failed to start; inspect inference.log')
    return process, json.loads(ready.read_text())


def rollout(args, output, port, opponent, seed, seconds, opponent_port=0, sample=True, games=None):
    command = ['node', 'computer-player/training/run.mjs', '--games', str(games or args.games), '--seed', str(seed),
               '--home', 'learned', '--home-port', str(port), '--away', 'bogruk' if opponent == 'tuned' else opponent, '--away-port', str(opponent_port),
               '--trajectories', 'on' if sample else 'off', '--sample', 'on' if sample else 'off',
               '--trajectory-mi-b', str(args.trajectory_mib), '--profile', args.profile, '--workers', str(args.workers),
               '--matches-per-jvm', str(args.matches_per_jvm), '--budget-seconds', str(max(1, int(seconds))),
               '--output', str(output), '--classpath-file', str(Path(args.classpath_file).resolve()),
               '--inference-timeout-ms', '5000']
    if opponent == 'tuned' and args.tuned:
        command += ['--away-params', str(Path(args.tuned).resolve())]
    process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                               start_new_session=os.name != 'nt')
    CHILDREN.append(process)
    try:
        stdout, stderr = process.communicate(timeout=seconds + 15)
    except BaseException:
        stop_process(process)
        raise
    if process in CHILDREN:
        CHILDREN.remove(process)
    with (output / 'actors.log').open('a') as log:
        log.write(stderr)
    if process.returncode:
        raise RuntimeError(f'Actors failed: {stderr[-2000:]}')
    summary_path = Path(json.loads(stdout.strip().splitlines()[-1])['output']) / 'summary.json'
    return json.loads(summary_path.read_text())


def ppo(model, optimizer, rows, terminals, behavior_hash, device, batch_size, seed, epochs=2, deadline=float('inf'), stop_requested=None):
    eligible = [r for r in rows if r.get('modelHash') == behavior_hash and r.get('logProbability') is not None
                and terminals.get(r['episode'], {}).get('completed') and not terminals[r['episode']].get('failureCode')
                and terminals[r['episode']].get('trajectoryComplete', True)
                and not terminals[r['episode']].get('fallbackCount', 0)]
    if not eligible:
        return dict(samples=0, updates=0)
    updates, loss_value = 0, 0
    for epoch in range(epochs):
        random.Random(seed + epoch).shuffle(eligible)
        for start in range(0, len(eligible), batch_size):
            if time.monotonic() >= deadline or (stop_requested and stop_requested()):
                return dict(samples=len(eligible), updates=updates, loss=loss_value)
            selected = eligible[start:start + batch_size]
            rewards = []
            for row in selected:
                terminal = terminals[row['episode']]
                rewards.append(0 if terminal['result'] == 'draw' else 1 if terminal['result'] == row['actor'] else -1)
            logits, values = model(*batch([r['features'] for r in selected], device))
            distribution = torch.distributions.Categorical(logits=logits)
            actions = torch.tensor([r['chosen'] for r in selected], device=device)
            old_log = torch.tensor([r['logProbability'] for r in selected], device=device)
            returns = torch.tensor(rewards, device=device, dtype=torch.float32)
            advantage = returns - values.detach()
            ratio = (distribution.log_prob(actions) - old_log).exp()
            policy_loss = -torch.minimum(ratio * advantage, ratio.clamp(0.8, 1.2) * advantage).mean()
            loss = policy_loss + 0.5 * (values - returns).square().mean() - 0.01 * distribution.entropy().mean()
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 0.5)
            optimizer.step()
            updates += 1
            loss_value = loss.item()
    return dict(samples=len(eligible), updates=updates, loss=loss_value)


def attributable(row, expected_models=None):
    if not row['completed'] or row['failureCode'] or row.get('fallbackCount', 0):
        return False
    if expected_models is not None:
        expected = list(reversed(expected_models)) if row['swap'] else list(expected_models)
        if row.get('modelHashes') != expected:
            return False
    return True


def paired_evidence(records, minimum=400, expected_models=None):
    pairs = {}
    for row in records:
        pairs.setdefault(row['pair'], []).append(row)
    complete = [p for p in pairs.values() if len(p) == 2 and {r['swap'] for r in p} == {0, 1}
                and all(attributable(r, expected_models) for r in p)]
    wins = 0
    for pair in complete:
        score = 0
        for row in pair:
            role = 1 if row['swap'] else 0
            delta = row['score'][role] - row['score'][1 - role]
            score += (delta > 0) - (delta < 0)
        wins += score > 0
    n = len(complete)
    if not n:
        return dict(pairs=0, wins=0, lower=0, upper=1, promoted=False)
    p, z = wins / n, 1.96
    mid, margin, denominator = p + z*z/(2*n), z*math.sqrt(p*(1-p)/n+z*z/(4*n*n)), 1+z*z/n
    lower, upper = (mid-margin)/denominator, (mid+margin)/denominator
    return dict(pairs=n, wins=wins, lower=lower, upper=upper, promoted=n*2 >= minimum and lower > .5)


def update_ladder(path, agent, opponent, records, expected_models=None):
    ladder = json.loads(path.read_text()) if path.exists() else dict(schemaVersion=1, agents={}, evaluations=[])
    for name in [agent, opponent]:
        ladder['agents'].setdefault(name, dict(elo=1500, matches=0))
    a, b = ladder['agents'][agent], ladder['agents'][opponent]
    for row in records:
        if not attributable(row, expected_models):
            continue
        role = 1 if row['swap'] else 0
        delta = row['score'][role] - row['score'][1-role]
        result = 1 if delta > 0 else .5 if delta == 0 else 0
        change = 16 * (result - 1 / (1 + 10 ** ((b['elo']-a['elo'])/400)))
        a['elo'] += change
        b['elo'] -= change
        a['matches'] += 1
        b['matches'] += 1
    evidence = paired_evidence(records, expected_models=expected_models)
    ladder['evaluations'].append(dict(agent=agent, opponent=opponent, evidence=evidence,
                                      confidence='95% Wilson interval for won seed pairs; ties non-wins'))
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(ladder, indent=2))
    temporary.replace(path)
    return evidence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--checkpoint', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cuda')
    parser.add_argument('--iterations', type=int, default=1)
    parser.add_argument('--games', type=int, default=2)
    parser.add_argument('--workers', type=int, default=1)
    parser.add_argument('--matches-per-jvm', type=int, default=2)
    parser.add_argument('--profile', choices=['low', 'balanced', 'high'], default='low')
    parser.add_argument('--threads', type=int, default=1)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--trajectory-mib', type=int, default=64)
    parser.add_argument('--budget-seconds', type=int, default=120)
    parser.add_argument('--classpath-file', default='../.tools/training-classpath.txt')
    parser.add_argument('--tuned')
    parser.add_argument('--pool', default='gobbo,bogruk,recent,champion')
    parser.add_argument('--promotion-matches', type=int, default=400)
    parser.add_argument('--evaluate', choices=['on', 'off'], default='on')
    parser.add_argument('--promote', choices=['on', 'off'], default='on')
    parser.add_argument('--gpu-memory-fraction', type=float, default=.5)
    args = parser.parse_args()
    if min(args.iterations, args.games, args.workers, args.matches_per_jvm, args.threads, args.batch_size, args.budget_seconds, args.promotion_matches) < 1 or args.games % 2 or args.promotion_matches % 2:
        parser.error('Counts must be positive; games must be even')
    pool = args.pool.split(',')
    if any(p not in ['gobbo', 'bogruk', 'recent', 'champion', 'tuned'] for p in pool) or ('tuned' in pool and not args.tuned):
        parser.error('Pool choices: gobbo,bogruk,recent,champion,tuned (-tuned requires a parameter file)')
    torch.set_num_threads(args.threads)
    torch.manual_seed(42)
    info = device_info(args.device)
    memory_budget(args.device, args.gpu_memory_fraction)
    model, checkpoint = load(args.checkpoint, args.device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    if checkpoint.get('training') == 'ppo':
        optimizer.load_state_dict(checkpoint['optimizer'])
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    step = checkpoint['step'] if checkpoint.get('training') == 'ppo' else 0
    current = Path(args.checkpoint).resolve()
    champion = Path(checkpoint.get('champion', args.checkpoint)).resolve()
    champion_sidecar = Path(str(current) + '.champion.json')
    if champion_sidecar.exists():
        champion = Path(json.loads(champion_sidecar.read_text())['champion'])
    deadline = time.monotonic() + args.budget_seconds
    history = checkpoint.get('history', []) if checkpoint.get('training') == 'ppo' else []
    stopped = False
    def stop(*_):
        nonlocal stopped
        stopped = True
        for process in list(CHILDREN):
            stop_process(process)
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    # Windows Ctrl+C reaches the actors as well; their own budget always bounds them.
    for iteration in range(step, args.iterations):
        if stopped or time.monotonic() >= deadline:
            break
        server, ready = start_server(current, output, args.device, args.threads)
        opponent = pool[iteration % len(pool)]
        opponent_server, opponent_port = None, 0
        try:
            if opponent in ['recent', 'champion']:
                recent = sorted(output.glob('checkpoint-*.pt'), key=lambda p: int(p.stem.split('-')[-1]))[-4:]
                reference = champion if opponent == 'champion' else random.Random(iteration).choice(recent or [current])
                opponent_dir = output / 'opponent'
                opponent_dir.mkdir(exist_ok=True)
                opponent_server, opponent_ready = start_server(reference, opponent_dir, args.device, args.threads)
                opponent_port = opponent_ready['port']
            summary = rollout(args, output, ready['port'], 'learned' if opponent in ['recent', 'champion'] else opponent,
                              42 + iteration * args.games, max(1, deadline-time.monotonic()), opponent_port)
        except RuntimeError:
            if stopped:
                break
            raise
        finally:
            stop_process(server)
            if opponent_server:
                stop_process(opponent_server)
        rows, terminals = trajectories(summary['output'])
        metrics = ppo(model, optimizer, rows, terminals, ready['modelHash'], args.device, args.batch_size, iteration, deadline=deadline, stop_requested=lambda: stopped)
        history.append(dict(iteration=iteration, opponent=opponent, completed=summary['completed'], failures=summary['failures'], **metrics))
        current = output / f'checkpoint-{iteration+1}.pt'
        save(current, model, optimizer, iteration+1, training='ppo', history=history, shaping_schedule='zero throughout', device_info=info, champion=str(champion))
        if time.monotonic() < deadline and not stopped and args.evaluate == 'on':
            server, ready = start_server(current, output, args.device, args.threads)
            try:
                for opponent in ['bogruk', 'gobbo'] + (['tuned'] if args.tuned else []):
                    if time.monotonic() >= deadline:
                        break
                    evaluation = rollout(args, output, ready['port'], opponent, 1000000, max(1, deadline-time.monotonic()), sample=False)
                    update_ladder(ROOT / 'computer-player/training/ladder.json', ready['modelHash'], opponent, evaluation['records'], (ready['modelHash'], None))
                if time.monotonic() < deadline and args.promote == 'on':
                    opponent_dir = output / 'champion'
                    opponent_dir.mkdir(exist_ok=True)
                    reference_server, reference_ready = start_server(champion, opponent_dir, args.device, args.threads)
                    try:
                        gate = rollout(args, output, ready['port'], 'learned', 2000000 + iteration * args.promotion_matches,
                                       max(1, deadline-time.monotonic()), reference_ready['port'], sample=False, games=args.promotion_matches)
                        expected_models = (ready['modelHash'], reference_ready['modelHash'])
                        evidence = paired_evidence(gate['records'], args.promotion_matches, expected_models)
                        update_ladder(ROOT / 'computer-player/training/ladder.json', ready['modelHash'], reference_ready['modelHash'], gate['records'], expected_models)
                        if evidence['promoted']:
                            metadata = dict(schemaVersion=1, hash=ready['modelHash'], parent=reference_ready['modelHash'],
                                            checkpoint=str(current), iteration=iteration, evidence=evidence, engineCommit=gate['config']['engineCommit'])
                            destination = ROOT / 'computer-player/ml/champions'
                            destination.mkdir(exist_ok=True)
                            (destination / f'{ready["modelHash"]}.json').write_text(json.dumps(metadata, indent=2))
                            champion = current
                    finally:
                        stop_process(reference_server)
            finally:
                stop_process(server)
            Path(str(current) + '.champion.json').write_text(json.dumps(dict(champion=str(champion))))
        print(json.dumps(history[-1]), flush=True)
    (output / 'report.json').write_text(json.dumps(dict(device=info, history=history, checkpoint=str(current)), indent=2))


if __name__ == '__main__':
    main()
