#!/usr/bin/env bash
# Run with an authenticated Google Cloud CLI. No keys are downloaded.
set -euo pipefail
environment=${1:?Usage: provision.sh dev|prod}
case "$environment" in
  dev) project=dev-moles-under-the-pitch-org; domain=game-dev.molesunderthepitch.org ;;
  prod) project=molesunderthepitch-dotorg; domain=game.molesunderthepitch.org ;;
  *) echo 'Environment must be dev or prod.' >&2; exit 1 ;;
esac
region=us-central1
zone=us-central1-a
name=moles-game
account="game-session@$project.iam.gserviceaccount.com"
gcloud services enable compute.googleapis.com iam.googleapis.com identitytoolkit.googleapis.com --project="$project"
if ! gcloud iam service-accounts describe "$account" --project="$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create game-session --display-name='Isolated game session service' --project="$project"
fi
# verifyIdToken(..., true) checks Firebase revocation/disabled users.
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:$account" --role=roles/firebaseauth.viewer --condition=None >/dev/null
if ! gcloud compute addresses describe "$name" --region="$region" --project="$project" >/dev/null 2>&1; then
  gcloud compute addresses create "$name" --region="$region" --project="$project"
fi
address=$(gcloud compute addresses describe "$name" --region="$region" --project="$project" --format='value(address)')
if ! gcloud compute disks describe "$name-data" --zone="$zone" --project="$project" >/dev/null 2>&1; then
  gcloud compute disks create "$name-data" --size=10GB --type=pd-balanced --zone="$zone" --project="$project"
fi
if ! gcloud compute firewall-rules describe "$name-wss" --project="$project" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "$name-wss" --network=default --allow=tcp:443,tcp:80 --source-ranges=0.0.0.0/0 --target-tags=moles-game --priority=1000 --project="$project"
fi
if ! gcloud compute firewall-rules describe "$name-iap" --project="$project" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "$name-iap" --network=default --allow=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=moles-game --priority=1000 --project="$project"
fi
# Firewall evaluation uses priority, not a sequential ACL. This target-scoped
# rule overrides broad default-network allows (including default-allow-ssh).
if ! gcloud compute firewall-rules describe "$name-deny-ingress" --project="$project" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "$name-deny-ingress" --network=default --direction=INGRESS --action=DENY --rules=all --target-tags=moles-game --priority=2000 --project="$project"
fi
if ! gcloud compute instances describe "$name" --zone="$zone" --project="$project" >/dev/null 2>&1; then
  gcloud compute instances create "$name" --zone="$zone" --project="$project" \
    --machine-type=e2-small --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
    --service-account="$account" --scopes=https://www.googleapis.com/auth/cloud-platform \
    --address="$address" --tags=moles-game --boot-disk-size=15GB \
    --disk="name=$name-data,device-name=game-data,mode=rw,boot=no,auto-delete=no" \
    --shielded-secure-boot --metadata=block-project-ssh-keys=TRUE,enable-oslogin=TRUE
fi
printf '\nProvisioned %s project host. Set DNS A record %s -> %s (no proxy), then run activate.sh.\n' "$environment" "$domain" "$address"
