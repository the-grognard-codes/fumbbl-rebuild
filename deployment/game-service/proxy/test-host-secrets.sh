#!/usr/bin/env bash
# Run only in a disposable container with fresh /etc/moles-game-v2-{dev,prod}.
set -euo pipefail
[[ -f /.dockerenv ]] || { echo 'Container-only test.' >&2; exit 1; }
generator=/checks/create-host-secrets.sh
bash -n "$generator"
if bash "$generator" invalid >/dev/null 2>&1; then exit 1; fi
if bash "$generator" dev extra >/dev/null 2>&1; then exit 1; fi
[[ ! -e /etc/moles-game-v2-dev ]]
bash "$generator" dev
before=$(sha256sum /etc/moles-game-v2-dev/secrets/*)
if bash "$generator" dev >/dev/null 2>&1; then exit 1; fi
[[ "$before" == "$(sha256sum /etc/moles-game-v2-dev/secrets/*)" ]]
bash "$generator" prod
for field in db_password admin_password coach_password; do
  if cmp -s "/etc/moles-game-v2-dev/secrets/$field" "/etc/moles-game-v2-prod/secrets/$field"; then exit 1; fi
done
echo 'PASS: valid environments, secret formats/modes, independent values, invalid arguments, and non-overwriting retry.'
