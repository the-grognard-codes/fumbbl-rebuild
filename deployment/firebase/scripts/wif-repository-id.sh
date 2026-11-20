# Shared Google Cloud Workload Identity configuration for Firebase deployers.
readonly WIF_REPOSITORY_ID=1359398730
readonly WIF_OWNER_ID=317211933
readonly WIF_PROVIDER=github-actions
readonly WIF_ISSUER=https://token.actions.githubusercontent.com
readonly WIF_ACCOUNT_ID=firebase-hosting-deployer
readonly WIF_ACCOUNT="$WIF_ACCOUNT_ID@$WIF_PROJECT.iam.gserviceaccount.com"
readonly WIF_ROLE=roles/iam.workloadIdentityUser
readonly WIF_HOSTING_ROLE=roles/firebasehosting.admin
readonly WIF_NAME_CONDITION="assertion.repository=='the-grognard-codes/fumbbl-rebuild' && $WIF_RESTRICTIONS"
readonly WIF_ID_CONDITION="assertion.repository_id=='$WIF_REPOSITORY_ID' && assertion.repository_owner_id=='$WIF_OWNER_ID' && $WIF_RESTRICTIONS"
readonly WIF_ID_MAPPING='{"attribute.repository_id":"assertion.repository_id","attribute.repository_owner_id":"assertion.repository_owner_id"}'
readonly -a WIF_POOL_ARGS=(--project="$WIF_PROJECT" --location=global)
readonly -a WIF_PROVIDER_ARGS=("${WIF_POOL_ARGS[@]}" --workload-identity-pool="$WIF_POOL")

