#!/usr/bin/env bash
# Quiesce the old presence-only runtime and preserve a cold copy before inspection.
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]]
[[ $(curl -fsS -H Metadata-Flavor:Google http://metadata.google.internal/computeMetadata/v1/project/project-id) == dev-moles-under-the-pitch-org ]]
[[ -z $(ss -Hnt state established sport = :443) ]]
snapshot=/etc/moles-game-v2-dev/retained-20260921
mkdir -m 0700 "$snapshot"
cp -a /etc/systemd/system/moles-game.service "$snapshot/"
cp -a /etc/letsencrypt/renewal-hooks/deploy/moles-game "$snapshot/renewal-hook"
cp -a /etc/nginx/nginx.conf "$snapshot/nginx.conf"
systemctl stop moles-game
cp -a /var/lib/moles-game/accounts.mv.db "$snapshot/accounts.mv.db"
# Read only the copy. Values are counts, never identity/account columns.
/usr/bin/java -cp /opt/moles-game/game-service.jar org.h2.tools.Shell \
  -url "jdbc:h2:file:$snapshot/accounts;ACCESS_MODE_DATA=r;IFEXISTS=TRUE" -user sa -password '' \
  -sql 'SELECT COUNT(*) AS ACCOUNT_COUNT FROM INTERNAL_ACCOUNT; SELECT COUNT(*) AS IDENTITY_COUNT FROM GAME_IDENTITY; SELECT COUNT(*) AS INVITATION_COUNT FROM GAME_INVITATION;'
