# DEV native runtime and nginx installation — 2026-09-21

## Follow-up: DEV Hosting published

The owner explicitly approved DEV Hosting publication after the initial safety
review block described below. The same verified artifact was rechecked (unchanged
game bundle and Hosting-config hashes) and successfully published using the exact
previously blocked command. Firebase CLI 15.30.0 / Node 26.7.0 reported 110 files,
`release complete` and `Deploy complete`. Only Hosting in
`dev-moles-under-the-pitch-org` was deployed; PROD and the local emulator were
untouched. No JVM restart, database mutation, or credential change was needed.

Post-deployment command:

```powershell
node --test deployment/game-service/proxy/live-dev-client-test.mjs
```

**Passed: 1 test, 0 failures (2.357 seconds).** On the actual custom domain
`https://dev.molesunderthepitch.org`, the served configuration exactly matches the
prepared artifact and is `no-store`; the served play bundle has the same SHA-256.
The real document's CSP permits only the DEV game WSS endpoint, not PROD or local
diagnostic transport. A fresh headless Chrome browser opened WSS through nginx
and received the real Java `AUTHENTICATION_REQUIRED` response on initial connection
and reconnect. Page asset scripts were suppressed so the probe could not initialize
Firebase, sign in, create accounts/matches, or capture credentials/private data.

The Hosting blocker in the historical installation account below is resolved.
DEV is available for the owner's signed-in create/join/start/play/spectate and
reconnect test. This read-only browser probe is not authenticated gameplay,
process-recovery, capacity, backup-restore, R3-D completion or public-service
readiness acceptance. No PROD deployment occurred.

## Outcome and authorization boundary

The owner requested completion of the **DEV** MariaDB/grants, marker-6 runtime,
nginx, and WSS client configuration. New independent credentials had already
been explicitly authorized and staged. No PROD operation occurred this turn.

Installed and active:

- `nginx.service`: public IPv4 443, existing certificate for
  `game-dev.molesunderthepitch.org`, exact `/browser/v2` and DEV Origin only.
- `moles-game-v2-dev.service`: dedicated non-login OS user, pinned Temurin Java,
  one JVM, only 127.0.0.1:22231. Enabled at boot; `Restart=no` remains deliberate.
- `mariadb.service`: 11.8.9, only 127.0.0.1:3306, new `ffb_m6_dev` marker-6 schema.
  `ffb_m6_runtime`@`127.0.0.1` has SELECT/INSERT/UPDATE/DELETE on this schema only.
  No global or DDL grants. Root administration uses the local Unix socket.
- Existing TLS renewal hook now validates/reloads nginx, never restarts Java.
  Existing standalone HTTP-01 remains configured; port 80 is not occupied by nginx.

The old `moles-game.service` is stopped/disabled but retained with its original
jar, configuration, secrets and H2 store. No established 443 sockets were present
at preflight or immediately before quiescence. The old artifact implements the
presence-only `/session/v1` proof, not an R2 engine runtime. No active native engine
was upgraded. No local match service was stopped or changed.

**Not complete:** publishing the paired Firebase Hosting client. Auto-review
rejected the explicitly scoped CLI attempt because the historical instruction
forbidding public publishing was considered unresolved for Hosting. No attempt
was made to bypass it. Request explicit owner confirmation to publish this DEV
Hosting artifact; the backend remains installed and testable independently.

Blocked command (did not execute):

```powershell
firebase.cmd deploy --only hosting --project dev-moles-under-the-pitch-org --config .tools/dev-release-20260921/client/firebase.json --non-interactive
```

The live DEV website therefore does **not yet receive** the new WSS configuration.
No authenticated end-to-end hosted play acceptance or R3-D completion is claimed.

## Preserved identity and storage

Schema-only export from the retained isolated local marker-6 database copied
**17 table definitions and no rows**. The new schema is independently provisioned;
the startup verifier does not initialize/migrate storage. The local source, all
local databases/volumes, matches, backups and synthetic evidence are untouched.

The stopped old DEV H2 store contained two accounts and two issuer/subject links,
with only `INTERNAL_ACCOUNT` and `GAME_IDENTITY` tables. There were no lifecycle,
scope, invitation, team, or engine tables. A cold copy and old configuration are
retained under `/etc/moles-game-v2-dev/retained-20260921` (root-only parent).
The original `/var/lib/moles-game/accounts.mv.db` on `/dev/sdb` remains intact.

`DevIdentityMigration` read only the copy, enforced the exact DEV issuer and
legacy two-table boundary, preserved both internal account IDs, and verified
identity-map equality before committing to MariaDB. Each account received only
the owner-approved default PLAYER and SPECTATOR scopes. Nonempty targets and
retries fail closed; no automatic merge/overwrite or admin grant exists.
Identity values were never printed or downloaded.

Post-probe database counts: 2 accounts, 2 identities, 0 prepared matches,
0 recovery artifacts. Rejected authentication created no account. No real-user
teams, gameplay, or synthetic test matches were written to DEV.

