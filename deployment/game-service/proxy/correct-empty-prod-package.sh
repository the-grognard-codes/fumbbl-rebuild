#!/usr/bin/env bash
# One-time correction, only for the empty 2026-09-21 PROD installation.
# Never use this procedure to upgrade a populated runtime.
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]]
[[ $(curl -fsS -H Metadata-Flavor:Google http://metadata.google.internal/computeMetadata/v1/project/project-id) == molesunderthepitch-dotorg ]]
candidate=/home/jacob_thegrognardcodes_com/moles-prod-install-20260921/FantasyFootballServer-java21.jar
retained=/etc/moles-game-v2-prod/retained-20260921/pre-isolated-build.jar
expected=5c693bb956743d23f5734b6e3d0ef69d45bdaf85537c433cbe71373708e3c1e9
[[ $(sha256sum "$candidate" | cut -d ' ' -f 1) == "$expected" ]]
[[ ! -e "$retained" ]]
empty_runtime() {
  [[ $(mariadb -N -B -e 'SELECT (SELECT COUNT(*) FROM ffb_m6_prod.ffb_prepared_matches)+(SELECT COUNT(*) FROM ffb_m6_prod.ffb_match_recovery)+(SELECT COUNT(*) FROM ffb_m6_prod.ffb_v2_account);') == 0 ]]
}
empty_runtime
[[ -z $(ss -Hnt state established sport = :22231) ]]
# Close admission, then recheck for a connection/mutation racing the first check.
systemctl stop nginx
if ! empty_runtime || [[ -n $(ss -Hnt state established sport = :22231) ]]; then
  systemctl start nginx
  echo 'Refusing runtime replacement: PROD is no longer empty.' >&2
  exit 1
fi
systemctl stop moles-game-v2-prod
cp -a /opt/moles-game-v2-prod/FantasyFootballServer.jar "$retained"
install -o root -g root -m 0644 "$candidate" /opt/moles-game-v2-prod/FantasyFootballServer.jar
systemctl start moles-game-v2-prod
for attempt in $(seq 1 30); do
  if [[ -n $(ss -Hlnt sport = :22231) ]]; then break; fi
  sleep 1
done
systemctl is-active --quiet moles-game-v2-prod
[[ -n $(ss -Hlnt sport = :22231) ]]
nginx -t
systemctl start nginx
sha256sum /opt/moles-game-v2-prod/FantasyFootballServer.jar
systemctl is-active nginx moles-game-v2-prod mariadb
echo 'Installed isolated Java 21 package; prior jar and all data retained.'
