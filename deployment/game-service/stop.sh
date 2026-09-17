#!/usr/bin/env bash
# Stops only the selected Compute Engine VM; retained infrastructure is preserved.
set -euo pipefail

target=${1:?Usage: stop.sh dev|prod|all}

project_for() {
  case "$1" in
    dev) printf '%s\n' dev-moles-under-the-pitch-org ;;
    prod) printf '%s\n' molesunderthepitch-dotorg ;;
    *) echo 'Environment must be dev, prod, or all.' >&2; exit 1 ;;
  esac
}

stop_for() {
  local environment=$1 project status
  project=$(project_for "$environment")
  status=$(gcloud compute instances describe moles-game --zone=us-central1-a --project="$project" --format='value(status)')
  case "$status" in
    RUNNING)
      gcloud compute instances stop moles-game --zone=us-central1-a --project="$project"
      printf 'Stopped %s moles-game.\n' "$environment"
      ;;
    TERMINATED) printf '%s moles-game is already stopped.\n' "$environment" ;;
    *) echo "$environment moles-game is not stoppable while its state is $status." >&2; exit 1 ;;
  esac
}

case "$target" in
  dev|prod) stop_for "$target" ;;
  all) stop_for dev; stop_for prod ;;
  *) project_for "$target" ;;
esac