New DB files are in `/var/lib/mysql`; state/backup directory is
`/var/lib/moles-game-v2-dev/backup`; logs are `/var/log/moles-game-v2-dev`.
These new paths use the existing **boot filesystem**, not the old H2 data disk.
They persist across service/VM stop-start, but VM deletion/boot-disk lifecycle,
backup scheduling and restore acceptance are **not** solved by this installation.
No disk was formatted, resized, deleted, reset or reattached.

Secret files remain host-local, root-owned with group `moles-game-v2-dev`, mode
0640; their parent directories are 0750. This grants the dedicated runtime read
access without ownership or write permission. Values were not changed or copied
to the workstation. Existing Firebase/GCP/SSH/TLS credentials remain unchanged.
The attached service account is reused; no personal ADC is installed on the VM.

## Versions, artifacts and configuration

| Item | Observed version / identity |
| --- | --- |
| Target | `moles-game`, `us-central1-a`, `dev-moles-under-the-pitch-org` |
| MariaDB | `11.8.9-MariaDB-ubu2404` / package `1:11.8.9+maria~ubu2404` |
| nginx | Ubuntu `1.24.0-2ubuntu7.18` |
| New Java | Temurin `21.0.11+10-LTS`, retained tested Linux runtime |
| Old system Java retained | Ubuntu `21.0.12+8-1-24.04-Ubuntu` |
| Maven / Jetty / JDBC | 3.9.9 / 12.1.13 / 3.5.8 |
| Frontend check toolchain | Node 26.7.0, npm 11.19.0, Vite 8.2.2; Node 24 declared target remains a CI limit |
| New server jar SHA-256 | `ba9aae753856a36ca579557772ee9b88e56b010292682669640e59373753b2bb` (local and installed equal) |
| Retained old jar SHA-256 | `83e535f017d78cf9b453bc0e5c9101c9cf12dead57c88b0ed7d2207287f5cd77` |
| Empty schema SHA-256 | `16b95c0f689f92461678424b1b80e931d804a26509c7755951ab53ab3f33db76` |
| Java archive SHA-256 | `d179f3d87c745a174ba1684b246bff18359963cd9f28c57838ad10fd9a9f98bf` |
| Prepared play JS SHA-256 | `24958f54bb09df83dead9fd578e0a604d46dc1df3acf967dde087563bdd4dd4b` |
| Prepared Hosting config SHA-256 | `0d14fb1750b9603029b8b521b46403f4853f44f3cccccc9e1ec7245ea06e86c55` |

The Linux Java distribution was packaged from the retained
`ffb-r3d-proxy-test:20260919` image without mounting data/credentials. Its export
container `dev-java-export-20260921` is retained. The official
[MariaDB repository helper](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/installing-mariadb/binary-packages/mariadb-package-repository-setup-and-usage)
was downloaded to a new host staging directory, its help/version inspected, and
run with `--mariadb-server-version=mariadb-11.8 --skip-maxscale --skip-tools`.
Helper version 2026-09-15, SHA-256
`b54c87edfe81b9837ef44a4a4f39383dd8df32776e6a18c0743a5d3ece044ac3`.
APT signature verification remained enabled; no existing packages were upgraded.
Both new services were masked during package installation to prevent default
listeners, then individually unmasked after their configurations were installed.

Public nginx configuration is rendered from the tested DEV candidate by
`render-dev-host.mjs`; only listener, PID/log, certificate paths and worker-user
settings change. There is no route broadening or upstream retry. Access logs
contain status/bytes/time only; request-related error logging remains disabled.

The exact native properties are the packaged `native-dev.properties`; no
arbitrary profile override was added. Empty `rosters`/`teams` directories satisfy
legacy startup cache scanning; native v2 teams still come from the frozen catalog.
Catalog, replay, engine rules, membership checks and mutation concurrency are
unchanged. The already-tested r2.3 default-setup policy is included in the paired
server; existing r2.2 checkpoint behavior remains covered by recovery tests.

## Commands and results

Workspace edits, UI previews and sprites from parallel work were preserved.
The DEV client is assembled separately under
`.tools/dev-release-20260921/client`; the local Firebase Hosting/emulator directory
was **not** replaced. Only `game.js`/`game.css` were copied from the play build;
Vite's copied diagnostic sprite/preview files were excluded. Artifact: 110 files.

Focused checks, before packaging:

```powershell
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test 'BrowserV2TransportPolicyTest,NativeMarker6ServerMainTest,BrowserV2RouteTest,BrowserV2AdapterTest,FirebaseV2PrincipalAuthenticatorTest,DefaultSetupSessionTest,RecoveryApplicationTest' -Offline
python deployment/game-service/proxy/test-provision-dev.py
node --test site/test/play-client.test.mjs
node deployment/firebase/scripts/verify-environment.mjs
```

- Java: 26 server + 12 native setup/recovery tests, all passed.
- Provisioner: 8 tests passed; target/user existence, foreign project, logging,
  data/destructive SQL and malformed secret rejection; sanitized SQL errors.
- Standalone `DevIdentityMigrationTest`: valid identity/scope parity, foreign
  issuer, lifecycle-table boundary, nonempty target, orphan link and retry checks
  all passed against synthetic in-memory H2 fixtures.
