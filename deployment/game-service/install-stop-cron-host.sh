#!/usr/bin/env bash
# Uploaded by shutdown-cron.sh; runs as root on the selected VM.
set -euo pipefail

schedule=${1:?Usage: install-stop-cron-host.sh 'minute hour day-of-month month day-of-week'}

read -r minute hour day month weekday extra <<< "$schedule"
[[ -n "${minute:-}" && -n "${hour:-}" && -n "${day:-}" && -n "${month:-}" && -n "${weekday:-}" && -z "${extra:-}" ]] || {
  echo 'Use exactly five cron fields.' >&2
  exit 1
}
for field in "$minute" "$hour" "$day" "$month" "$weekday"; do
  [[ "$field" =~ ^[0-9*/,-]+$ ]] || { echo 'Cron fields may contain only digits, *, /, comma, and hyphen.' >&2; exit 1; }
done
schedule="$minute $hour $day $month $weekday"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq cron
systemctl enable --now cron.service

cat > /etc/cron.d/moles-game-stop <<EOF
# Managed by deployment/game-service/shutdown-cron.sh.
# The VM's guest shutdown transitions this Compute Engine instance to TERMINATED.
# This intentionally leaves its disks, reserved IP, DNS, firewall, and Hosting intact.
SHELL=/bin/sh
PATH=/usr/sbin:/usr/bin:/sbin:/bin
CRON_TZ=UTC
$schedule root /usr/sbin/shutdown -h now
EOF
chmod 644 /etc/cron.d/moles-game-stop
systemctl restart cron.service
echo "Installed UTC shutdown schedule: $schedule"
