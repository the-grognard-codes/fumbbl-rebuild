# R5 current-version local backup contract

This contract applies only to the accepted marker-6 local runtime selected by
`containers/local/compose.current-dev.yaml`: server image
`ffb-server:3.4.0-current-dev-20260922.1`,
Java 21 target toolchain, MariaDB 11.8.9/JDBC 3.5.8, schema marker 6, browser
protocol `/browser/v2`, recovery adapter `ffb-3.4.0-bb2025-r4.1`, private recovery
format 3, BB2025 engine `ffb-3.4.0-bb2025-m3d.1`, replay format 1, and frozen
catalog `bb2025-human-2026-09-08.1`. The M3e Java-8/schema-4 image and the earlier
marker-6/r2.2 R5 report are historical evidence, not the selected backup runtime.

`tools/r5-backup.mjs` creates one private, create-only full-database SQL backup
and a sanitized `manifest.json`. It is deliberately not a restore command.

## Boundary and consistency

The application container must be stopped by the operator before the adapter runs;
the adapter does not stop it. This quiesces the sole mutation worker. The database
remains running. The adapter rejects a running application, a non-marker-6 schema,
unknown tables/views/triggers/routines/events, unknown recovery runtime identifiers,
missing paused/completed fixtures, an existing destination, empty/failed dump, or a
manifest/file integrity mismatch.

The SQL dump contains schema and all marker-6 application data: legacy support
tables, account/identity/scope rows, v2 membership and invitations/retries, both
saved-team namespaces, prepared/frozen/completed match documents and replay, and
recovery checkpoints with pending decisions and exact retry history. Recovery data
can contain private dice state: the raw dump remains private. The manifest records
only SHA-256 hashes, configuration *references* and hashed fixture IDs.

Run only against the separately provisioned marker-6 database and a new output
directory. The local endpoint is loopback-only; do not combine Compose projects,
replace a database volume, or point this adapter at the R1/R2/reference volumes.

```powershell
$env:R5_DATABASE_CONTAINER = 'ffb-current-dev-database-1'
$env:R5_APPLICATION_CONTAINER = 'ffb-current-dev-server-1'
$env:R5_BACKUP_DESTINATION = '.tools/r5-backups/current-r41-YYYYMMDDTHHMMSSZ'
node tools/r5-backup.mjs
```

The output has `database.sql` and `manifest.json` only after validation succeeds.
On failure it retains a create-only `FAILED.json` (and possibly an incomplete raw
file) without a complete manifest; reuse of that directory is refused.

## Manifest v1

`ffb-current-runtime-backup-manifest/v1` binds status `COMPLETE`, the immutable
runtime image/container identity, database container/mount identity and MariaDB
version, marker 6, adapter/engine/catalog/protocol/recovery/replay identifiers,
the exact supported table set, the explicit write-quiesced boundary, public
configuration file hashes, secret configuration references, opaque fixture-ID
hashes, and the byte length/SHA-256 of `database.sql`. The paused-fixture check
uses only its non-terminal flag and the presence of the native recovery snapshot;
it never reads the decision, dice, or native payload into evidence. The SHA-256 of canonical
manifest content (excluding `manifestSha256`) detects manifest tampering.

## R5 separate restore procedure

`tools/r5-restore.mjs` imports only a validated backup into a new, empty MariaDB
container. It verifies that the destination application is stopped, source and
destination mounts do not alias, the destination has no tables, the retained image
ID and MariaDB version match the manifest, and the raw payload hash is valid before
the import. It does not run a migration. After import it verifies marker 6, the
complete supported table set, compatibility identifiers, and a byte-identical
single-transaction re-dump before writing create-only restore evidence.

The source runtime accepts one immutable local marker-6 profile. Therefore the
separate restored database volume is first imported on a separate loopback port,
then, only for live verification, the preserved source application/database
containers are stopped and the restored containers take the same loopback profile.
This is an endpoint handoff, not storage reuse: the source remains stopped with its
own retained volumes, and the restored environment owns distinct database and
backup volumes. No source or restore volume is reset, removed, truncated, or
reimported. When the acceptance session ends, stop the restored containers and
start the preserved source containers; do not use `down --volumes`.

```powershell
# Fresh target: do this before starting its application container.
$env:R5_SOURCE_DATABASE_CONTAINER = 'ffb-current-dev-database-1'
$env:R5_SOURCE_APPLICATION_CONTAINER = 'ffb-current-dev-server-1'
$env:R5_RESTORE_DATABASE_CONTAINER = 'ffb-r5-r41-restore-database-1'
$env:R5_RESTORE_APPLICATION_CONTAINER = 'ffb-r5-r41-restore-server-1'
$env:R5_BACKUP_DIRECTORY = '.tools/r5-backups/current-r41-20260923T025300Z'
$env:R5_RESTORE_EVIDENCE = '.tools/r5-restores/current-r41-YYYYMMDDTHHMMSSZ'
$env:DOCKER_EXE = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
node tools/r5-restore.mjs
```

The successful retained current-r4.1 direct restore took 615.454 ms from raw-import start to
raw-import completion. Its [sanitized evidence](../../.notes/overhaul-analysis/verification/r5/sanitized-restore-r41.json)
records identical dump/table/recovery-identifier digests, the original paused and
completed fixture hashes, and configuration references only. Raw dump, private
manifest, and private restore evidence remain under ignored `.tools/r5-*` paths.

The current-r4.1 backup contains only its exact runtime tuple. The adapter rejects
every unrecognized runtime tuple and performs no recovery or schema conversion.

Live browser verification uses the existing local DEV Firebase configuration by
reference and only loopback endpoints: browser artifact on `localhost:5000`,
nginx on `127.0.0.1:22232`, and Java on `127.0.0.1:22231`. It must be performed in
two independent signed-in browser sessions for the original fixture users. Never
capture tokens, account identifiers, invitation values, decision payloads, or
private dice in evidence. Before sign-in, the real-browser probe
`tools/test/r5-live-browser-unauth.test.mjs` verifies that unauthenticated browse,
setup mutation, and an identical retry all receive `AUTHENTICATION_REQUIRED`.
