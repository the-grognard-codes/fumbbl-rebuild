import gzip
import json
import hashlib
from pathlib import Path


def trajectories(directory, max_rows=100000):
    rows, terminals = [], {}
    persisted_terminals, retained_counts, compact_episodes = {}, {}, set()
    # Match records remain authoritative even if the trajectory byte cap was reached.
    for index_path in sorted(Path(directory).glob('matches*-index.json')):
        index = json.loads(index_path.read_text())
        if index.get('schemaVersion') != 1:
            raise ValueError('Unsupported match index')
        for shard in index['shards']:
            path = index_path.parent / shard['file']
            if hashlib.sha256(path.read_bytes()).hexdigest() != shard['sha256']:
                raise ValueError('Match checksum mismatch')
            with gzip.open(path, 'rt', encoding='utf8') as stream:
                for line in stream:
                    row = json.loads(line)
                    terminals[row['id']] = row
                    compact_episodes.add(row['id'])
    for index_path in sorted(Path(directory).glob('trajectory-*-index.json')):
        index = json.loads(index_path.read_text())
        if index.get('schemaVersion') != 1:
            raise ValueError('Unsupported trajectory index')
        if index.get('pruned'):
            raise ValueError('Training details were pruned; choose a retained batch')
        for shard in index['shards']:
            path = index_path.parent / shard['file']
            if hashlib.sha256(path.read_bytes()).hexdigest() != shard['sha256']:
                raise ValueError('Trajectory checksum mismatch')
            with gzip.open(path, 'rt', encoding='utf8') as stream:
                for line in stream:
                    row = json.loads(line)
                    if row.get('schemaVersion') != 1:
                        raise ValueError('Unsupported trajectory schema')
                    if row.get('terminal'):
                        persisted_terminals[row['episode']] = row
                        terminals.setdefault(row['episode'], row)
                    elif len(rows) < max_rows:
                        rows.append(row)
                        retained_counts[row['episode']] = retained_counts.get(row['episode'], 0) + 1
                    else:
                        terminals.setdefault(row['episode'], {})['trajectoryComplete'] = False
    for episode, terminal in terminals.items():
        if 'trajectoryComplete' in terminal and episode not in compact_episodes:
            terminal['trajectoryComplete'] = False
        # A durable compact result can precede the final trajectory flush.
        # New match records must agree with the data actually available to PPO.
        if 'trajectoryRows' in terminal:
            persisted = persisted_terminals.get(episode, {})
            if (not persisted.get('completed') or not persisted.get('trajectoryComplete')
                    or retained_counts.get(episode, 0) != terminal['trajectoryRows']):
                terminal['trajectoryComplete'] = False
    return rows, terminals
