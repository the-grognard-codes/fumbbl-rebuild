#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "$BASH_SOURCE")" && pwd)
case "${1:-}" in
  dev)
    script=migrate-dev-wif-repository-id.sh
    export PROJECT=dev-moles-under-the-pitch-org PROJECT_NUMBER=589432788264 POOL=github-dev
    restrictions="assertion.ref=='refs/heads/main' && assertion.environment=='development'"
    ;;
  prod)
    script=provision-prod-wif.sh
    export PROJECT=molesunderthepitch-dotorg PROJECT_NUMBER=123456789012 POOL=github-prod
    restrictions="assertion.environment=='production' && assertion.workflow=='Deploy Firebase Hosting (PROD)' && (assertion.ref=='refs/heads/main' || assertion.ref.matches('^refs/tags/moles-v[0-9A-Za-z][0-9A-Za-z._-]*$'))"
    ;;
  *) echo "Usage: $0 dev|prod" >&2; exit 2 ;;
esac

test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT
export MOCK_LOG="$test_dir/calls" MOCK_FLAGS="$test_dir/flags.json"
export POOL_NAME="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL"
export PRINCIPAL="principalSet://iam.googleapis.com/$POOL_NAME/attribute.repository_id/1359398730"
export LEGACY_PRINCIPAL="principalSet://iam.googleapis.com/$POOL_NAME/attribute.repository/the-grognard-codes/fumbbl-rebuild"
export PATH="$test_dir:$PATH"
old_condition="assertion.repository=='the-grognard-codes/fumbbl-rebuild' && $restrictions"
new_condition="assertion.repository_id=='1359398730' && assertion.repository_owner_id=='317211933' && $restrictions"
old_map='{"google.subject":"assertion.sub","attribute.repository":"assertion.repository","attribute.custom":"assertion.ref.extract(\"{branch},suffix\") + \"a|b=c\""}'
ids='{"attribute.repository_id":"assertion.repository_id","attribute.repository_owner_id":"assertion.repository_owner_id"}'
new_map=$(jq -cn --argjson old "$old_map" --argjson ids "$ids" '$old + $ids')

cat > "$test_dir/gcloud" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
account="firebase-hosting-deployer@$PROJECT.iam.gserviceaccount.com"
log_write() { printf '%s\n' "$*" >> "$MOCK_LOG"; }
case "$1 $2 $3" in
  "projects describe $PROJECT") printf '%s\n' "$PROJECT_NUMBER" ;;
  "projects get-iam-policy $PROJECT")
    if [[ "$MOCK_HOSTING_GRANTED" == true && "$MOCK_FRESH" == false ]]; then
      jq -cn --arg account "serviceAccount:$account" '{bindings:[{role:"roles/firebasehosting.admin", members:[$account]}]}'
    else
      echo '{"bindings":[]}'
    fi
    ;;
  "projects add-iam-policy-binding $PROJECT") log_write "$@" ;;
  "iam workload-identity-pools list")
    [[ "$MOCK_DISCOVERY_FAIL" == false ]] || exit 1
    if [[ "$MOCK_FRESH" == true ]]; then
      echo '[]'
    else
      jq -cn --arg name "$POOL_NAME" '[{name:$name}]'
    fi
    ;;
  "iam workload-identity-pools create") log_write "$@" ;;
  "iam workload-identity-pools providers")
    case "$4" in
      list)
        jq -cn --arg pool "$POOL_NAME" --arg sibling "$MOCK_SIBLING" '
          [{name:($pool + "/providers/github-actions")}]
          + if $sibling == "true" then [{name:($pool + "/providers/another-issuer")}] else [] end'
        ;;
      describe)
        jq -cn --arg condition "$MOCK_CONDITION" --argjson map "$MOCK_MAPPING" \
          '{attributeCondition:$condition, attributeMapping:$map, oidc:{issuerUri:"https://token.actions.githubusercontent.com/"}}'
        ;;
      update-oidc|create-oidc)
        log_write "$@"
        for arg in "$@"; do
          if [[ "$arg" == --flags-file=* ]]; then
            cp -- "${arg#*=}" "$MOCK_FLAGS"
          fi
        done
        [[ -s "$MOCK_FLAGS" ]]
        ;;
      *) exit 2 ;;
    esac
    ;;
  "iam service-accounts list")
    if [[ "$MOCK_FRESH" == true || "$MOCK_ACCOUNT_EXISTS" == false ]]; then
      echo '[]'
    else
      jq -cn --arg account "$account" '[{email:$account}]'
    fi
    ;;
  "iam service-accounts describe") printf '%s\n' "$account" ;;
  "iam service-accounts get-iam-policy")
    jq -cn --arg member "$PRINCIPAL" --arg legacy "$LEGACY_PRINCIPAL" --arg mode "$MOCK_BINDING" '
      {bindings: [
        {role:"roles/iam.workloadIdentityUser",members:[$legacy]},
        (if $mode == "present" then {role:"roles/iam.workloadIdentityUser",members:[$member]}
         else {role:"roles/iam.workloadIdentityUser",members:[$member],condition:{expression:"false"}} end)
      ]}'
    ;;
  "iam service-accounts add-iam-policy-binding"|"iam service-accounts create") log_write "$@" ;;
  *) echo "Unexpected mock gcloud command: $*" >&2; exit 2 ;;
esac
MOCK
chmod +x "$test_dir/gcloud"

run_script() {
  : > "$MOCK_LOG"
  : > "$MOCK_FLAGS"
  bash "$script_dir/$script" "$@" > "$test_dir/output" 2>&1 || {
    cat "$test_dir/output" >&2
    return 1
  }
}

