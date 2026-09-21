#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]]
[[ $(curl -fsS -H Metadata-Flavor:Google http://metadata.google.internal/computeMetadata/v1/project/project-id) == dev-moles-under-the-pitch-org ]]
stage=/home/jacob_thegrognardcodes_com/moles-dev-install-20260921
[[ -f /etc/moles-game-v2-dev/retained-20260921/nginx.conf ]]
[[ -f /etc/moles-game-v2-dev/retained-20260921/renewal-hook ]]
! systemctl is-active --quiet moles-game
systemctl is-active --quiet moles-game-v2-dev
[[ -z $(ss -Hlnt sport = :443) ]]
nginx -t -c "$stage/nginx.conf"
install -m 0644 "$stage/nginx.conf" /etc/nginx/nginx.conf
install -m 0755 "$stage/dev-cert-renewal.sh" /etc/letsencrypt/renewal-hooks/deploy/moles-game
nginx -t
systemctl disable moles-game
systemctl enable moles-game-v2-dev
systemctl unmask nginx.service
systemctl enable --now nginx
systemctl is-active nginx moles-game-v2-dev mariadb
echo 'DEV nginx TLS listener activated; Firebase Hosting remains a separate paired step.'
