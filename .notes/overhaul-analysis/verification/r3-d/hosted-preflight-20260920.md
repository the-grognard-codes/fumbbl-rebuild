# Hosted rollout preflight — 2026-09-20

Owner authorized DEV and PROD proxy/runtime deployment. This preflight made no
remote configuration, database, credential, package, or service changes.

## Observed state

Both `moles-game` instances in `us-central1-a` are RUNNING:

| Check | DEV (`dev-moles-under-the-pitch-org`) | PROD (`molesunderthepitch-dotorg`) |
| --- | --- | --- |
| `moles-game` service | active, Java PID 609 | active, Java PID 600 |
| Public application listener | Java `*:443` | Java `*:443` |
| nginx / MariaDB | inactive; no executable found by `command -v` | inactive; no executable found by `command -v` |
| Matching config/state directories | `/etc/moles-game`, `/var/lib/moles-game` only | same |
| Retained mount | `/dev/sdb`, 9.8G, 60K used, 9.3G available | `/dev/sdb`, 9.8G, 44K used, 9.3G available |
| RAM snapshot | 1960 MiB total, 1446 MiB available, no swap | 1960 MiB total, 1454 MiB available, no swap |

Resource snapshots are not load/capacity acceptance. No active-match inventory or
recovery parity check has yet been completed. No service may be cut over based
on these snapshots alone.

## Commands and access

Used existing Google Cloud CLI and OS Login identity, existing PuTTY PPK key,
and loopback IAP tunnels; no SSH key creation or upload. Windows OpenSSH rejected
the existing private-key ACL. Its permissions were not modified. PuTTY reused
the existing PPK and pinned the host fingerprints obtained over IAP. Host public
keys were recorded locally in `known_hosts`; no private key material was printed.

For each project:

```text
gcloud compute instances describe moles-game --zone=us-central1-a --project=PROJECT --format=value(name,status) --quiet
gcloud compute start-iap-tunnel moles-game 22 --local-host-port=127.0.0.1:PORT --zone=us-central1-a --project=PROJECT --quiet
```

DEV used port 22339; PROD used 22340. Read-only remote commands through PuTTY:

```sh
hostname
systemctl is-active moles-game nginx mariadb
sudo -n ss -lntp
df -h /var/lib/moles-game
free -m
command -v mariadb
command -v nginx
sudo -n find /etc -maxdepth 2 -type d -name 'moles-game*'
sudo -n find /var/lib -maxdepth 1 -type d -name 'moles-game*'
```

No tokens, service environment contents, private accounts, or team data were
read or logged. Package versions, certificate/renewal configuration, Firebase
service-account permissions, and running artifact checksums remain unverified.

## Decision needed before provisioning

Neither host has the prepared native marker-6 database/runtime installation.
The native contract requires a scoped MariaDB runtime account and protected
bootstrap secret files. The standing instruction forbids credential changes.
Do not reuse workstation/local database passwords or personal ADC, copy private
DEV account data into PROD, or repurpose the old TLS-keystore password.

Request specific authorization for new independent, host-local database/runtime
secrets and least-privilege database grants in DEV and PROD, while leaving all
existing Firebase, GCP, SSH, TLS, and old-service credentials unchanged. Until
resolved, retain both running services and all stored data unchanged. No nginx
deployment or hosted play acceptance is claimed.
