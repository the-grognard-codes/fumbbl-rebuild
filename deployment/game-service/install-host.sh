#!/usr/bin/env bash
# Uploaded by activate.sh; runs on the chosen VM, never on the workstation.
set -euo pipefail
environment=${1:?}
contact=${2:?}
case "$environment" in
  dev) project=dev-moles-under-the-pitch-org; domain=game-dev.molesunderthepitch.org; origin=https://dev.molesunderthepitch.org ;;
  prod) project=molesunderthepitch-dotorg; domain=game.molesunderthepitch.org; origin=https://molesunderthepitch.org ;;
  *) exit 1 ;;
esac
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq openjdk-21-jre-headless certbot cron openssl
id moles-game >/dev/null 2>&1 || useradd --system --home-dir /var/lib/moles-game --shell /usr/sbin/nologin moles-game
device=/dev/disk/by-id/google-game-data
[[ -b "$device" ]] || { echo 'Required dedicated data disk is missing.' >&2; exit 1; }
if ! blkid "$device" >/dev/null; then mkfs.ext4 -L moles-game-data "$device"; fi
mkdir -p /var/lib/moles-game /etc/moles-game /opt/moles-game
if ! mountpoint -q /var/lib/moles-game; then mount "$device" /var/lib/moles-game; fi
disk_uuid=$(blkid -s UUID -o value "$device")
grep -q "UUID=$disk_uuid " /etc/fstab || printf 'UUID=%s /var/lib/moles-game ext4 defaults 0 2\n' "$disk_uuid" >> /etc/fstab
chown moles-game:moles-game /var/lib/moles-game
chmod 700 /var/lib/moles-game
certbot certonly --standalone --non-interactive --agree-tos --email "$contact" -d "$domain"
if [[ ! -f /etc/moles-game/keystore-password ]]; then
  umask 077
  openssl rand -hex 32 > /etc/moles-game/keystore-password
fi
password=$(cat /etc/moles-game/keystore-password)
umask 077
cat > /etc/moles-game/service.env <<EOF
GAME_ENV=$environment
FIREBASE_PROJECT_ID=$project
GAME_ORIGIN=$origin
GAME_PORT=443
GAME_KEYSTORE=/etc/moles-game/server.p12
GAME_KEYSTORE_PASSWORD=$password
GAME_DB_PATH=/var/lib/moles-game/accounts
EOF
cat > /etc/letsencrypt/renewal-hooks/deploy/moles-game <<EOF
#!/usr/bin/env bash
set -euo pipefail
umask 077
openssl pkcs12 -export -in /etc/letsencrypt/live/$domain/fullchain.pem -inkey /etc/letsencrypt/live/$domain/privkey.pem -out /etc/moles-game/server.p12.new -name game -passout file:/etc/moles-game/keystore-password
chown root:moles-game /etc/moles-game/server.p12.new
chmod 640 /etc/moles-game/server.p12.new
mv /etc/moles-game/server.p12.new /etc/moles-game/server.p12
if systemctl cat moles-game.service >/dev/null 2>&1; then systemctl try-restart moles-game.service; fi
EOF
chmod 700 /etc/letsencrypt/renewal-hooks/deploy/moles-game
bash /etc/letsencrypt/renewal-hooks/deploy/moles-game
install -o root -g root -m 644 ./game-service.jar /opt/moles-game/game-service.jar
cat > /etc/systemd/system/moles-game.service <<'EOF'
[Unit]
Description=Firebase two-player game session service
After=network-online.target
Wants=network-online.target
RequiresMountsFor=/var/lib/moles-game
[Service]
User=moles-game
Group=moles-game
EnvironmentFile=/etc/moles-game/service.env
ExecStart=/usr/bin/java -Xms128m -Xmx512m -jar /opt/moles-game/game-service.jar
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/moles-game
PrivateTmp=true
UMask=0077
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable moles-game.service certbot.timer
systemctl restart moles-game.service
systemctl is-active --quiet moles-game.service
