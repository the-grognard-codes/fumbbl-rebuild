#!/usr/bin/env bash
# Run only through an explicit cloud-CLI operator invocation. No runtime deployment.
set -euo pipefail
set +x
umask 077

fail() { printf '%s\n' "$1" >&2; return 2; }

select_environment() {
  case "$1" in
    dev) cleanup_project=dev-moles-under-the-pitch-org ;;
    prod) cleanup_project=molesunderthepitch-dotorg ;;
    *) fail 'Environment must be dev or prod.'; return 2 ;;
  esac
  cleanup_environment=$1
  cleanup_database="ffb_m6_$1"
  cleanup_unit="moles-game-v2-$1.service"
  cleanup_config="/etc/moles-game-v2-$1/server.properties"
  cleanup_java="/opt/moles-game-v2-$1/java/openjdk/bin/java"
}

verify_host() {
  [[ $(id -u) == 0 ]] || { fail 'Run this helper with sudo on the selected VM.'; return 2; }
  local metadata=http://metadata.google.internal/computeMetadata/v1
  [[ $(curl -fsS --max-time 10 -H Metadata-Flavor:Google "$metadata/project/project-id") == "$cleanup_project" ]] || {
    fail 'Wrong cloud project; no database operation performed.'; return 2;
  }
  [[ $(curl -fsS --max-time 10 -H Metadata-Flavor:Google "$metadata/instance/name") == moles-game ]] || {
    fail 'Wrong VM; no database operation performed.'; return 2;
  }
  [[ $(curl -fsS --max-time 10 -H Metadata-Flavor:Google "$metadata/instance/zone") == */zones/us-central1-a ]] || {
    fail 'Wrong zone; no database operation performed.'; return 2;
  }
}

property() {
  # These keys have simple, literal values in the fixed native runtime profiles.
  awk -v key="$1" 'index($0, key "=") == 1 { sub(/\r$/, ""); print substr($0, length(key) + 2); count++ }
    END { if (count != 1) exit 2 }' "$cleanup_config"
}

bind_database() {
  export MUTP_CLEANUP_JDBC_URL MUTP_CLEANUP_DB_USER MUTP_CLEANUP_DB_PASSWORD_FILE
  MUTP_CLEANUP_JDBC_URL=$(property db.url)
  MUTP_CLEANUP_DB_USER=$(property db.user)
  MUTP_CLEANUP_DB_PASSWORD_FILE=$(property db.password.file)
  [[ "$MUTP_CLEANUP_JDBC_URL" == "jdbc:mariadb://127.0.0.1:3306/$cleanup_database"
    && "$MUTP_CLEANUP_DB_USER" == ffb_m6_runtime
    && "$MUTP_CLEANUP_DB_PASSWORD_FILE" == "/etc/moles-game-v2-$cleanup_environment/secrets/db_password"
    && -r "$MUTP_CLEANUP_DB_PASSWORD_FILE" && -x "$cleanup_java" ]] || {
    fail 'Runtime profile or credential path differs from the selected environment.'; return 2;
  }
}

assert_writers_stopped() {
  [[ $(systemctl show "$cleanup_unit" --property=LoadState --value) == loaded ]] || {
    fail 'Expected native game service is not installed.'; return 2;
  }
  local state
  state=$(systemctl show "$cleanup_unit" --property=ActiveState --value)
  [[ "$state" == inactive || "$state" == failed ]] || {
    fail "Apply requires $cleanup_unit stopped; save/finish matches before the maintenance window."; return 2;
  }
}

prepare_bundle() {
  local archive=$1 digest=$2
  [[ -f "$archive" && ! -L "$archive" && $(sha256sum -- "$archive" | cut -d ' ' -f 1) == "$digest" ]] || {
    fail 'Archive digest mismatch.'; return 2;
  }
  cleanup_work="/var/lib/moles-obsolete-team-cleanup/$cleanup_environment/$digest"
  # Keep plans, saved-team backups and the executed archive root-owned/private.
  local path
  for path in /var/lib/moles-obsolete-team-cleanup "/var/lib/moles-obsolete-team-cleanup/$cleanup_environment" "$cleanup_work"; do
    [[ ! -L "$path" ]] || { fail 'Cleanup destination is a symlink.'; return 2; }
    if [[ ! -e "$path" ]]; then mkdir -m 0700 -- "$path"; fi
    [[ -d "$path" && $(stat -c '%U:%a' -- "$path") == root:700 ]] || {
      fail 'Cleanup destination must be a root-owned 0700 directory.'; return 2;
    }
  done
  if [[ ! -f "$cleanup_work/ffb-server.zip" ]]; then
    install -m 0600 -- "$archive" "$cleanup_work/ffb-server.zip"
  fi
  [[ ! -L "$cleanup_work/ffb-server.zip"
    && $(sha256sum -- "$cleanup_work/ffb-server.zip" | cut -d ' ' -f 1) == "$digest" ]] || {
    fail 'Retained archive digest mismatch.'; return 2;
  }
  cleanup_bundle="$cleanup_work/bundle"
  if [[ ! -e "$cleanup_bundle" ]]; then
    mkdir -m 0700 -- "$cleanup_bundle"
    unzip -q "$cleanup_work/ffb-server.zip" -d "$cleanup_bundle"
    touch "$cleanup_bundle/.complete"
  fi
  [[ -d "$cleanup_bundle" && ! -L "$cleanup_bundle" && -f "$cleanup_bundle/.complete"
    && -f "$cleanup_bundle/FantasyFootballServer.jar" ]] || {
    fail 'Cleanup package extraction incomplete; inspect retained directory before retrying.'; return 2;
  }
  cleanup_plan="$cleanup_work/plan.json"
}

