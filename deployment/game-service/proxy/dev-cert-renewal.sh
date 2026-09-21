#!/usr/bin/env bash
set -euo pipefail
# Existing standalone HTTP-01 renewal keeps port 80 free. No JVM restart.
if [[ ${RENEWED_LINEAGE:-} == /etc/letsencrypt/live/game-dev.molesunderthepitch.org ]]; then
  /usr/sbin/nginx -t
  /usr/bin/systemctl reload nginx
fi
