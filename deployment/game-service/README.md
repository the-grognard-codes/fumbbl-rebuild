# Isolated game-service deployment

The selected host is **Google Compute Engine**, one `e2-small` VM in each
existing Firebase project. Firebase Hosting serves static files only. Java
terminates TLS on port 443; `/session/v1` is the sole WebSocket endpoint.

| Environment | Project | WSS endpoint | Accepted browser Origin |
| --- | --- | --- | --- |
| DEV | `dev-moles-under-the-pitch-org` | `wss://game-dev.molesunderthepitch.org/session/v1` | `https://dev.molesunderthepitch.org` |
| PROD | `molesunderthepitch-dotorg` | `wss://game.molesunderthepitch.org/session/v1` | `https://molesunderthepitch.org` |

These are configured targets, **not a claim that infrastructure has been
provisioned**. The owner requested scripts to run. VM, disk, static IP and
network use require billing in both projects. Keep a single service instance
per environment: active sessions are process-local, and restart/deployment ends
them. The dedicated account disk survives VM replacement. Never attach a DEV
account disk or service identity to PROD, or vice versa.

## Provision and activate

Run from Linux, WSL, or Google Cloud Shell with Bash and an authenticated
`gcloud` CLI. The operator needs permission to enable APIs, create Compute
resources/service accounts, set the one runtime IAM binding, and use IAP SSH
with OS Login administrator access. Set up project billing and a default VPC
before running. The script assigns the `moles-game` tag, then creates three
target-scoped ingress rules: public TCP 80/443, IAP-only TCP 22 from
`35.235.240.0/20`, and a lower-precedence deny of all other ingress. The deny
rule safely overrides broad default-network allows for this VM without changing
rules used by other resources. Firewall evaluation is priority-based, not a
sequential ACL.

1. Build and test: `mvn -f game-service/pom.xml clean verify`.
2. Run `bash deployment/game-service/provision.sh dev`.
3. In Squarespace DNS, add the printed **A record** pointing the printed game
   subdomain to its static IP. Leave Hosting and mail records alone. Do not
   add an AAAA record or an HTTP proxy to this host.
4. Wait for public DNS, then run
   `bash deployment/game-service/activate.sh dev YOUR_CERTIFICATE_CONTACT_EMAIL`.
   This accepts the Let's Encrypt subscriber agreement to issue the certificate.
5. Repeat with `prod` for a fully separate service.
6. Assemble the matching Hosting artifact and verify it:

   ```sh
   npm run assemble --prefix deployment/firebase -- --environment dev
   npm run verify-hosting-artifact --prefix deployment/firebase -- --environment dev
   firebase deploy --config firebase.generated.json --only hosting --project dev-moles-under-the-pitch-org
   ```

Use PROD's project and `--environment prod` for production. Its committed public
Firebase configuration and WSS URL are selected by the environment profile,
never inferred from active CLI state.

## Production handoff

Production is intentionally a separate, owner-run operation. Before creating a
release tag, confirm that the GitHub `production` environment contains its own
the existing production Workload Identity provider and deploy-service-account
variables. The public Firebase configuration is versioned in the repository;
do not copy DEV users, provider secrets, or sessions.

The production project is ready for its infrastructure operation when the next
release is authorized:

```sh
mvn -f game-service/pom.xml clean verify
bash deployment/game-service/provision.sh prod
```

Create the DNS A record printed by the script for
`game.molesunderthepitch.org`, wait for it to resolve to that address, then run:

```sh
bash deployment/game-service/activate.sh prod YOUR_CERTIFICATE_CONTACT_EMAIL
```

Only after WSS activation and the production acceptance checks succeed, create
an approved `moles-v*` tag. The existing production GitHub workflow builds the
PROD Hosting artifact with its own GitHub environment variables and publishes
the matching `wss://game.molesunderthepitch.org/session/v1` configuration.

`provision.sh` is rerunnable without replacing existing VMs/disks.
`activate.sh` replaces the service JAR and restarts Java, ending active sessions.
The scripts do not delete cloud resources. Review any existing resource named
`moles-game` before reuse; use clean dedicated projects as mapped above.