expect_failure() {
  if run_script; then
    echo "Expected $script to reject this state" >&2
    exit 1
  fi
  assert_no_writes
}

assert_no_writes() {
  if [[ -s "$MOCK_LOG" ]]; then
    echo 'Unexpected gcloud mutations:' >&2
    cat "$MOCK_LOG" >&2
    exit 1
  fi
}

assert_provider_flags() {
  jq -e --arg condition "$new_condition" --argjson mapping "$1" \
    '.["--attribute-condition"] == $condition and .["--attribute-mapping"] == $mapping' "$MOCK_FLAGS" >/dev/null
}

export MOCK_CONDITION="$old_condition" MOCK_MAPPING="$old_map" MOCK_BINDING=missing
export MOCK_FRESH=false MOCK_DISCOVERY_FAIL=false
export MOCK_SIBLING=false MOCK_ACCOUNT_EXISTS=true MOCK_HOSTING_GRANTED=true

run_script --check
assert_no_writes
grep -Fq "Provider: $POOL_NAME/providers/github-actions" "$test_dir/output"
grep -Fq "Current condition: $old_condition" "$test_dir/output"
grep -Fq "Target condition: $new_condition" "$test_dir/output"
grep -Fq 'Target mapping:' "$test_dir/output"
grep -Fq "ID principal: $PRINCIPAL" "$test_dir/output"

run_script
mapfile -t writes < "$MOCK_LOG"
[[ ${#writes[@]} -eq 2 ]]
[[ "${writes[0]}" == "iam service-accounts add-iam-policy-binding "* && "${writes[0]}" == *"--member=$PRINCIPAL --role=roles/iam.workloadIdentityUser --condition=None"* ]]
[[ "${writes[1]}" == "iam workload-identity-pools providers update-oidc github-actions "* ]]
assert_provider_flags "$new_map"

export MOCK_CONDITION="$new_condition" MOCK_MAPPING="$new_map" MOCK_BINDING=present
run_script
assert_no_writes

export MOCK_MAPPING=$(jq -c 'del(.["attribute.repository_owner_id"])' <<< "$new_map")
run_script
[[ $(wc -l < "$MOCK_LOG") -eq 1 ]]
grep -Fq 'providers update-oidc' "$MOCK_LOG"
assert_provider_flags "$new_map"

export MOCK_MAPPING="$new_map" MOCK_BINDING=missing
run_script
[[ $(wc -l < "$MOCK_LOG") -eq 1 ]]
grep -Fq -- "--member=$PRINCIPAL" "$MOCK_LOG"

export MOCK_MAPPING=$(jq -c '.["attribute.repository_id"] = "assertion.repository"' <<< "$old_map")
expect_failure
grep -Fq 'Conflicting repository ID mapping' "$test_dir/output"

export MOCK_SIBLING=true MOCK_CONDITION="$old_condition" MOCK_MAPPING="$old_map"
expect_failure
grep -Fq 'Unexpected provider' "$test_dir/output"
export MOCK_SIBLING=false

export MOCK_CONDITION="$old_condition && assertion.workflow=='Unexpected workflow'" MOCK_MAPPING="$old_map"
expect_failure
grep -Fq 'Unexpected condition' "$test_dir/output"

if [[ "$POOL" == github-prod ]]; then
  export MOCK_CONDITION="$new_condition" MOCK_MAPPING="$new_map" MOCK_BINDING=present MOCK_HOSTING_GRANTED=false
  run_script
  [[ $(wc -l < "$MOCK_LOG") -eq 1 ]]
  grep -Fq -- '--role=roles/firebasehosting.admin' "$MOCK_LOG"

  export MOCK_ACCOUNT_EXISTS=false
  run_script
  mapfile -t writes < "$MOCK_LOG"
  [[ ${#writes[@]} -eq 3 ]]
  [[ "${writes[0]}" == "iam service-accounts create "* ]]
  [[ "${writes[1]}" == "projects add-iam-policy-binding "* ]]
  [[ "${writes[2]}" == "iam service-accounts add-iam-policy-binding "* ]]

  export MOCK_DISCOVERY_FAIL=true
  expect_failure
  export MOCK_DISCOVERY_FAIL=false MOCK_FRESH=true
  run_script --check
  assert_no_writes
  grep -Fq 'Provider change: create-oidc' "$test_dir/output"
  run_script
  mapfile -t writes < "$MOCK_LOG"
  [[ ${#writes[@]} -eq 5 ]]
  [[ "${writes[0]}" == "iam workload-identity-pools create github-prod "* ]]
  [[ "${writes[1]}" == "iam service-accounts create firebase-hosting-deployer "* ]]
  [[ "${writes[2]}" == "projects add-iam-policy-binding "* && "${writes[2]}" == *"--role=roles/firebasehosting.admin "* ]]
  [[ "${writes[3]}" == "iam service-accounts add-iam-policy-binding "* && "${writes[3]}" == *"--member=$PRINCIPAL "* ]]
  [[ "${writes[4]}" == "iam workload-identity-pools providers create-oidc github-actions "* ]]
  default_map='{"google.subject":"assertion.sub","attribute.repository":"assertion.repository","attribute.environment":"assertion.environment","attribute.workflow":"assertion.workflow","attribute.ref":"assertion.ref"}'
  assert_provider_flags "$(jq -cn --argjson base "$default_map" --argjson ids "$ids" '$base + $ids')"
fi

echo "$POOL repository ID migration checks passed."