run_cleanup() {
  (cd -- "$cleanup_bundle" && "$cleanup_java" -cp 'FantasyFootballServer.jar:lib/*' \
    com.fumbbl.ffb.server.team.ObsoleteSavedTeamCleanupMain "$@")
}

backup_saved_teams() {
  local backup="$cleanup_work/saved-teams-$(date -u +%Y%m%dT%H%M%SZ)-$$.sql"
  # Existing MariaDB root socket authentication: no password in argv or output.
  mariadb-dump --protocol=socket --user=root --single-transaction --skip-lock-tables \
    "$cleanup_database" ffb_v2_saved_teams ffb_saved_teams > "$backup"
  [[ -s "$backup" ]] || { fail 'Saved-team backup is empty; apply was not run.'; return 2; }
  sha256sum -- "$backup" > "$backup.sha256"
  printf 'Private saved-team backup retained: %s\n' "$backup"
}

main() {
  [[ $# == 4 || $# == 5 ]] || { fail 'Usage: helper dev|prod inventory|plan|apply ARCHIVE ARCHIVE_SHA256 [PLAN_SHA256]'; return 2; }
  local environment=$1 mode=$2 archive=$3 archive_digest=$4 plan_digest=${5:-}
  [[ "$archive_digest" =~ ^[0-9a-f]{64}$ ]] || { fail 'Invalid archive digest.'; return 2; }
  case "$mode" in
    inventory|plan) [[ $# == 4 ]] || { fail 'Unexpected plan digest.'; return 2; } ;;
    apply) [[ $# == 5 && "$plan_digest" =~ ^[0-9a-f]{64}$ ]] || { fail 'Apply requires the reviewed plan digest.'; return 2; } ;;
    *) fail 'Mode must be inventory, plan or apply.'; return 2 ;;
  esac
  select_environment "$environment"
  verify_host
  bind_database
  if [[ "$mode" == apply ]]; then assert_writers_stopped; fi
  prepare_bundle "$archive" "$archive_digest"
  printf 'Target: %s / %s / moles-game / us-central1-a\n' "$environment" "$cleanup_project"
  if [[ "$mode" == plan && ( -e "$cleanup_plan" || -L "$cleanup_plan" ) ]]; then
    [[ -f "$cleanup_plan" && ! -L "$cleanup_plan" ]] || {
      fail 'CLEANUP_FAILED PLAN_PATH_UNSAFE: existing plan path is not a regular file.'; return 2;
    }
    # CREATE_NEW in the Java operator intentionally refuses to replace a plan.
    # Report that condition explicitly, keeping current counts separate from
    # the retained plan's digest (its inventory snapshot can be older).
    run_cleanup inventory "$environment"
    printf 'existingPlanSha256=%s\n' "$(sha256sum -- "$cleanup_plan" | cut -d ' ' -f 1)"
    fail 'CLEANUP_FAILED PLAN_ALREADY_EXISTS: retained unchanged; use inventory for current counts or apply the previously reviewed plan.'
    return 2
  fi
  if [[ "$mode" == apply ]]; then
    [[ -f "$cleanup_plan" && ! -L "$cleanup_plan"
      && $(sha256sum -- "$cleanup_plan" | cut -d ' ' -f 1) == "$plan_digest" ]] || {
      fail 'Plan is missing or its digest differs; run plan for this exact package first.'; return 2;
    }
    # Read-only classifier/schema preflight before creating the backup or applying.
    run_cleanup inventory "$environment"
    backup_saved_teams
    run_cleanup apply "$environment" "$cleanup_plan" "$plan_digest"
  elif [[ "$mode" == plan ]]; then
    run_cleanup plan "$environment" "$cleanup_plan"
    printf 'Plan remains private on the VM: %s\n' "$cleanup_plan"
  else
    run_cleanup inventory "$environment"
  fi
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
