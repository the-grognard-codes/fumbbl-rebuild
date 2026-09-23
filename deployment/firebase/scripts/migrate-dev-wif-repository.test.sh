#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT

cat > "$test_dir/gcloud" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$MOCK_LOG"
case "$1 $2 $3" in
  'projects describe dev-moles-under-the-pitch-org') printf '589432788264\n' ;;
  'iam service-accounts describe') printf '%s\n' 'firebase-hosting-deployer@dev-moles-under-the-pitch-org.iam.gserviceaccount.com' ;;
  'iam workload-identity-pools providers')
    case "$4" in
      describe) printf '%s\n' "$MOCK_CONDITION" ;;
      update-oidc) ;;
      *) exit 2 ;;
    esac
    ;;
  'iam service-accounts add-iam-policy-binding') ;;
  *) echo "Unexpected mock gcloud command: $*" >&2; exit 2 ;;
esac
MOCK
chmod +x "$test_dir/gcloud"

export PATH="$test_dir:$PATH"
export MOCK_LOG="$test_dir/calls"
legacy="assertion.repository=='the-grognard-codes/fumbbl-rebuild-chatgpt'"
renamed="assertion.repository=='the-grognard-codes/fumbbl-rebuild'"
restrictions=" && assertion.ref=='refs/heads/main' && assertion.environment=='development'"

export MOCK_CONDITION="$legacy$restrictions"
: > "$MOCK_LOG"
bash "$script_dir/migrate-dev-wif-repository.sh" --check > /dev/null
! grep -Eq 'update-oidc|add-iam-policy-binding' "$MOCK_LOG"

: > "$MOCK_LOG"
bash "$script_dir/migrate-dev-wif-repository.sh" > /dev/null
grep -Fq -- "--attribute-condition=$renamed$restrictions" "$MOCK_LOG"
grep -Fq 'attribute.repository/the-grognard-codes/fumbbl-rebuild' "$MOCK_LOG"

export MOCK_CONDITION="$renamed$restrictions"
: > "$MOCK_LOG"
bash "$script_dir/migrate-dev-wif-repository.sh" > /dev/null
! grep -q 'update-oidc' "$MOCK_LOG"
grep -q 'add-iam-policy-binding' "$MOCK_LOG"

export MOCK_CONDITION="$legacy$restrictions && assertion.workflow=='Unexpected workflow'"
: > "$MOCK_LOG"
if bash "$script_dir/migrate-dev-wif-repository.sh" > /dev/null 2>&1; then
  echo 'Expected an unsafe condition to be rejected.' >&2
  exit 1
fi
! grep -Eq 'update-oidc|add-iam-policy-binding' "$MOCK_LOG"

echo 'DEV WIF repository migration checks passed.'