- Browser policy: 4 passed; exact DEV WSS allowed, insecure/foreign/query/path
  variants and mixed environments rejected; PROD remains unavailable.
- Browser unit suite: 49 passed (including parallel preview tests).
- Mounted browser: 2 passed (creator auto-start, two players/viewer/reconnect).
- TypeScript and Vite passed. Whitespace check on changed tracked policy files passed.

Package command used the pinned Java home and project-local Maven settings/cache:

```powershell
$env:JAVA_HOME='C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot'
.tools/apache-maven-3.9.9/bin/mvn.cmd --batch-mode --no-transfer-progress --offline --settings .mvn/settings.xml --global-settings .mvn/settings.xml '-Dmaven.repo.local=.tools/repository' -Pmockito5 -pl ffb-server -am -DskipTests package
npm run build --prefix site
npm run test --prefix browser-client
npm run test:browser --prefix site
node deployment/game-service/proxy/assemble-dev-client.mjs .tools/dev-release-20260921/client
node deployment/firebase/scripts/verify-hosting-artifact.mjs --environment dev --artifact-root .tools/dev-release-20260921/client/hosting --hosting-config .tools/dev-release-20260921/client/firebase.json
```

Host writes used existing pinned PuTTY/IAP access (DEV tunnel 22339), no new keys.
Staging directory `/home/jacob_thegrognardcodes_com/moles-dev-install-20260921`.
Reviewed command bodies are retained in `deployment/game-service/proxy/`:

1. `export-empty-marker6.mjs`, `provision-dev-database.py`, `dev-mariadb.cnf`.
2. `stage-dev-runtime.sh` and `moles-game-v2-dev.service`.
3. `inspect-retained-dev.sh`, `DevIdentityMigration.java` and its synthetic test.
4. `activate-dev-proxy.sh`, rendered `nginx.conf`, `dev-cert-renewal.sh`.

One-shot scripts intentionally refuse occupied destinations; they are not
general-purpose retry/reset/upgrade commands. Do not rerun provisioning on the
installed database. A partial failure is retained for inspection.

Live probes:

```powershell
node --test deployment/game-service/proxy/live-dev-test.mjs
$env:DEV_RELOAD_TEST='1'
node --test deployment/game-service/proxy/live-dev-test.mjs
```

Final normal probe: 3 tests passed. Trusted real certificate, 20 route/header
denials (including missing/foreign Origin), two separate authentication-gated
connections, invalid bearer rejection, missing/foreign SNI rejection, plaintext
400 and public backend ports 22231/3306 unreachable. The earlier reload-enabled
run passed its 3 tests: an already-upgraded WSS socket remained usable after the
actual renewal hook ran, with Java PID 5127 unchanged. This tests a reload using
the existing certificate, **not** an ACME certificate issuance/renewal dry run.

`check-dev-adc.py` ran as the runtime OS user and verified HTTP 200 for an attached
service-account Firebase lookup of a random nonexistent subject. No token or
provider payload was logged; no user/account was created. This establishes
permission/connectivity, not real-user ID-token verification acceptance.

`check-dev-private-logs.py` passed: existing raw identity subjects, staged secrets,
synthetic bearer/query probes, JWT shapes and email shapes absent from sampled
service logs; nginx log fields match only status/bytes/time. No real team/game
data exists yet, so real gameplay log-privacy acceptance remains untested here.

## Failures resolved and remaining limits

- Initial Windows provisioner unit run failed because `os.geteuid` is absent;
  the test double now explicitly supplies it. The Linux provisioner was unchanged.
- Initial JVM startup failed closed on missing empty legacy cache directories.
  A redacted exception-class/frame probe identified the cause; the installer was
  corrected. No schema/authentication guard was weakened. Diagnostic jar is
  retained under the root-only cold-copy directory, not on the runtime classpath.
- H2 invitation-count query found no invitation table; metadata inspection proved
  the exact older two-table schema before the identity migration was written.
- Initial public Host probe accidentally selected foreign SNI through Node's
  Host-derived default; the test now pins correct SNI for Host tests and separately
  asserts foreign/missing SNI rejection. No nginx change was needed.
- Hosting publication was blocked by auto-review and was not retried indirectly.
- Final diagnostic-helper compile hit the known Windows sandbox jar-access
  restriction; the same compile passed outside that sandbox. The source helper
  now invokes the real native entry point, retaining its exclusive runtime lock.

Final idle snapshot: 1960 MiB total RAM, 1289 MiB available, no swap; not a load
benchmark. No host reboot, real-user hosted gameplay, long-idle socket exercise,
OS-process recovery kill, backup restore, capacity gate or production readiness
is claimed. Local/native recovery regression tests passed, but DEV has no match
to restore yet. Automatic JVM restart remains off until that operational gate.

After explicit Hosting approval, publish the already verified artifact, verify
the served WSS/CSP, then have the owner test sign-in, create/join/start, default
setup, play/spectate and reconnect. Use `moles-game-v2-dev` for the new service;
do not restart the disabled old service alongside nginx. Before any future JVM
restart or rollback, inspect active work and retain a compatible engine/runtime.
Never roll back or replace database rows to match the old H2 service.
