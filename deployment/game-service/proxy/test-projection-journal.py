import contextlib
import importlib.util
import io
import pathlib
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('journal_check', pathlib.Path(__file__).with_name('check-projection-journal.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class JournalCheckTest(unittest.TestCase):
    def scan(self, journal, subjects=b'provider-subject-sentinel\n'):
        results = [subprocess.CompletedProcess([], 0, journal), subprocess.CompletedProcess([], 0, subjects)]
        with patch.object(module.subprocess, 'run', side_effect=results) as run:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                module.inspect('dev')
            self.assertIn('-n', run.call_args_list[0].args[0])
            self.assertIn('200', run.call_args_list[0].args[0])
            self.assertEqual(20, run.call_args_list[0].kwargs['timeout'])
            self.assertNotIn('provider-subject-sentinel', output.getvalue())
            self.assertNotIn(journal.decode(), output.getvalue())

    def test_clean_sample_reports_counts_only(self):
        self.scan(b'Runtime started\n')

    def test_private_shapes_and_stored_subject_fail(self):
        for value in [b'private@example.invalid', b'eyJfixture.payload.signature', b'provider-subject-sentinel']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.scan(value)

    def test_empty_or_oversized_sample_is_not_acceptance(self):
        for value in [b'', b'-- No entries --\n', b'x' * 262145]:
            with self.assertRaises(ValueError):
                self.scan(value)

    def test_identity_budget_and_unknown_environment_fail_closed(self):
        with self.assertRaises(ValueError):
            self.scan(b'Runtime started\n', b'fixture\n' * 1001)
        with patch.object(module.subprocess, 'run') as run, self.assertRaises(ValueError):
            module.inspect('foreign')
        run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