wif_has_binding() {
  jq -er --arg role "$1" --arg member "$2" '
    select(type == "object" and ((.bindings // []) | type == "array"))
    | any(.bindings[]?; .role == $role and .condition == null and any(.members[]?; . == $member))
    | tostring'
}

wif_write_provider() (
  local operation=$1 mapping=$2 flags_file
  shift 2
  flags_file=$(mktemp)
  trap 'rm -f -- "$flags_file"' EXIT
  jq -n --argjson mapping "$mapping" --arg condition "$WIF_ID_CONDITION" \
    '{"--attribute-mapping": $mapping, "--attribute-condition": $condition}' > "$flags_file"
  gcloud iam workload-identity-pools providers "$operation" "$WIF_PROVIDER" \
    "${WIF_PROVIDER_ARGS[@]}" --flags-file="$flags_file" --quiet "$@"
)

wif_wait_for_account() {
  local attempt
  for attempt in {1..12}; do
    if gcloud iam service-accounts describe "$WIF_ACCOUNT" --project="$WIF_PROJECT" > /dev/null 2>&1; then
      return
    fi
    sleep 5
  done
  echo "Service account $WIF_ACCOUNT did not become visible within 60 seconds." >&2
  return 1
}

wif_run() {
  if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --check ) ]]; then
    echo "Usage: $0 [--check]" >&2
    return 2
  fi
  command -v gcloud >/dev/null || { echo 'gcloud is required.' >&2; return 1; }
  command -v jq >/dev/null || { echo 'jq is required.' >&2; return 1; }

  local project_number pool_name provider_name principal
  project_number=$(gcloud projects describe "$WIF_PROJECT" --format='value(projectNumber)')
  [[ "$project_number" =~ ^[0-9]+$ ]] || { echo "Could not resolve the $WIF_ENVIRONMENT project number." >&2; return 1; }
  pool_name="projects/$project_number/locations/global/workloadIdentityPools/$WIF_POOL"
  provider_name="$pool_name/providers/$WIF_PROVIDER"
  principal="principalSet://iam.googleapis.com/$pool_name/attribute.repository_id/$WIF_REPOSITORY_ID"

  local pool_exists=true provider_exists=false account_exists=true hosting_binding=true
  if [[ "$WIF_ENVIRONMENT" == PROD ]]; then
    pool_exists=$(gcloud iam workload-identity-pools list "${WIF_POOL_ARGS[@]}" --format=json \
      | jq -er --arg name "$pool_name" 'select(type == "array") | any(.[]; .name == $name) | tostring')
  fi
  if [[ "$pool_exists" == true ]]; then
    local providers
    providers=$(gcloud iam workload-identity-pools providers list "${WIF_PROVIDER_ARGS[@]}" --format=json)
    # The IAM principal set applies to the entire pool, independent of the issuer.
    if ! jq -e --arg name "$provider_name" 'type == "array" and all(.[]; .name == $name)' \
      <<< "$providers" >/dev/null; then
      echo "Unexpected provider in $pool_name. Review all providers before granting access to this pool." >&2
      return 1
    fi
    provider_exists=$(jq -r 'length > 0' <<< "$providers")
  fi
  if [[ "$provider_exists" == false && "$WIF_ENVIRONMENT" == DEV ]]; then
    echo "Could not find the existing DEV provider at $provider_name." >&2
    return 1
  fi

  local provider current_condition current_mapping target_mapping provider_change binding_exists=false
  if [[ "$provider_exists" == true ]]; then
    provider=$(gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
      "${WIF_PROVIDER_ARGS[@]}" --format=json)
    current_condition=$(jq -r '.attributeCondition // ""' <<< "$provider")
    if [[ "$current_condition" != "$WIF_NAME_CONDITION" && "$current_condition" != "$WIF_ID_CONDITION" ]]; then
      printf 'Unexpected condition on %s. Review it before changing repository trust.\nCurrent condition: %s\n' \
        "$provider_name" "$current_condition" >&2
      return 1
    fi
    if ! jq -e --arg issuer "$WIF_ISSUER" \
      '.disabled != true and (.oidc.issuerUri == $issuer or .oidc.issuerUri == ($issuer + "/"))' \
      <<< "$provider" >/dev/null; then
      echo "Expected an enabled GitHub OIDC provider at $provider_name. Review the provider before continuing." >&2
      return 1
    fi
    if ! current_mapping=$(jq -ecS '.attributeMapping | select(type == "object" and has("google.subject"))' <<< "$provider"); then
      echo "Missing the expected attribute map on $provider_name." >&2
      return 1
    fi
    if ! jq -e --argjson expected "$WIF_ID_MAPPING" \
      '. as $mapping | all($expected | to_entries[]; . as $entry | $mapping[$entry.key] == $entry.value or ($mapping | has($entry.key) | not))' \
      <<< "$current_mapping" >/dev/null; then
      echo "Conflicting repository ID mapping on $provider_name. Review it before changing repository trust." >&2
      return 1
    fi
    target_mapping=$(jq -cS --argjson expected "$WIF_ID_MAPPING" '. + $expected' <<< "$current_mapping")
    provider_change=none
    if [[ "$current_condition" != "$WIF_ID_CONDITION" || "$current_mapping" != "$target_mapping" ]]; then
      provider_change=update-oidc
    fi
  else
    current_condition='(provider absent)'
    current_mapping='{}'
    target_mapping=$(jq -cS --argjson expected "$WIF_ID_MAPPING" '. + $expected' <<< "$WIF_DEFAULT_MAPPING")
    provider_change=create-oidc
  fi

  if [[ "$WIF_ENVIRONMENT" == PROD ]]; then
    account_exists=$(gcloud iam service-accounts list --project="$WIF_PROJECT" --format=json \
      | jq -er --arg email "$WIF_ACCOUNT" 'select(type == "array") | any(.[]; .email == $email) | tostring')
    hosting_binding=$(gcloud projects get-iam-policy "$WIF_PROJECT" --format=json \
      | wif_has_binding "$WIF_HOSTING_ROLE" "serviceAccount:$WIF_ACCOUNT")
  else
    gcloud iam service-accounts describe "$WIF_ACCOUNT" --project="$WIF_PROJECT" --format='value(email)' >/dev/null
  fi
  if [[ "$account_exists" == true ]]; then
    binding_exists=$(gcloud iam service-accounts get-iam-policy "$WIF_ACCOUNT" --project="$WIF_PROJECT" --format=json \
      | wif_has_binding "$WIF_ROLE" "$principal")
  fi

  printf 'Provider: %s\nCurrent condition: %s\nTarget condition: %s\n' \
    "$provider_name" "$current_condition" "$WIF_ID_CONDITION"
  printf 'Current mapping: %s\nTarget mapping: %s\nProvider change: %s\n' \
    "$current_mapping" "$target_mapping" "$provider_change"
  printf 'Deploy account: %s (exists: %s)\nID principal: %s (%s already granted: %s)\n' \
    "$WIF_ACCOUNT" "$account_exists" "$principal" "$WIF_ROLE" "$binding_exists"
  if [[ "$provider_change" == create-oidc ]]; then
    printf 'Provisioning pool: %s (exists: %s)\n' "$pool_name" "$pool_exists"
  fi
  if [[ "$WIF_ENVIRONMENT" == PROD ]]; then
    printf 'Project role: %s (already granted: %s)\n' "$WIF_HOSTING_ROLE" "$hosting_binding"
  fi
  if [[ "${1:-}" == --check ]]; then
    printf 'GCP_WORKLOAD_IDENTITY_PROVIDER=%s\nGCP_DEPLOY_SERVICE_ACCOUNT=%s\n' "$provider_name" "$WIF_ACCOUNT"
    return
  fi

  if [[ "$pool_exists" == false ]]; then
    gcloud iam workload-identity-pools create "$WIF_POOL" "${WIF_POOL_ARGS[@]}" \
      --display-name='GitHub Actions PROD' --quiet
  fi
  if [[ "$account_exists" == false ]]; then
    gcloud iam service-accounts create "$WIF_ACCOUNT_ID" --project="$WIF_PROJECT" \
      --display-name='GitHub PROD Firebase Hosting deployer' --quiet
    wif_wait_for_account
  fi
  if [[ "$hosting_binding" == false ]]; then
    gcloud projects add-iam-policy-binding "$WIF_PROJECT" --member="serviceAccount:$WIF_ACCOUNT" \
      --role="$WIF_HOSTING_ROLE" --condition=None --quiet
  fi
  if [[ "$binding_exists" == false ]]; then
    gcloud iam service-accounts add-iam-policy-binding "$WIF_ACCOUNT" --project="$WIF_PROJECT" \
      --member="$principal" --role="$WIF_ROLE" --condition=None --quiet
  fi
  case "$provider_change" in
    create-oidc) wif_write_provider create-oidc "$target_mapping" \
      --display-name='GitHub Actions PROD provider' --issuer-uri="$WIF_ISSUER/" ;;
    update-oidc) wif_write_provider update-oidc "$target_mapping" ;;
  esac
  printf 'GCP_WORKLOAD_IDENTITY_PROVIDER=%s\nGCP_DEPLOY_SERVICE_ACCOUNT=%s\n' "$provider_name" "$WIF_ACCOUNT"
}
