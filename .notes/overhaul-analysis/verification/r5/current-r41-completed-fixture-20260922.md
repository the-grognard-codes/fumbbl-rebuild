# R5 current-r4.1 completed fixture

Completed 2026-09-22. This record covers only creation of the missing genuine
current-runtime completed-match fixture. It does not replace the retained
historical R5 report, claim a new backup or restore, claim another M4 gate, or
claim public-service readiness.

## Runtime and boundary

- Application configuration: `containers/local/compose.current-dev.yaml` and
  `containers/local/server.marker6.ini`.
- Application endpoint: loopback-only `127.0.0.1:22231`; database endpoint:
  loopback-only `127.0.0.1:23316`; local site: `localhost:5000`.
- Running image ID:
  `sha256:216882fc478ca2c55d71869a9628c56fefef6b2af47ce4d34f1f9c69f5a1062d`.
- Server JAR SHA-256:
  `09adcea16b6756bccb50cc93c7b867ba6771c0edb49d767450089a9ee0a57f30`.
- Java: Temurin `21.0.11+10-LTS`; Maven `3.9.9`; MariaDB image `11.8.9`;
  schema marker `6`; browser protocol `/browser/v2`.
- Recovery runtime `ffb-3.4.0-bb2025-r4.1`, recovery format `3`, authoritative
  engine `ffb-3.4.0-bb2025-m3d.1`, replay format `1`, ruleset `BB2025`, frozen
  catalog `bb2025-human-2026-09-08.1`.
- Secret configuration reference:
  `containers/local/.secrets/db_root_password`. Its value was never printed or
  copied into evidence.

The current application container was stopped before the generator opened the
database and restarted afterward. The database stayed running. The external
volumes `ffb-current-dev_database` and `ffb-current-dev_backup`, every retained
restore volume, and retained synthetic evidence were not reset, deleted,
truncated, recreated, or repointed.

## Implementation

`R5CompletedFixtureGeneratorTest` is opt-in and bound to the exact current-dev
loopback JDBC URL, schema marker 6, and an explicit confirmation value. It fails
closed if it cannot identify exactly one current-r4.1 paused fixture, its two
independent account memberships, or the current source-team revisions frozen by
that fixture. The generated match ID is deterministic from a fixed request ID
and the existing home account, so a partially created destination is refused and
a completed destination is verified rather than duplicated.

The generator uses `V2PreparationService`, `SetupApplication`,
`JdbcRecoveryRepository`, and the authoritative engine. It creates and joins a
separate match with the two original accounts and their current source teams,
activates it, confirms both default setups, selects only actions exposed by the
engine, and ends turns until the engine reports `FULL_TIME`. It performs no
direct match/recovery writes and does not fabricate result or replay rows.

Acceptance checks cover terminal document/recovery/replay identifiers, replay
event continuity, matching account-role memberships, equal terminal projections
for both members, exact terminal-request reconciliation without another engine
execution, and byte-for-byte equality of the paused document and checkpoint
before and after generation. IDs, invitation values, credentials, bearer tokens,
decision details, action details, and private dice state are omitted here.

## Commands and results

```powershell
# Native engine characterization: 1 passed, 0 failed/skipped.
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
& .tools/apache-maven-3.9.9/bin/mvn.cmd --batch-mode --no-transfer-progress `
  --offline --settings .mvn/settings.xml --global-settings .mvn/settings.xml `
  "-Dmaven.repo.local=$((Get-Location).Path)/.tools/repository" `
  -pl ffb-statetest -am `
  '-Dtest=SetupSessionTest#fullMatchUsesNativeHalftimeAndCompletesExactlyOnce' `
  '-Dsurefire.failIfNoSpecifiedTests=false' test

# Guard characterization with no opt-in environment: 1 intentionally skipped,
# build successful.
& .tools/apache-maven-3.9.9/bin/mvn.cmd --batch-mode --no-transfer-progress `
  --offline --settings .mvn/settings.xml --global-settings .mvn/settings.xml `
  "-Dmaven.repo.local=$((Get-Location).Path)/.tools/repository" `
  -pl ffb-statetest -am '-Dtest=R5CompletedFixtureGeneratorTest' `
  '-Dsurefire.failIfNoSpecifiedTests=false' test

# Quiesce only the current application writer. Database remained healthy.
docker stop --time 30 ffb-current-dev-server-1

# Real current-dev generation: 1 passed, 0 failed/skipped.
$env:R5_FIXTURE_CONFIRM='CREATE_CURRENT_COMPLETED_FIXTURE'
$env:R5_FIXTURE_JDBC_URL='jdbc:mariadb://127.0.0.1:23316/ffb_local'
$env:R5_FIXTURE_PASSWORD_FILE=(Resolve-Path `
  'containers/local/.secrets/db_root_password').Path
& .tools/apache-maven-3.9.9/bin/mvn.cmd --batch-mode --no-transfer-progress `
  --offline --settings .mvn/settings.xml --global-settings .mvn/settings.xml `
  "-Dmaven.repo.local=$((Get-Location).Path)/.tools/repository" `
  -pl ffb-statetest -am '-Dtest=R5CompletedFixtureGeneratorTest' `
  '-Dsurefire.failIfNoSpecifiedTests=false' test

# Relaunch the exact stopped container and use its existing health check.
docker start ffb-current-dev-server-1
```

Sanitized generator result: final authoritative revision `41`, replay events
`42`, terminal phase `FULL_TIME`, terminal exact retry unchanged, both member
projections equal, and paused fixture unchanged. After restart, read-only direct
aggregation reported one `ACTIVATED`, one `COMPLETED`, and one
`WAITING_FOR_OPPONENT` document; both recovery rows reported runtime `r4.1` and
format `3`. The site returned HTTP 200, and a non-upgrade v2 request returned the
expected HTTP 405.

## Failures and limits

The first sandboxed JDK 21 compile could not close an existing Maven dependency
archive (`AccessDeniedException`). A JDK 8 diagnostic was also unsuitable because
the current Jetty API dependency has Java 17 bytecode. The same offline Maven
command under the installed JDK 21 outside that filesystem sandbox compiled and
passed; no dependency or toolchain was downloaded or changed.

This result supplies the completed current-runtime fixture prerequisite only.
No new retained backup has yet been created from these two r4.1 fixtures, and no
separate restore or two-browser restored-environment acceptance is claimed here.
