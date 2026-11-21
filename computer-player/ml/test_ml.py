import json
import subprocess
import tempfile
import sys
import time
import unittest
from pathlib import Path
import torch
from .check import profile
from .model import Policy, batch, load
from .train_bc import save
from .train_rl import ppo, paired_evidence, update_ladder


class LearningTest(unittest.TestCase):
    def test_node_python_features_and_masked_model_agree(self):
        script = """
import {encode} from './training/features.mjs';
const s={callerRole:'home',actor:'home',phase:'PLAY',half:1,homeTurn:1,awayTurn:0,homeScore:1,awayScore:0,
homeRerolls:2,awayRerolls:1,weather:'NICE',players:[],ball:null,actions:[],computer:{attackDirection:1}};
console.log(JSON.stringify(encode(s,[{score:20},{score:0}])));
"""
        result = subprocess.run(['node', '--input-type=module', '-e', script], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, check=True)
        features = json.loads(result.stdout)
        tensors = batch([features, {**features, 'candidates': features['candidates'][:1]}], 'cpu')
        self.assertEqual(tuple(tensors[0].shape), (2, 26, 15, 26))
        self.assertEqual(tensors[1][0, 4].item(), .25)
        self.assertEqual(tensors[0][0, 24, 0, 0].item(), 1)
        model = Policy(8)
        logits, value = model(*tensors)
        self.assertTrue(torch.isneginf(logits[1, 1]))
        self.assertEqual(tuple(value.shape), (2,))
        with self.assertRaises(ValueError):
            batch([{**features, 'schemaVersion': 999}], 'cpu')
        optimizer = torch.optim.Adam(model.parameters())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'checkpoint.pt'
            save(path, model, optimizer, 3, training='ppo')
            restored, checkpoint = load(path, 'cpu')
            self.assertEqual(checkpoint['step'], 3)
            self.assertTrue(torch.equal(restored(*tensors)[0], logits))
            ready = Path(directory) / 'ready.json'
            feature_file = Path(directory) / 'features.json'
            feature_file.write_text(json.dumps(features))
            server = subprocess.Popen([sys.executable, '-m', 'ml.serve', '--checkpoint', str(path),
                                       '--ready', str(ready), '--device', 'cpu'],
                                      cwd=Path(__file__).resolve().parents[1], stdout=subprocess.DEVNULL)
            try:
                until = time.monotonic() + 15
                while not ready.exists() and server.poll() is None and time.monotonic() < until:
                    time.sleep(.05)
                self.assertTrue(ready.exists(), 'CPU inference server must start')
                port = json.loads(ready.read_text())['port']
                client = "import {infer} from './training/inference.mjs'; import {readFileSync} from 'node:fs'; console.log(JSON.stringify(await infer(Number(process.argv[1]), JSON.parse(readFileSync(process.argv[2])), 5000)));"
                reply = subprocess.run(['node', '--input-type=module', '-e', client, str(port), str(feature_file)],
                                       cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, check=True)
                self.assertIn(json.loads(reply.stdout)['index'], [0, 1])
            finally:
                server.terminate()
                server.wait(timeout=10)
        old_log = logits.log_softmax(-1)[0, 0].item()
        row = dict(features=features, episode='a', chosen=0, modelHash='abc', logProbability=old_log, actor='home')
        before = [p.detach().clone() for p in model.parameters()]
        metrics = ppo(model, optimizer, [row], {'a': dict(completed=True, result='home')}, 'abc', 'cpu', 1, 42, epochs=1)
        self.assertEqual(metrics['samples'], 1)
        self.assertTrue(any(not torch.equal(a, b) for a, b in zip(before, model.parameters())))
        self.assertEqual(ppo(model, optimizer, [row], {'a': dict(completed=False)}, 'abc', 'cpu', 1, 42)['samples'], 0)
        self.assertEqual(ppo(model, optimizer, [row], {'a': dict(completed=True, trajectoryComplete=False)}, 'abc', 'cpu', 1, 42)['samples'], 0)
        self.assertEqual(ppo(model, optimizer, [row], {'a': dict(completed=True, fallbackCount=1)}, 'abc', 'cpu', 1, 42)['samples'], 0)
        stopped = ppo(model, optimizer, [row], {'a': dict(completed=True, result='home')}, 'abc', 'cpu', 1, 42, stop_requested=lambda: True)
        self.assertEqual(stopped['updates'], 0)

    def test_profiles_and_pair_gate(self):
        self.assertEqual(profile(8192)['width'], 32)
        self.assertEqual(profile(16384)['width'], 64)
        rows = [dict(pair=i, swap=swap, completed=True, failureCode=None, score=[0, 1] if swap else [1, 0])
                for i in range(200) for swap in [0, 1]]
        self.assertTrue(paired_evidence(rows)['promoted'])
        self.assertFalse(paired_evidence(rows[:-2])['promoted'])
        self.assertEqual(paired_evidence([rows[0], rows[0]])['pairs'], 0)

    def test_fallback_or_wrong_model_cannot_receive_promotion_or_elo_credit(self):
        rows = [dict(pair=0, swap=swap, completed=True, failureCode=None, fallbackCount=0,
                     score=[0, 1] if swap else [1, 0], modelHashes=['old', 'new'] if swap else ['new', 'old'])
                for swap in [0, 1]]
        self.assertEqual(paired_evidence(rows, expected_models=('new', 'old'))['pairs'], 1)
        for change in [dict(fallbackCount=1), dict(modelHashes=['wrong', 'old'])]:
            invalid = [{**row, **change} for row in rows]
            self.assertEqual(paired_evidence(invalid, expected_models=('new', 'old'))['pairs'], 0)
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'ladder.json'
                update_ladder(path, 'new', 'old', invalid, ('new', 'old'))
                self.assertEqual(json.loads(path.read_text())['agents']['new']['matches'], 0)


if __name__ == '__main__':
    torch.set_num_threads(1)
    unittest.main()
