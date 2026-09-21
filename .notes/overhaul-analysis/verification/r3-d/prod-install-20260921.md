# Authorized PROD installation and DEV proxy review — 2026-09-21

## Outcome

The owner reported successful DEV create/join, synchronized start and spectating,
then authorized PROD installation and required credentials. DEV remained on its
existing JVM (PID 5127), with its prepared match and recovery artifact preserved.
No DEV service restart, storage replacement or frontend publication occurred.

PROD backend and Firebase Hosting are installed. Runtime PID at installation: 4032.
The owner subsequently confirmed successful authenticated acceptance at
`https://molesunderthepitch.org/play` (see follow-up below). Automated probes submit no real bearer,
create no accounts and mutate no matches. This is not a public-service readiness,
backup/restore, capacity or crash-recovery acceptance claim.

## Proxy mechanism verified

- Public TLS terminates at nginx on 443; only exact
  `game.molesunderthepitch.org`, `/browser/v2`, and Origin
  `https://molesunderthepitch.org` are admitted.
- nginx forwards WebSocket Upgrade to the sole JVM at 127.0.0.1:22231.
  Forwarded identity headers are stripped; Host is fixed; Origin is preserved.
  Java still verifies Firebase identity and application membership/scopes.
- No proxy retry or buffering; no alternate mutation worker was introduced.
- Missing/foreign Origin, mixed-environment Host, queries (including bare `?`),
  encoded route variants and header credentials are denied before authentication.
  Unavailable route families return 404; missing/foreign SNI fails TLS.
- MariaDB binds only 127.0.0.1:3306. Public 22231/3306 probes cannot connect.
- The real certificate-renewal hook validates/reloads nginx. An existing WSS
  connection remained usable and the Java PID stayed unchanged. This used the
  existing certificate; it was not an ACME issuance or renewal dry run.
- DEV's installed nginx configuration hash matched its reviewed release:
  `9637fb45aeed6fb8dde0f598a1b1e2938dfefbb6dac3212ad37c4a39e06c96d0`.
  Live DEV browser WSS/auth-gate/reconnect and protected-log checks passed after
  the owner's gameplay. Java stayed private and its PID remained unchanged.

## Installed configuration and preservation

Existing VM: `moles-game`, project `molesunderthepitch-dotorg`, zone
`us-central1-a`, existing address 34.63.53.122. Started the existing stopped VM;
no cloud account, project or instance was provisioned.

Versions: Temurin 21.0.11+10-LTS; Maven 3.9.9; Jetty 12.1.13;
MariaDB `1:11.8.9+maria~ubu2404`; JDBC 3.5.8;
nginx `1.24.0-2ubuntu7.18`; Firebase CLI 15.30.0; Node 26.7.0.
The existing TLS certificate/key were reused, not rotated.

New namespaces: `/opt/moles-game-v2-prod`, `/etc/moles-game-v2-prod`,
`/var/lib/moles-game-v2-prod`, `/var/log/moles-game-v2-prod`, database
`ffb_m6_prod`. Runtime user `ffb_m6_runtime`@`127.0.0.1` has only
SELECT/INSERT/UPDATE/DELETE on that schema. Existing staged PROD DB/admin/coach
secrets were reused, not regenerated or printed. Dedicated non-login OS user;
root-owned secret files are group-readable only by that service. Firebase uses
the VM's existing attached service identity, not personal ADC.

The database was created from the retained, empty 17-table marker-6 definition:
SHA-256 `16b95c0f689f92461678424b1b80e931d804a26509c7755951ab53ab3f33db76`.
No DEV match/account rows were copied. Old PROD H2 had zero accounts and zero
identity links, verified on a cold copy after checking for connections. Migration
validated its exact two-table boundary and preserved the empty identity set.
Original H2, legacy jar/configuration and cold copies remain intact.
Cold backups: `/etc/moles-game-v2-prod/retained-20260921`.

`moles-game-v2-prod`, nginx and MariaDB are enabled; legacy `moles-game` is
stopped/disabled, not deleted. `Restart=no` remains deliberate pending operational
recovery acceptance. Database/backup directories are on the boot filesystem;
the old attached data volume was not repurposed. R5 backup/restore remains open.

## Build correction and exact artifact boundary

An additional post-install class comparison caught a contaminated shared build
output: the first package had 3014 classes, including Java 8-targeted server
classes, versus DEV's 3324 classes with Java 21 server classes. The process that
rewrote the shared output was not established. Passing incremental Maven tests
was insufficient evidence of the packaged build target.

A fresh source snapshot under `.tools/prod-release-20260921/isolated-build`
copied the root/module POMs, common/server/statetest sources and `server.ini`,
without copying any target directories. Pinned javac then compiled 1167 server
sources with `release 21`. Final package and all 35 selected tests passed.
Initial isolated assembly lacked `server.ini`; copying that existing input fixed
assembly without changing source or configuration.

The class comparison now passes: **3324 classes; 3319 byte-identical to DEV**.
Only `BrowserV2TransportPolicy`, `BrowserV2Runtime` and its anonymous servlet,
`LocalServerMain`, and `NativeMarker6ServerMain` differ. Human catalog, engine,
setup/recovery implementation and shared classes are byte-identical. Native PROD
properties add an exact environment-specific launcher boundary; no replay/schema
format or engine behavior was changed.

Final installed jar SHA-256:
`5c693bb956743d23f5734b6e3d0ef69d45bdaf85537c433cbe71373708e3c1e9`.
DEV reference jar: `ba9aae753856a36ca579557772ee9b88e56b010292682669640e59373753b2bb`.
Superseded PROD jar: `3a799edca1b924aad020ebc284a06e2265bb5463597c826ebcb72621b7c105c2`.
The superseded jar is retained as `pre-isolated-build.jar` in the protected cold
backup directory. Replacement closed nginx admission and rechecked zero accounts,
prepared games, recovery artifacts and connections before stopping Java. No
active match was upgraded. All data was retained.

