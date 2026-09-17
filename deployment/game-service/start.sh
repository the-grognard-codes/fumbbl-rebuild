#!/usr/bin/env bash
# Starts the selected game-service VM; the enabled systemd service starts at boot.
set -euo pipefail

target=${1:?Usage: start.sh dev|prod|all}

project_for() {
  case "$1" in
    dev) printf '%s\n' dev-moles-under-the-pitch-org ;;
    prod) printf '%s\n' molesunderthepitch-dotorg ;;
    *) echo 'Environment must be dev, prod, or all.' >&2; exit 1 ;;
  esac
}

start_for() {
  local environment=$1 project status attempt
  project=$(project_for "$environment")
  status=$(gcloud compute instances describe moles-game --zone=us-central1-a --project="$project" --format='value(status)')
  case "$status" in
    RUNNING) printf '%s moles-game is already running.\n' "$environment" ;;
    TERMINATED)
      gcloud compute instances start moles-game --zone=us-central1-a --project="$project"
      printf 'Started %s moles-game; waiting for its service.\n' "$environment"
      ;;
    *) echo "$environment moles-game is not startable while its state is $status." >&2; exit 1 ;;
  esac
  for attempt in {1..12}; do
    if gcloud compute ssh moles-game --zone=us-central1-a --project="$project" --tunnel-through-iap \
      --command='sudo systemctl is-active --quiet moles-game.service' >/dev/null 2>&1; then
      printf '%s game service is active.\n' "$environment"
      return
    fi
    sleep 5
  done
  echo "$environment VM started, but moles-game.service did not become active within 60 seconds." >&2
  gcloud compute ssh moles-game --zone=us-central1-a --project="$project" --tunnel-through-iap \
    --command='sudo systemctl status moles-game.service --no-pager' >&2 || true
  exit 1
}

case "$target" in
  dev|prod) start_for "$target" ;;
  all) start_for dev; start_for prod ;;
  *) project_for "$target" ;;
esac
