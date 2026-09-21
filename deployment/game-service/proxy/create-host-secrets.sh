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
openssl rand -hex -out "$destination/secrets/admin_password" 32
# The legacy bootstrap field requires 32 lowercase hex characters. This is
# random material, not a password for a Firebase/application principal.
openssl rand -hex -out "$destination/secrets/coach_password" 16
chmod 0600 -- "$destination/secrets/db_password" \
  "$destination/secrets/admin_password" "$destination/secrets/coach_password"

for field in db_password admin_password coach_password; do
  length=64
  [[ "$field" != coach_password ]] || length=32
  [[ $(stat -c '%a:%U:%G' "$destination/secrets/$field") == 600:root:root ]]
  LC_ALL=C grep -Eq "^[0-9a-f]{$length}$" "$destination/secrets/$field"
done
[[ $(stat -c '%a:%U:%G' "$destination/secrets") == 700:root:root ]]
echo "$environment: three new root-only secret files created; values not displayed."
echo 'Database account/grants and runtime read access are not installed by this command.'
