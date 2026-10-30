#!/usr/bin/env bash
# Generate new host-local secrets only; never rotate/reuse existing credentials.
set -euo pipefail
set +x
umask 077

environment=${1:?Usage: create-host-secrets.sh dev|prod}
[[ $# == 1 ]] || { echo 'Expected one environment.' >&2; exit 1; }
case "$environment" in
  dev|prod) ;;
  *) echo 'Environment must be dev or prod.' >&2; exit 1 ;;
esac
[[ $(id -u) == 0 ]] || { echo 'Run as root on the selected host.' >&2; exit 1; }
command -v openssl >/dev/null

destination="/etc/moles-game-v2-$environment"
# Exclusive creation is intentional. A partial attempt is retained for review,
# not removed, completed automatically, or overwritten by a retry.
[[ ! -e "$destination" && ! -L "$destination" ]] || {
  echo 'Destination exists; refusing to create or replace credentials.' >&2
  exit 1
}
mkdir -m 0700 -- "$destination"
mkdir -m 0700 -- "$destination/secrets"
openssl rand -hex -out "$destination/secrets/db_password" 32
chmod 0600 -- "$destination/secrets/db_password"
[[ $(stat -c '%a:%U:%G' "$destination/secrets/db_password") == 600:root:root ]]
LC_ALL=C grep -Eq '^[0-9a-f]{64}$' "$destination/secrets/db_password"

[[ $(stat -c '%a:%U:%G' "$destination/secrets") == 700:root:root ]]
echo "$environment: one new root-only database secret file created; values not displayed."
echo 'Database account/grants and runtime read access are not installed by this command.'
