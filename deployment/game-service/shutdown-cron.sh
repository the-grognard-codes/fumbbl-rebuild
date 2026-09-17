#!/usr/bin/env bash
# Installs a power-off cron job inside each selected game-service VM.
set -euo pipefail

target=${1:?Usage: shutdown-cron.sh dev|prod|all 'minute hour day-of-month month day-of-week'}
schedule=${2:?Provide a five-field UTC cron schedule, for example '0 3 * * *'}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

read -r minute hour day month weekday extra <<< "$schedule"
[[ -n "${minute:-}" && -n "${hour:-}" && -n "${day:-}" && -n "${month:-}" && -n "${weekday:-}" && -z "${extra:-}" ]] || {
  echo 'Use exactly five cron fields.' >&2
  exit 1
}
for field in "$minute" "$hour" "$day" "$month" "$weekday"; do
  [[ "$field" =~ ^[0-9*/,-]+$ ]] || { echo 'Cron fields may contain only digits, *, /, comma, and hyphen.' >&2; exit 1; }
done
schedule="$minute $hour $day $month $weekday"

project_for() {
  case "$1" in
    dev) printf '%s\n' dev-moles-under-the-pitch-org ;;
    prod) printf '%s\n' molesunderthepitch-dotorg ;;
    *) echo 'Environment must be dev, prod, or all.' >&2; exit 1 ;;
  esac
}

install_for() {
  local environment=$1 project status
  project=$(project_for "$environment")
  status=$(gcloud compute instances describe moles-game --zone=us-central1-a --project="$project" --format='value(status)')
  [[ "$status" == RUNNING ]] || { echo "$environment moles-game must be RUNNING before installing its cron job (current state: $status)." >&2; exit 1; }
  gcloud compute scp "$script_dir/install-stop-cron-host.sh" moles-game:~/ --zone=us-central1-a --project="$project" --tunnel-through-iap
  gcloud compute ssh moles-game --zone=us-central1-a --project="$project" --tunnel-through-iap \
    --command="sudo bash ./install-stop-cron-host.sh '$schedule'"
  printf 'Installed %s shutdown cron on %s.\n' "$environment" "$project"
}

case "$target" in
  dev|prod) install_for "$target" ;;
  all) install_for dev; install_for prod ;;
  *) project_for "$target" ;;
esac
