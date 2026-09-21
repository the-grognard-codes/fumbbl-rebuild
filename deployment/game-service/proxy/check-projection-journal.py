"""Read-only, bounded journal inspection. Emit counts/pass-fail, never raw records.

Run on the selected existing host as an operator: python3 - dev|prod.
This inspects the installed runtime, not an undeployed candidate or all history.
"""
import re
import subprocess
import sys


def private_shape(text):
    return bool(re.search(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', text)
                or re.search(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', text))


def inspect(environment):
    if environment not in ('dev', 'prod'):
        raise ValueError('Unknown environment')
    result = subprocess.run(['journalctl', '-u', 'moles-game-v2-' + environment,
                             '-n', '200', '--since', '2026-09-21 00:00:00 UTC',
                             '--no-pager', '--output=cat'], capture_output=True, timeout=20, check=True)
    if result.stdout.strip() in (b'', b'-- No entries --') or len(result.stdout) > 262144:
        raise ValueError('Missing or over-budget journal evidence')
    journal = result.stdout.decode('utf-8', errors='strict')
    # Compare actual stored provider subjects on-host; never print or export them.
    identities = subprocess.run(['mariadb', '--protocol=socket', '-uroot', '-N', '-B', '-e',
        'SELECT subject FROM ffb_m6_' + environment + '.ffb_v2_identity LIMIT 1001'],
        capture_output=True, timeout=20, check=True).stdout.decode('utf-8', errors='strict').splitlines()
    if len(identities) > 1000:
        raise ValueError('Identity comparison budget exceeded')
    if private_shape(journal) or any(value and value in journal for value in identities):
        raise ValueError('Private field detected')
    print('PASS bounded journal: bytes=' + str(len(result.stdout)) + ', lines=' + str(len(journal.splitlines()))
          + '; no stored provider subjects, email or JWT shapes detected.')


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Expected environment')
        inspect(sys.argv[1])
    except Exception:
        print('Journal check failed or unavailable; inspect only on the protected host.')
        raise SystemExit(1)