## Compute power schedule and restart

Stopping a VM is the only power operation in this deployment that reduces
runtime compute cost. The boot disk, dedicated data disk, reserved static IP,
DNS, firewall rules, service account, and Firebase Hosting remain allocated and
may still have their own storage, address, or service charges; they have no
running process to power down. Keep them in place so that a stopped environment
can resume without DNS, certificate, account-store, or configuration changes.

After both environments have been activated, install an on-VM UTC cron schedule
that halts each `moles-game` VM. Pick the schedule explicitly; this example
stops both at 03:00 UTC every day:

```sh
bash deployment/game-service/shutdown-cron.sh all '0 3 * * *'
```

The installer adds `/etc/cron.d/moles-game-stop` to each selected VM. It does
not create Cloud Scheduler, another always-on VM, or a new paid service. A
stopped VM cannot run its cron job, so start it manually when needed. Do not
schedule the stop while a game session may be active: process-local sessions
end when the VM stops.

`activate.sh` updates an already running VM; it does not start a terminated
instance. Start the enabled service and wait for its health check with:

```sh
bash deployment/game-service/start.sh dev
bash deployment/game-service/start.sh prod
# or start both, sequentially
bash deployment/game-service/start.sh all
```

Use the matching manual stop command when required outside the schedule:

```sh
bash deployment/game-service/stop.sh dev
bash deployment/game-service/stop.sh all
```

The start and shutdown-schedule commands use IAP for the host health check or
cron installation. All three commands address only the named `moles-game` VM
in the fixed DEV and PROD projects.

## Runtime identity, TLS and storage

The VM's `game-session@PROJECT.iam.gserviceaccount.com` service account supplies
Application Default Credentials through the metadata service. No downloaded
credential JSON is needed. It has Firebase Authentication viewer access only
in its project for revoked/disabled-user verification. The service fixes the
expected Firebase project, issuer, audience and browser Origin from `GAME_ENV`.
Auth emulators are forbidden in the deployed service.

The installer mounts the dedicated disk at `/var/lib/moles-game`, stores the
internal account/identity-link database there, and installs private runtime
configuration under `/etc/moles-game`. No FUMBBL database, API, users, or schema
is accessed. Back up the disk using project-local encrypted snapshots before
upgrades; restore only within the same environment. Do not back up active chat
as account data: session history is bounded and held in memory only.

Certbot obtains and renews the certificate using port 80 for ACME only. The
renewal hook atomically writes the Java PKCS12 keystore and restarts the service.
Java accepts game traffic only via TLS. The unprivileged service has only the
capability needed to bind port 443. It has no HTTP game listener and trusts no
forwarded security headers. Run `sudo certbot renew --dry-run` after installation
and monitor `certbot.timer` and `moles-game.service` health. A certificate renewal
restart ends active sessions.

## Live acceptance

Use two independent browser profiles, with two different dedicated DEV users.
Do not paste tokens into URLs, console commands, screenshots, or saved traces.

1. Signed out, visit `/play`; expect `/login?returnTo=%2Fplay` and no game session.
2. Complete Google sign-in in profile A; expect `/play`. Create a session and
   copy the invite. Expect “waiting for opponent.”
3. Complete email-link sign-in as another user in profile B; expect `/play`.
   Open the invite or enter the code. Both must show “both players joined.”
4. Send alternating chat messages including `<b>plain text</b>`; both histories
   must agree in sequence, and markup must remain plain text.
5. Close B, then reopen its invite. A must see left/reconnected events and B
   must regain its original slot. A second simultaneous connection for B must
   be rejected explicitly.
6. Test same-device and cross-device email completion. The latter must ask for
   the email originally used for the link and finish at `/play`.
7. Complete the token-rejection gate below, then repeat the successful sign-in
   path with dedicated test identities in each real environment before release.
8. Complete the log and privacy review below. Do not enable verbose Firebase,
   Jetty, TLS, or HTTP tracing for that review.

### Token-rejection release gate

Run the hermetic verifier and TLS protocol tests from a Java 21 shell:

