import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from .data import trajectories


class DataRetentionTest(unittest.TestCase):
    def shard(self, root, prefix, rows, **extra):
        data = gzip.compress(('\n'.join(json.dumps(row) for row in rows) + '\n').encode())
        name = prefix + '-00000.jsonl.gz'
        (root / name).write_bytes(data)
        (root / (prefix + '-index.json')).write_text(json.dumps(dict(schemaVersion=1, shards=[
            dict(file=name, sha256=hashlib.sha256(data).hexdigest())], **extra)))

    def test_match_index_overrides_terminal_and_reader_cap_marks_partial_episodes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.shard(root, 'matches', [dict(id='a', completed=True, trajectoryComplete=False)])
            self.shard(root, 'trajectory-0', [dict(schemaVersion=1, episode='a', step=1),
                                            dict(schemaVersion=1, episode='a', terminal=True, completed=True)])
            rows, terminals = trajectories(root)
            self.assertEqual(len(rows), 1)
            self.assertFalse(terminals['a']['trajectoryComplete'])
            self.shard(root, 'matches', [dict(id='a', completed=True, trajectoryComplete=True)])
            self.assertFalse(trajectories(root, max_rows=0)[1]['a']['trajectoryComplete'])

    def test_pruned_trajectory_batch_is_rejected_explicitly(self):
        with tempfile.TemporaryDirectory() as directory:
            self.shard(Path(directory), 'trajectory-0', [], pruned=True)
            with self.assertRaisesRegex(ValueError, 'pruned'):
                trajectories(directory)

    def test_interrupted_final_flush_never_qualifies_partial_rows_for_ppo(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.shard(root, 'matches', [dict(id='a', completed=True, trajectoryComplete=True, trajectoryRows=2)])
            decision = dict(schemaVersion=1, episode='a', step=1)
            terminal = dict(schemaVersion=1, episode='a', terminal=True, completed=True, trajectoryComplete=True)
            for records in [[decision], [decision, terminal]]:
                self.shard(root, 'trajectory-0', records)
                rows, terminals = trajectories(root)
                self.assertEqual(len(rows), 1)  # BC can still use the retained sample.
                self.assertFalse(terminals['a']['trajectoryComplete'])
            self.shard(root, 'trajectory-0', [decision, {**decision, 'step': 2}, terminal])
            self.assertTrue(trajectories(root)[1]['a']['trajectoryComplete'])
            (root / 'matches-index.json').unlink()
            self.assertFalse(trajectories(root)[1]['a']['trajectoryComplete'])


if __name__ == '__main__':
    unittest.main()
