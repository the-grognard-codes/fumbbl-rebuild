# R5 current-r4.1 backup and separate restore

Executed 2026-09-22/23. This is the current-runtime R5 slice record. The earlier
marker-6/r2.2 report remains historical evidence. This record does not claim
another M4 gate or public-service readiness.

## Retained backup

The source application writer was stopped while the database remained healthy.
`tools/r5-backup.mjs` accepted only schema marker 6 and the sole compatibility
tuple `ffb-3.4.0-bb2025-r4.1` / engine
`ffb-3.4.0-bb2025-m3d.1` / recovery format 3 / replay format 1. It found the
current paused fixture at recovery generation 14 and the genuine completed
fixture, refused unknown schema objects and reused output, created a full
single-transaction dump, atomically promoted the payload, and then validated the
manifest and payload hashes.

Private retained backup:
`.tools/r5-backups/current-r41-20260923T025300Z`. The raw SQL and full manifest
remain ignored and private. The published [sanitized manifest](sanitized-manifest-r41.json)
contains only compatibility metadata, hashes, byte length, configuration
references, and hashed fixture identifiers.

```powershell
node --test tools/test/r5-backup.test.mjs tools/test/r5-restore.test.mjs

docker stop --timeout 30 ffb-current-dev-server-1
$env:R5_DATABASE_CONTAINER='ffb-current-dev-database-1'
$env:R5_APPLICATION_CONTAINER='ffb-current-dev-server-1'
$env:R5_BACKUP_DESTINATION='.tools/r5-backups/current-r41-20260923T025300Z'
$env:DOCKER_EXE="$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
node tools/r5-backup.mjs
docker start ffb-current-dev-server-1
```

Result: `COMPLETE`; payload 1,111,998 bytes; payload SHA-256
`cbc55bd4cfeae39d5837b4954164ed476a27f5a04e57d27eda4f4f63868eff70`;
manifest SHA-256
`be821b99549690fda5349bddf9f98c110939e8c719b900e61a6ca528765b0a16`.

## Empty separate restore and direct parity

The new Compose project `ffb-r5-r41-restore` created distinct
`ffb-r5-r41-restore_database` and `ffb-r5-r41-restore_backup` volumes. Before
import, the destination application was stopped, `SHOW TABLES` was empty, source
and restore database/backup mount identities were distinct, the MariaDB version
matched, and the exact source image ID was available. No migration or automatic
conversion ran.

```powershell
$env:M6_ADC_FILE="$env:APPDATA\gcloud\application_default_credentials.json"
docker compose -f containers/local/compose.r5-r41-restore.yaml up -d database
docker compose -f containers/local/compose.r5-r41-restore.yaml create server

$env:R5_SOURCE_DATABASE_CONTAINER='ffb-current-dev-database-1'
$env:R5_SOURCE_APPLICATION_CONTAINER='ffb-current-dev-server-1'
$env:R5_RESTORE_DATABASE_CONTAINER='ffb-r5-r41-restore-database-1'
$env:R5_RESTORE_APPLICATION_CONTAINER='ffb-r5-r41-restore-server-1'
$env:R5_BACKUP_DIRECTORY='.tools/r5-backups/current-r41-20260923T025300Z'
$env:R5_RESTORE_EVIDENCE='.tools/r5-restores/current-r41-20260923T025500Z'
node tools/r5-restore.mjs

$env:R5_PARITY_EVIDENCE='.tools/r5-restores/current-r41-20260923T025500Z/parity-v2.json'
node tools/r5-parity.mjs
```

Raw import ran from `2026-09-23T03:11:40.021Z` to
`2026-09-23T03:11:40.638Z`, 615.454 ms. A byte-identical post-import dump matched
the retained payload. Categorized source/restore comparisons also matched for
accounts/identities/memberships/invitations, saved and frozen teams, prepared and
completed documents/result/replay/request history, and pending recovery. The
restore-time paused state was revision 13/generation 14; the completed state was
revision 41/generation 42 with 42 replay events. Both frozen teams carried
BB2025 catalog/preset `bb2025-human-2026-09-08.1`.

