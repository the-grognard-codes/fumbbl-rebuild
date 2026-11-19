#!/usr/bin/env bash
set -euo pipefail

readonly WIF_ENVIRONMENT=DEV
readonly WIF_PROJECT=dev-moles-under-the-pitch-org
readonly WIF_POOL=github-dev
readonly WIF_RESTRICTIONS="assertion.ref=='refs/heads/main' && assertion.environment=='development'"
source "$(dirname -- "${BASH_SOURCE[0]}")/wif-repository-id.sh"
wif_run "$@"
