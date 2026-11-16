import gzip
import json
import hashlib
from pathlib import Path


def trajectories(directory, max_rows=100000):
    rows, terminals = [], {}
    # Match records remain authoritative even if the trajectory byte cap was reached.
    for index_path in sorted(Path(directory).glob('matches-*-index.json')):
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
    for index_path in sorted(Path(directory).glob('trajectory-*-index.json')):
        index = json.loads(index_path.read_text())
        if index.get('schemaVersion') != 1:
            raise ValueError('Unsupported trajectory index')
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
                        terminals[row['episode']] = row
                    elif len(rows) < max_rows:
                        rows.append(row)
    return rows, terminals
