#!/usr/bin/env bash
set -euo pipefail
environment=${1:?Usage: activate.sh dev|prod certificate-contact-email}
contact=${2:?Provide the certificate expiry contact email}
case "$environment" in
  dev) project=dev-moles-under-the-pitch-org; domain=game-dev.molesunderthepitch.org ;;
  prod) project=molesunderthepitch-dotorg; domain=game.molesunderthepitch.org ;;
  *) echo 'Environment must be dev or prod.' >&2; exit 1 ;;
esac
[[ "$contact" =~ ^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+$ ]] || { echo 'Invalid contact email.' >&2; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repository=$(cd "$script_dir/../.." && pwd)
jar="$repository/game-service/target/game-service.jar"
[[ -f "$jar" ]] || { echo 'Build game-service first: mvn -f game-service/pom.xml clean verify' >&2; exit 1; }
address=$(gcloud compute addresses describe moles-game --region=us-central1 --project="$project" --format='value(address)')
resolved=$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u)
[[ "$resolved" == "$address" ]] || { echo "DNS must resolve $domain to $address before activation." >&2; exit 1; }
gcloud compute scp "$jar" "$script_dir/install-host.sh" "moles-game:~/" --zone=us-central1-a --project="$project" --tunnel-through-iap
gcloud compute ssh moles-game --zone=us-central1-a --project="$project" --tunnel-through-iap \
  --command="sudo bash ./install-host.sh '$environment' '$contact'"
printf '\nService installed: wss://%s/session/v1\n' "$domain"
