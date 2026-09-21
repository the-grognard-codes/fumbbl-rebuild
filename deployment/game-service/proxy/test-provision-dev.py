import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('provision', pathlib.Path(__file__).with_name('provision-dev-database.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ProvisionTest(unittest.TestCase):
    def invoke(self, answers=None, schema=None, project='dev-moles-under-the-pitch-org', secret='a' * 64):
        source = schema if schema is not None else '\n'.join('CREATE TABLE t%d (id INT);' % i for i in range(17))
        with patch.object(module.os, 'geteuid', return_value=0, create=True), patch.object(module.sys, 'argv', ['script', 'schema.sql']), \
                patch.object(module.subprocess, 'check_output', return_value=project), \
                patch.object(module.pathlib.Path, 'read_text', side_effect=[source, secret]), \
                patch.object(module, 'sql', side_effect=answers or ['0', '0', '0\t0\t0', '', '', '', '6']) as sql:
            module.main()
            return [call.args[0] for call in sql.call_args_list]

    def test_empty_target_and_scoped_crud_only(self):
        calls = self.invoke()
        self.assertEqual(7, len(calls))
        self.assertIn("'ffb_m6_runtime'@'127.0.0.1'", calls[5])
        self.assertIn('GRANT SELECT,INSERT,UPDATE,DELETE ON ffb_m6_dev.*', calls[5])
        self.assertNotIn('DROP', '\n'.join(calls))

    def test_existing_database_rejected(self):
        with self.assertRaises(RuntimeError): self.invoke(answers=['1'])

    def test_existing_user_rejected(self):
        with self.assertRaises(RuntimeError): self.invoke(answers=['0', '1'])

    def test_sql_logging_rejected(self):
        with self.assertRaises(RuntimeError): self.invoke(answers=['0', '0', '1\t0\t0'])

    def test_foreign_project_rejected(self):
        with self.assertRaises(RuntimeError): self.invoke(project='molesunderthepitch-dotorg')

    def test_data_or_destructive_sql_rejected(self):
        for keyword in ['INSERT INTO', 'DROP TABLE', 'TRUNCATE TABLE', 'DELETE FROM', 'REPLACE INTO', 'USE']:
            with self.subTest(keyword=keyword), self.assertRaises(RuntimeError): self.invoke(schema=keyword + ' x;')

    def test_invalid_secret_rejected(self):
        with self.assertRaises(RuntimeError): self.invoke(secret="unsafe'password")

    def test_sql_error_does_not_expose_diagnostics(self):
        failure = type('Result', (), {'returncode': 1, 'stderr': 'private secret', 'stdout': ''})()
        with patch.object(module.subprocess, 'run', return_value=failure):
            with self.assertRaisesRegex(RuntimeError, '^Database operation failed; partial target retained for review$'):
                module.sql('synthetic query')


if __name__ == '__main__': unittest.main()
