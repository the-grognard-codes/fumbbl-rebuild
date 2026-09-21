"""One-shot empty DEV target provisioning; existing databases/users fail closed."""
import os
import pathlib
import re
import subprocess
import sys


def sql(statement):
    result = subprocess.run(['mariadb', '--protocol=socket', '-uroot', '--batch', '--skip-column-names'],
                            input=statement, text=True, capture_output=True)
    if result.returncode:
        # Server diagnostics may echo SQL containing credentials. Never emit them.
        raise RuntimeError('Database operation failed; partial target retained for review')
    return result.stdout.strip()


def main():
    if os.geteuid() != 0 or len(sys.argv) != 2:
        raise RuntimeError('Expected root and one schema file')
    project = subprocess.check_output(['curl', '-fsS', '-H', 'Metadata-Flavor:Google',
        'http://metadata.google.internal/computeMetadata/v1/project/project-id'], text=True)
    if project != 'dev-moles-under-the-pitch-org':
        raise RuntimeError('Wrong target project')
    schema = pathlib.Path(sys.argv[1]).read_text()
    if re.search(r'\b(DROP|TRUNCATE|INSERT|REPLACE|DELETE|CREATE DATABASE|USE)\s', schema, re.I):
        raise RuntimeError('Not a schema-only input')
    if len(re.findall(r'CREATE TABLE ', schema)) != 17:
        raise RuntimeError('Unexpected schema table count')
    if sql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='ffb_m6_dev';") != '0':
        raise RuntimeError('Target exists; refusing to overwrite or resume')
    if sql("SELECT COUNT(*) FROM mysql.user WHERE User='ffb_m6_runtime';") != '0':
        raise RuntimeError('Runtime user exists; refusing credential/grant replacement')
    if sql('SELECT @@global.general_log,@@global.slow_query_log,@@global.log_bin;') != '0\t0\t0':
        raise RuntimeError('SQL logging must be disabled before secret provisioning')
    password = pathlib.Path('/etc/moles-game-v2-dev/secrets/db_password').read_text().strip()
    if not re.fullmatch('[0-9a-f]{64}', password):
        raise RuntimeError('Invalid secret format')
    sql('CREATE DATABASE ffb_m6_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;')
    sql('USE ffb_m6_dev;\n' + schema + '\nINSERT INTO ffb_local_schema VALUES (6);')
    sql("CREATE USER 'ffb_m6_runtime'@'127.0.0.1' IDENTIFIED BY '" + password + "';\n"
        "GRANT SELECT,INSERT,UPDATE,DELETE ON ffb_m6_dev.* TO 'ffb_m6_runtime'@'127.0.0.1';")
    assert sql('SELECT version FROM ffb_m6_dev.ffb_local_schema;') == '6'
    print('Created empty DEV marker-6 schema and loopback-only CRUD runtime grant; no source rows copied.')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('DEV provisioning rejected or incomplete; retained target requires inspection. No automatic retry/reset.', file=sys.stderr)
        sys.exit(1)