```sh
mvn -f game-service/pom.xml '-Dtest=FirebaseTokenVerifierTest,TlsSessionTest' test
```

The quotes are accepted by Bash and are required by PowerShell, where the comma
would otherwise be parsed as a parameter separator.

The harness creates an ephemeral RSA signing key and certificate, gives the
Firebase Admin SDK a mocked certificate/account transport, and keeps test JWTs
inside the test process. It does not call Firebase or require a user token. It
must pass for **both** fixed project configurations. In particular, it proves
that the verifier rejects each of these before `AccountStore.accountFor` can
run:

| Attempt | Expected result |
| --- | --- |
| Corrupted signature or malformed JWT | Authentication close; no account or session |
| Expired JWT | Authentication close; no account or session |
| Wrong audience or wrong issuer | Authentication close; no account or session |
| DEV JWT presented to PROD, or PROD JWT presented to DEV | Authentication close; no account or session |
| Disabled or revoked user | Authentication close; no account or session |
| Missing Origin, foreign Origin, or any query string (including `?token=...`) | HTTP WebSocket handshake rejection before token verification |
| A `create`, `join`, or `chat` message before authentication | Authentication close; no account or session |

`TlsSessionTest` opens a real local TLS WebSocket listener and verifies the
handshake cases. It also opens the temporary account database after an invalid
initial token and asserts that the `internal_account` count remains zero. The
verifier test uses real RSA-signed JWT structure and Firebase Admin validation;
the TLS test deliberately supplies a small test identity verifier so that it
can test the wire protocol without putting a real bearer token on disk, a URL,
or a console.

Before a release, repeat the *successful* path using a dedicated DEV identity
on DEV and a dedicated PROD identity on PROD: obtain the token only through
the hosted `/play` Firebase flow, create and join a session from two profiles,
and confirm the expected presence transitions. This confirms live Firebase
issuance and the deployed service identity. Do not try to mutate, copy, or
paste a browser ID token to manufacture the failure cases; the hermetic gate is
the controlled test for those cases. Cross-project rejection is already
covered in both directions by the signed-token verifier test, where the
expected audience, issuer, and Firebase project are fixed independently for
DEV and PROD.

### Log and privacy review

Use only the normal application Console and the systemd journal. First clear
the browser Console in both test profiles, perform the two-player acceptance
flow, reconnect one player, and review the rendered session history and Console
output. The only participant labels in the UI and session messages must be
`You` and `Opponent`; the chat value must remain text, including
`<b>plain text</b>`. Do not inspect WebSocket message frames or export a HAR:
the initial, private browser-to-service authentication frame necessarily holds
that browser's bearer token.

On the host, inspect the service journal over the small test window through
IAP. Replace the project only for the matching environment; do not paste the
output into tickets, chat, or source control.

```sh
gcloud compute ssh moles-game \
  --project=dev-moles-under-the-pitch-org \
  --zone=us-central1-a \
  --tunnel-through-iap \
  --command="sudo journalctl -u moles-game --since '30 minutes ago' --no-pager"
```

The service is intentionally quiet about authentication values. For a local
count-only check for JWT-shaped strings, run this *on the VM*; it prints a
number, never matching log lines, and that number must be zero:

```sh
sudo journalctl -u moles-game --since '30 minutes ago' --no-pager \
  | grep -Eic 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
```

Review the displayed lines only for the service's operational state; do not
search by pasting a known UID, email, or token into a command. There must be no
Firebase ID token, raw UID, or email address in the service journal, browser
Console, URL, invite code, session state, or chat/event message. Browser Firebase
persistence and the browser's private Firebase-auth network traffic necessarily
contain that browser user's credentials; they are outside the opponent-facing
session protocol and are not a reason to enable tracing or export network
captures.

Firebase ID tokens are bearer tokens. One active connection per verified account
is an explicit presence policy, not universal replay detection. This proof has
no rules, teams, matchmaking, spectators, account linking or migration.

References: [Firebase ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[Compute Engine VM creation](https://cloud.google.com/sdk/gcloud/reference/compute/instances/create).