The restored environment required the repository's fixed marker-6 database
profile. The verified restore volumes were retained while only their containers'
loopback bindings were recreated for the documented endpoint handoff. The source
containers are stopped with their source volumes retained; the restored database
and application now own `127.0.0.1:23316` and `127.0.0.1:22231`. The unchanged
local proxy remains at `127.0.0.1:22232` and the site at `localhost:5000`.

## Retry, authorization, and authoritative continuation

With the restored application writer stopped, `R5RestoredContinuationTest`
reconstructed the r4.1 session from its checkpoint. It extracted the retained
request only in process, reconciled it as an accepted duplicate, and proved the
document, recovery bytes, and generation were unchanged. Wrong-actor mutation
and unaffiliated read probes returned the current authorization-order failures
and left recovery unchanged. A legal pending action exposed by the authoritative
engine then advanced revision 13 to 14 and generation 14 to 15. Its exact retry
did not execute again. Home and away projections agreed before and after
normalizing only `callerRole`.

```powershell
docker stop --timeout 30 ffb-r5-r41-restore-server-1
$env:R5_RESTORE_CONTINUE_CONFIRM='CONTINUE_RESTORED_CURRENT_FIXTURE'
$env:R5_RESTORE_CONTINUE_JDBC_URL='jdbc:mariadb://127.0.0.1:23316/ffb_local'
$env:R5_RESTORE_CONTINUE_PASSWORD_FILE=(Resolve-Path `
  'containers/local/.secrets/db_root_password').Path
& .tools/apache-maven-3.9.9/bin/mvn.cmd --batch-mode --no-transfer-progress `
  --offline --settings .mvn/settings.xml --global-settings .mvn/settings.xml `
  "-Dmaven.repo.local=$((Get-Location).Path)/.tools/repository" `
  -pl ffb-statetest -am '-Dtest=R5RestoredContinuationTest' `
  '-Dsurefire.failIfNoSpecifiedTests=false' test
docker start ffb-r5-r41-restore-server-1
```

The first continuation attempt failed before mutation because the test assumed a
membership row sort order. The second failed before mutation because it expected
`NOT_FOUND` instead of the accepted earlier `AUTHENTICATION_REQUIRED` boundary.
Both characterizations were corrected; the final run passed. No fixture state
changed during either failed run.

## Browser checks and current limit

`node --test tools/test/r5-live-browser-unauth.test.mjs` used real headless Chrome
through the unchanged proxy and proved unauthenticated browse, mutation, and an
identical retry all return `AUTHENTICATION_REQUIRED`. The browser-client suite
passed 64/64 tests; backup/restore contracts passed 8/8 tests.

The computer-use surface exposed no Chrome, Edge, or in-app browser provider, so
the two existing Chrome sessions could not be agent-controlled. The user instead
performed the live checks in two independent authenticated sessions for the
original fixture users. Both resumed the restored match at revision 14 and saw
the follow/do-not-follow boundary produced by the intentional post-restore push:
the home participant had the action and the away participant had the read-only
projection with no available action. No follow-up action was submitted. This is
user-observed live-browser evidence, not mocked response evidence.

The completed-match browser requirement remains blocked by the accepted runtime,
not by a missing fixture or hidden UI control. `/browser/v2` deliberately omits
completed matches from `browse`, rejects result/replay message families, and
cannot newly watch a completed match. The `/play` build correspondingly sets
`results={false}` and has no completed-match result/replay control. The only
listed item was the active `Watch Home vs Away` entry. The retained completed
fixture is present and passed direct database/result/replay parity, but neither
original user can open it through the current authenticated UI. Enabling that
surface would change the accepted protocol and runtime after the backup was
bound to its immutable identity, so it was not silently added to this restore.

Accordingly, Slice 2 has direct parity, retry/recovery, authorization,
authoritative continuation, and two-user paused-state browser evidence, but its
completed result/replay browser check and full exit condition remain unclaimed.
The [sanitized restore evidence](sanitized-restore-r41.json) records the partial
browser result and exact limit.
