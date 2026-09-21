"""Print only pass/fail for the existing DEV logs; never output log or identity data."""
import pathlib
import re
import subprocess

try:
    result = subprocess.run(['mariadb', '--protocol=socket', '-uroot', '-N', '-B', '-e',
        'SELECT subject FROM ffb_m6_dev.ffb_v2_identity'], text=True, capture_output=True, check=True)
    needles = result.stdout.splitlines()
    for name in ['db_password', 'admin_password', 'coach_password']:
        needles.append(pathlib.Path('/etc/moles-game-v2-dev/secrets/' + name).read_text().strip())
    needles += ['synthetic-invalid', 'synthetic-denial']
    logs = subprocess.run(['journalctl', '-u', 'moles-game-v2-dev', '--no-pager'],
        text=True, capture_output=True, check=True).stdout
    for path in pathlib.Path('/var/log/moles-game-v2-dev').glob('*.log'):
        logs += path.read_text()
    access = pathlib.Path('/var/log/nginx/game-safe.log').read_text()
    assert all(re.fullmatch(r'\d{3} \d+ \d+\.\d+', line) for line in access.splitlines())
    assert all(needle not in logs + access for needle in needles if needle)
    assert not re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', logs + access)
    assert not re.search(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', logs + access)
    print('PASS checked logs exclude stored raw subjects, provisioned secrets, synthetic bearer/query probes, JWT shapes and email shapes; nginx fields are status/bytes/time only.')
except Exception:
    print('DEV log privacy check failed; inspect protected logs locally without exporting values.')
    raise SystemExit(1)
