#!/usr/bin/env bash
# Update the existing DEV Workload Identity provider after the GitHub repository rename.
# Run from Cloud Shell with an account authorized on the DEV Google Cloud project.

set -euo pipefail

if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --check ) ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi
readonly CHECK_ONLY="${1:-}"
readonly PROJECT_ID="dev-moles-under-the-pitch-org"
readonly REPOSITORY="the-grognard-codes/fumbbl-rebuild"
readonly LEGACY_REPOSITORY="the-grognard-codes/fumbbl-rebuild-chatgpt"
readonly POOL_ID="github-dev"
readonly PROVIDER_ID="github-actions"
readonly SERVICE_ACCOUNT_EMAIL="firebase-hosting-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
readonly LEGACY_CONDITION="assertion.repository=='${LEGACY_REPOSITORY}' && assertion.ref=='refs/heads/main' && assertion.environment=='development'"
readonly PROVIDER_CONDITION="assertion.repository=='${REPOSITORY}' && assertion.ref=='refs/heads/main' && assertion.environment=='development'"

command -v gcloud >/dev/null || { echo 'gcloud is required.' >&2; exit 1; }

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
[[ "$PROJECT_NUMBER" =~ ^[0-9]+$ ]] || { echo 'Could not resolve the DEV project number.' >&2; exit 1; }

gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" \
  --project="$PROJECT_ID" --format='value(email)' >/dev/null

CURRENT_CONDITION="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --format='value(attributeCondition)')"

if [[ "$CURRENT_CONDITION" == "$LEGACY_CONDITION" ]]; then
  ACTION='update the legacy repository condition'
elif [[ "$CURRENT_CONDITION" == "$PROVIDER_CONDITION" ]]; then
  ACTION='provider already trusts the renamed repository'
else
  echo "DEV provider condition differs from the reviewed legacy and new conditions: $CURRENT_CONDITION" >&2
  exit 1
fi

PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPOSITORY}"

if [[ "$CHECK_ONLY" == --check ]]; then
  printf 'DEV project: %s (%s)\n' "$PROJECT_ID" "$PROJECT_NUMBER"
  printf 'Plan: %s; grant roles/iam.workloadIdentityUser to %s on %s\n' \
    "$ACTION" "$PRINCIPAL" "$SERVICE_ACCOUNT_EMAIL"
  exit 0
fi

if [[ "$PROVIDER_CONDITION" != "$CURRENT_CONDITION" ]]; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --attribute-condition="$PROVIDER_CONDITION"
fi

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT_EMAIL" \
  --project="$PROJECT_ID" \
  --role='roles/iam.workloadIdentityUser' \
  --member="$PRINCIPAL" \
  --condition=None \
  --quiet

cat <<EOF

DEV repository trust updated. These existing GitHub development environment
variables should remain set:

GCP_WORKLOAD_IDENTITY_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}
GCP_DEPLOY_SERVICE_ACCOUNT=${SERVICE_ACCOUNT_EMAIL}

After a successful DEV deployment, remove the old repository principal from
the DEV deploy service account.
EOF
