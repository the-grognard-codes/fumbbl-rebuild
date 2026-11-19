#!/usr/bin/env bash
set -euo pipefail

readonly WIF_ENVIRONMENT=PROD
readonly WIF_PROJECT=molesunderthepitch-dotorg
readonly WIF_POOL=github-prod
readonly WIF_RESTRICTIONS="assertion.environment=='production' && assertion.workflow=='Deploy Firebase Hosting (PROD)' && (assertion.ref=='refs/heads/main' || assertion.ref.matches('^refs/tags/moles-v[0-9A-Za-z][0-9A-Za-z._-]*$'))"
readonly WIF_DEFAULT_MAPPING='{"google.subject":"assertion.sub","attribute.repository":"assertion.repository","attribute.environment":"assertion.environment","attribute.workflow":"assertion.workflow","attribute.ref":"assertion.ref"}'
source "$(dirname -- "$BASH_SOURCE")/wif-repository-id.sh"
wif_run "$@"