## Commands and results

Generated procedures and hash manifests are retained in
`.tools/prod-release-20260921`. These are dated, one-shot procedures, not safe
instructions to rerun against an occupied installation.

```powershell
node deployment/game-service/proxy/prepare-prod-rollout.mjs
node deployment/game-service/proxy/prepare-prod-rollout.mjs --verify
& 'C:/Program Files/Python314/python.exe' .tools/prod-release-20260921/checks/test-provision-prod.py
node deployment/game-service/proxy/assemble-prod-client.mjs
```

Provisioner: 8 tests passed. Generated identity-migration contract harness passed
valid preservation, scope/lifecycle/schema validation, foreign issuer/orphan
rejection, occupied-target and retry refusal. Attached service identity lookup
of a random nonexistent subject returned HTTP 200 without creating an account.

Final `node --test site/test/play-client.test.mjs`: 4 tests passed.
`node deployment/firebase/scripts/verify-environment.mjs` passed all three
environment profiles. Repeating renderer verification initially hit its retained
manifest's exclusive-create guard; verification now compares an existing manifest
without overwriting it. Two consecutive `--verify` runs passed. `git diff --check`
reported no whitespace errors (only repository line-ending warnings).

Final isolated build (run from repository root):

```powershell
$env:JAVA_HOME='C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot'
$env:MAVEN_SKIP_RC='true'; $env:MAVEN_ARGS=''; $env:MAVEN_OPTS='-Dfile.encoding=UTF-8'
& .tools/apache-maven-3.9.9/bin/mvn.cmd --batch-mode --no-transfer-progress --offline --settings .mvn/settings.xml --global-settings .mvn/settings.xml "-Dmaven.repo.local=$((Get-Location).Path)/.tools/repository" -f .tools/prod-release-20260921/isolated-build/pom.xml -Pmockito5 -pl ffb-statetest -am '-Dtest=LocalServerMainTest,NativeMarker6ServerMainTest,BrowserV2TransportPolicyTest,BrowserV2RouteTest,FirebaseV2PrincipalAuthenticatorTest,DefaultSetupSessionTest,RecoveryApplicationTest' '-Dsurefire.failIfNoSpecifiedTests=false' package
powershell -ExecutionPolicy Bypass -File deployment/game-service/proxy/compare-runtime-classes.ps1 -DevJar .tools/prod-release-20260921/dev-reference.jar -ProdJar .tools/prod-release-20260921/isolated-build/ffb-server/target/FantasyFootballServer.jar
```

23 server tests + 12 setup/recovery tests passed, no failures/skips. Contract
coverage includes exact profile/property boundaries, local isolation, opposite
Firebase project issuer/audience rejection before account creation, route policy
and the previously accepted setup/recovery behavior. Surefire XML is retained
in the isolated build's module target directories.

Deployment used pinned-host-key PuTTY over GCP IAP (PROD local port 22340), not
public SSH access. Rendered stage/provision/identity/activate scripts ran only
after their project, empty-target and connection guards. Final package correction
used `deployment/game-service/proxy/correct-empty-prod-package.sh` via root stdin.
Existing settings/secrets/data were never printed in command output.

```powershell
firebase deploy --only hosting --project molesunderthepitch-dotorg --config .tools/prod-release-20260921/client/firebase.json --non-interactive
$env:PROD_RELOAD_TEST='1'
node --test .tools/prod-release-20260921/checks/live-prod-test.mjs .tools/prod-release-20260921/checks/live-prod-client-test.mjs
```

Hosting: 110 files, release complete. Final live run: **5 tests passed**, 0 failed,
12.490 seconds. It covers 20 route/header denials, auth-gated reconnect, invalid
bearer denial, trusted certificate, SNI/plaintext rejection, private backend
ports, actual renewal hook and real Chrome WSS/CSP. Browser asset scripts were
suppressed so no Firebase sign-in or private-data access occurred.

PROD frontend reuses the DEV-accepted UI, not concurrent UI/sprite edits. Served
game bundle SHA-256: `24958f54bb09df83dead9fd578e0a604d46dc1df3acf967dde087563bdd4dd4b`.
Only environment config, transport policy and CSP were selected for PROD.
Served config equality, `no-store`, bundle parity and PROD-only connect-src passed.

Final protected log scan passed: staged secrets, stored raw subjects, synthetic
bearer/query probes, JWT and email shapes absent; nginx logs contain only status,
bytes and timing. PROD has no real accounts/teams yet; this does not establish
privacy of every possible gameplay field. Final marker=6; account/prepared/
recovery counts=0/0/0. Idle memory: 1960 MiB total, 1301 MiB available, no swap;
not a capacity benchmark.

## Owner acceptance follow-up — 2026-09-21

The owner reported successful PROD testing with three signed-in accounts:

- Player A created a game; Player B joined.
- Player A started the game; Player B immediately transitioned to the started game.
- The third account spectated without issue.

This is owner-reported real-user authentication, create/join, synchronized start
and spectator acceptance, in addition to the automated transport checks above.
No account identifiers, tokens or private match data were recorded. The earlier
zero-row counts and log scan describe the pre-acceptance installation snapshot,
not the database after this test. No live operations were performed to record it.

Authenticated reconnect, a full gameplay turn/completed match, host reboot,
long-idle connections, process-kill recovery, backup restore and capacity were not
reported in this PROD test and remain unclaimed. General public-service readiness
is not established. Do not restart or roll back Java with active matches.
