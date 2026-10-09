#!/usr/bin/env bash
# Starts the selected game-service VM; the enabled systemd service starts at boot.
set -euo pipefail

target=${1:?Usage: start.sh dev|prod|all}
command -v timeout >/dev/null 2>&1 || {
  echo "The 'timeout' command from GNU coreutils is required." >&2
  exit 1
}
managed_ssh_agent_pid=

cleanup_managed_ssh_agent() {
  if [[ -n "$managed_ssh_agent_pid" ]]; then
    ssh-agent -k >/dev/null 2>&1 || true
  fi
}

prepare_ssh_agent() {
  local identity="${HOME}/.ssh/google_compute_engine"
  local identity_fingerprint loaded_fingerprints agent_available=0 agent_status agent_output
  [[ -r "$identity" ]] || return 0

  if [[ -r "$identity.pub" ]]; then
    identity_fingerprint=$(ssh-keygen -lf "$identity.pub" | awk '{print $2}')
    loaded_fingerprints=$(ssh-add -l 2>/dev/null | awk '{print $2}' || true)
    if [[ -n "$identity_fingerprint" ]] &&
      grep -Fxq -- "$identity_fingerprint" <<<"$loaded_fingerprints"; then
      return 0
    fi
  fi

  if ssh-add -l >/dev/null 2>&1; then
    agent_available=1
  else
    agent_status=$?
    if [[ $agent_status -eq 1 ]]; then
      agent_available=1
    fi
  fi

  if [[ $agent_available -eq 0 ]]; then
    agent_output=$(ssh-agent -s)
    eval "$agent_output" >/dev/null
    managed_ssh_agent_pid=$SSH_AGENT_PID
    trap cleanup_managed_ssh_agent EXIT
  fi

  ssh-add "$identity"
}

wait_for_dev_runtime() {
  local script_dir deadline attempt=0 remaining probe_timeout check_status
  command -v node >/dev/null 2>&1 || {
    echo "Node.js is required for the DEV WSS health check." >&2
    exit 1
  }
  script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
  deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    attempt=$((attempt + 1))
    remaining=$((deadline - SECONDS))
    probe_timeout=10
    if (( remaining < probe_timeout )); then
      probe_timeout=$remaining
    fi
    printf 'dev public WSS check %d (%d seconds remain).\n' "$attempt" "$remaining"
    if timeout --kill-after=2s "${probe_timeout}s" node "$script_dir/proxy/check-dev-runtime.mjs" >/dev/null; then
      printf 'dev WSS game runtime is ready.\n'
      return
    else
      check_status=$?
      case "$check_status" in
        124|137|143) printf 'dev public WSS check timed out after %s seconds.\n' "$probe_timeout" >&2 ;;
      esac
    fi
    remaining=$((deadline - SECONDS))
    if (( remaining > 0 )); then
      sleep "$((remaining < 5 ? remaining : 5))"
    fi
  done
  echo 'dev VM is running, but its public /browser/v2 WSS endpoint did not become ready within 60 seconds.' >&2
  exit 1
}

project_for() {
  case "$1" in
    dev) printf '%s\n' dev-moles-under-the-pitch-org ;;
    prod) printf '%s\n' molesunderthepitch-dotorg ;;
    *) echo 'Environment must be dev, prod, or all.' >&2; exit 1 ;;
  esac
}

start_for() {
  local environment=$1 project status attempt=0 deadline remaining probe_timeout check_status
  if [[ "$environment" == dev ]] && ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required to check the DEV WSS runtime before starting the VM." >&2
    exit 1
  fi
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
  if [[ "$environment" == dev ]]; then
    wait_for_dev_runtime
    return
  fi
  prepare_ssh_agent
  deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    attempt=$((attempt + 1))
    remaining=$((deadline - SECONDS))
    probe_timeout=15
    if (( remaining < probe_timeout )); then
      probe_timeout=$remaining
    fi
    printf '%s service check %d (%d seconds remain).\n' "$environment" "$attempt" "$remaining"
    if timeout --kill-after=2s "${probe_timeout}s" \
      gcloud compute ssh moles-game --zone=us-central1-a --project="$project" --tunnel-through-iap \
        --command='sudo systemctl is-active --quiet moles-game.service' >/dev/null; then
      printf '%s game service is active.\n' "$environment"
      return
    else
      check_status=$?
      case "$check_status" in
        124|137|143) printf '%s SSH readiness check timed out after %s seconds.\n' "$environment" "$probe_timeout" >&2 ;;
      esac
    fi
    remaining=$((deadline - SECONDS))
    if (( remaining > 0 )); then
      sleep "$((remaining < 5 ? remaining : 5))"
    fi
  done
  echo "$environment VM started, but moles-game.service did not become active within 60 seconds." >&2
  echo 'Fetching service status (10-second timeout).' >&2
  if timeout --kill-after=2s 10s gcloud compute ssh moles-game --zone=us-central1-a --project="$project" --tunnel-through-iap \
    --command='sudo systemctl status moles-game.service --no-pager' >&2; then
    :
  else
    check_status=$?
    case "$check_status" in
      124|137|143) echo 'Final service status check timed out.' >&2 ;;
    esac
  fi
  exit 1
}

case "$target" in
  dev|prod) start_for "$target" ;;
  all) start_for dev; start_for prod ;;
  *) project_for "$target" ;;
esac
