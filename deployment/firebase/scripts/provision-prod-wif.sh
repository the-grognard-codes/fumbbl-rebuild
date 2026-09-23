#!/usr/bin/env bash
#
# One-time Google Cloud setup for the production Firebase Hosting deployment.
# Run from Cloud Shell as a project administrator; this script creates cloud
# resources and IAM bindings but never creates or downloads a service-account key.

set -euo pipefail

readonly PROJECT_ID="molesunderthepitch-dotorg"
readonly REPOSITORY="the-grognard-codes/fumbbl-rebuild"
readonly LEGACY_REPOSITORY="the-grognard-codes/fumbbl-rebuild-chatgpt"
readonly POOL_ID="github-prod"
readonly PROVIDER_ID="github-actions"
readonly SERVICE_ACCOUNT_ID="firebase-hosting-deployer"
readonly SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
readonly PROVIDER_CONDITION="assertion.repository=='${REPOSITORY}' && assertion.environment=='production' && assertion.workflow=='Deploy Firebase Hosting (PROD)' && (assertion.ref=='refs/heads/main' || assertion.ref.matches('^refs/tags/moles-v[0-9A-Za-z][0-9A-Za-z._-]*$'))"
readonly LEGACY_PROVIDER_CONDITION="assertion.repository=='${LEGACY_REPOSITORY}' && assertion.environment=='production' && assertion.workflow=='Deploy Firebase Hosting (PROD)' && (assertion.ref=='refs/heads/main' || assertion.ref.matches('^refs/tags/moles-v[0-9A-Za-z][0-9A-Za-z._-]*$'))"
readonly ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment,attribute.workflow=assertion.workflow,attribute.ref=assertion.ref"

require_command() {
  command -v "$1" > /dev/null || {
    echo "Required command is unavailable: $1" >&2
    exit 1
  }
}

require_command gcloud

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

wait_for_service_account() {
  local attempt
  for attempt in {1..12}; do
    if gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project="$PROJECT_ID" > /dev/null 2>&1; then
      return
    fi
    sleep 5
  done
  echo "Service account ${SERVICE_ACCOUNT_EMAIL} did not become visible within 60 seconds." >&2
  exit 1
}

if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project="$PROJECT_ID" > /dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_ID" \
    --project="$PROJECT_ID" \
    --display-name="GitHub PROD Firebase Hosting deployer"
fi

wait_for_service_account

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/firebasehosting.admin" \
  --condition=None \
  --quiet

if ! gcloud iam workload-identity-pools describe "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location=global > /dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --display-name="GitHub Actions PROD"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" > /dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub Actions PROD provider" \
    --issuer-uri="https://token.actions.githubusercontent.com/" \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$PROVIDER_CONDITION"
else
  CURRENT_PROVIDER_CONDITION="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --format='value(attributeCondition)')"
  if [[ "$CURRENT_PROVIDER_CONDITION" == "$LEGACY_PROVIDER_CONDITION" ]]; then
    gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
      --project="$PROJECT_ID" \
      --location=global \
      --workload-identity-pool="$POOL_ID" \
      --attribute-condition="$PROVIDER_CONDITION"
  elif [[ "$CURRENT_PROVIDER_CONDITION" != "$PROVIDER_CONDITION" ]]; then
    echo "Existing Workload Identity provider has an unexpected attribute condition; review it before changing repository trust." >&2
    exit 1
  fi
fi

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPOSITORY}" \
  --condition=None \
  --quiet

PROVIDER_NAME="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --format='value(name)')"

cat <<EOF

Production WIF setup complete. Set these GitHub environment variables in the
production environment (not the development environment):

GCP_WORKLOAD_IDENTITY_PROVIDER=${PROVIDER_NAME}
GCP_DEPLOY_SERVICE_ACCOUNT=${SERVICE_ACCOUNT_EMAIL}

The public production Firebase Web configuration is versioned in
deployment/firebase/scripts/environment.mjs. Do not create or upload a
service-account JSON key.
EOF
