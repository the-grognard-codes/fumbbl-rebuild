#!/usr/bin/env bash
# DEV only; installs a new namespace, but does not stop the old service or open 443.
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]]
[[ $(curl -fsS -H Metadata-Flavor:Google http://metadata.google.internal/computeMetadata/v1/project/project-id) == dev-moles-under-the-pitch-org ]]
stage=/home/jacob_thegrognardcodes_com/moles-dev-install-20260921
[[ ! -e /opt/moles-game-v2-dev && ! -e /var/lib/moles-game-v2-dev && ! -e /var/log/moles-game-v2-dev ]]
! getent passwd moles-game-v2-dev >/dev/null
useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin moles-game-v2-dev
install -d -m 0755 /opt/moles-game-v2-dev /opt/moles-game-v2-dev/java /opt/moles-game-v2-dev/htdocs \
  /opt/moles-game-v2-dev/rosters /opt/moles-game-v2-dev/teams
unzip -q "$stage/ffb-server.zip" -d /opt/moles-game-v2-dev
tar -xzf "$stage/temurin21.tar.gz" -C /opt/moles-game-v2-dev/java
chmod -R a+rX /opt/moles-game-v2-dev
install -d -o moles-game-v2-dev -g moles-game-v2-dev -m 0700 \
  /var/lib/moles-game-v2-dev /var/lib/moles-game-v2-dev/backup /var/log/moles-game-v2-dev
chgrp moles-game-v2-dev /etc/moles-game-v2-dev /etc/moles-game-v2-dev/secrets
chmod 0750 /etc/moles-game-v2-dev /etc/moles-game-v2-dev/secrets
for field in db_password admin_password coach_password; do
  chgrp moles-game-v2-dev "/etc/moles-game-v2-dev/secrets/$field"
  chmod 0640 "/etc/moles-game-v2-dev/secrets/$field"
done
install -o root -g moles-game-v2-dev -m 0640 "$stage/native-dev.properties" /etc/moles-game-v2-dev/server.properties
install -m 0644 "$stage/moles-game-v2-dev.service" /etc/systemd/system/moles-game-v2-dev.service
systemd-analyze verify /etc/systemd/system/moles-game-v2-dev.service
systemctl daemon-reload
systemctl start moles-game-v2-dev.service
echo 'DEV runtime start requested on loopback only; public cutover not performed.'
