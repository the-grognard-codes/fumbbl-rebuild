# R5 slice 1: current-runtime retained backup

Completed 2026-09-22. This is a backup creation and manifest-validation record.
It does **not** claim a restore, another M4 gate, public-service readiness, a
historical-checkpoint conversion, or an in-place match upgrade.

## Accepted runtime selected

The current accepted local recovery runtime was established from the live,
loopback-only marker-6 configuration and source, rather than selecting the
convenient historical M3e fixture. The M3e report identifies the Java-8/schema-4
M3d image as historical acceptance evidence. `containers/local/recovery.md` and
the active marker-6 configuration carry forward recovery adapter
`ffb-3.4.0-bb2025-r2.2`, engine `ffb-3.4.0-bb2025-m3d.1`, recovery format 2,
replay format 1, frozen `bb2025-human-2026-09-08.1` catalog, and browser
`/browser/v2`. The R4.1 format-3 record is explicitly a non-accepted candidate,
so it was not selected.

The actual isolated source was marker 6 on MariaDB `11.8.9-MariaDB-ubu2404`,
with the configured `ffb-server:3.4.0-m6.1` artifact identity recorded in the
[sanitized manifest](sanitized-manifest.json). Java was Temurin
21.0.11+10-LTS, Maven 3.9.9, Node 26.7.0, and npm 11.19.0. Application and
database endpoints remained loopback-only (`127.0.0.1:22231` and
`127.0.0.1:23316` respectively).

## Result and retained data

Private backup location: `.tools/r5-backups/marker6-r2.2-20260922T000001Z`.
It is ignored by Git and contains the raw SQL dump and full manifest; neither is
published. Its complete manifest validated the 4,102,566-byte payload and its
SHA-256. The public [sanitized manifest](sanitized-manifest.json) has only
runtime/schema/format identity, configuration hashes, fixture-ID hashes and
payload/manifest hashes.

The retained backup contains a non-terminal, format-2 native recovery snapshot
at a server-owned decision boundary (generation 87) and a completed format-2
match document. Fixture selection reads only the non-terminal flag and native
snapshot presence, never a decision, dice, native snapshot, account, invitation,
or replay value. Both fixture IDs are represented only by SHA-256 in reviewable
evidence.

The adapter requires application write quiescence: the marker-6 application
container was stopped for the backup while the database remained running, then
the same application container was restarted. No database or backup volume was
reset, deleted, truncated, recreated, or repointed. Existing data and retained
synthetic evidence were not changed.

## Commands and checks

```powershell
# Focused manifest contracts (5 passed): success, corruption, truncation,
# unsupported runtime, destination reuse, and failed-output handling.
node --test tools/test/r5-backup.test.mjs

# Quiesced, create-only backup. The application was stopped first with Docker
# and restarted after the manifest validation; the adapter itself never stops it.
$env:R5_DATABASE_CONTAINER = 'ffb-m6-simplification-db-20260918'
$env:R5_APPLICATION_CONTAINER = 'ffb-local-m6-server-1'
$env:R5_BACKUP_DESTINATION = '.tools/r5-backups/marker6-r2.2-20260922T000001Z'
$env:DOCKER_EXE = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
node tools/r5-backup.mjs

# Real-database backup check, with no database write.
node --input-type=module -e "import { validateManifest } from './tools/r5-backup-lib.mjs'; await validateManifest('.tools/r5-backups/marker6-r2.2-20260922T000001Z/manifest.json'); console.log('PASS')"

# Toolchain characterization.
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 info

# Browser regression/build (both passed): 64 tests; Vite retains its existing
# >500 kB main-chunk advisory.
npm.cmd test --prefix browser-client
npm.cmd run build --prefix browser-client

# Recovery characterization (the direct Maven retry passed all 9 tests).
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test RecoverySessionTest,RecoveryScenariosTest -Offline
C:\Users\jaken\AppData\Local\Programs\apache-maven-3.9.9\bin\mvn.cmd -pl ffb-statetest -am '-Dtest=RecoverySessionTest,RecoveryScenariosTest' '-Dsurefire.failIfNoSpecifiedTests=false' test
```

The first attempted output, `.tools/r5-backups/marker6-r2.2-20260922T000000Z`,
failed closed before a dump because the initial fixture check assumed a recovery
field that format 2 does not expose at the envelope level. It has no complete
manifest and is deliberately not reused. The corrected contract recognizes the
existing non-terminal native checkpoint without inspecting private payload data.

`node --test tools/test/r5-backup.test.mjs` passed four times (five tests each);
the second run preceded the successful backup. The browser unit suite passed 64 tests
and its TypeScript/Vite build passed with the pre-existing chunk advisory.
`git diff --check` passed. The backup adapter itself performed the real MariaDB schema/runtime/fixture preflight,
single-transaction dump, byte/hash validation and manifest revalidation. The
restarted application container reported `running`, and loopback TCP port 22231
was reachable.

## Scope and limits

`containers/local/backup-restore.md` specifies the manifest, full backup
boundary, failure rules and exact restore prerequisites. It fails closed on an
unknown schema object/table/runtime format, a running application, a reused
destination, incomplete output and checksum mismatch. It binds configuration by
public-file hashes and names existing secret/ADC references without reading or
recording their values.

The first sandboxed repository-tool Maven attempt reached Surefire but ClassGraph
could not resolve `ffb-statetest` (`AccessDeniedException`), so its nine setup
errors are not counted. The direct host Maven retry above then passed all nine
selected recovery tests (5 `RecoverySessionTest`, 4 `RecoveryScenariosTest`, zero
failures/errors). No restore/import, browser gameplay, or process-kill recovery
run was added to this slice: it changes an operational Node adapter and no Java
or browser behavior. The real-database check is backup creation/validation only;
restore remains the next separately authorized operation in a new empty,
compatible environment.

## Slice 2: separate restore and pre-auth verification

The retained Slice 1 backup was restored once into the separately named
`ffb-r5-restore2_database` volume. Before import, the adapter found no tables in
the destination, required the application to be stopped, rejected storage aliasing
against the source database and backup mounts, and matched the exact retained
`ffb-server:3.4.0-m6.1` image ID and MariaDB `11.8.9-MariaDB-ubu2404` version.
It performed no schema conversion. The restore began at `2026-09-22T05:01:24.539Z`
and ended at `2026-09-22T05:01:28.260Z`: **3716.604 ms** for raw import only.

The direct pre-traffic comparison passed: schema marker 6, complete table set,
account/scope/membership/invitation/retry rows, frozen teams, paused recovery
checkpoint (generation 87), completed result/replay, and every compatibility
identifier are included in the byte-identical 4,102,566-byte SQL re-dump. The
payload SHA-256 is `af162593e32e3e9c284c1b5f19192f3bacc140c0faeb37ce6b45b95f00525511`;
the table and recovery-identifier digests are published in the
[sanitized restore evidence](sanitized-restore.json). This equality is separate
from any later intentional decision/retry continuation.

The current profile hard-codes the approved local marker-6 loopback database
endpoint. For the live phase, the preserved source containers were stopped without
altering their volumes, then the separate restored containers bound only
`127.0.0.1:23316` and `127.0.0.1:22231`. Docker had to attach the restore database
to its non-internal, non-published bridge in addition to the isolated bridge for
Docker Desktop to activate the loopback mapping. The restored application uses the
unchanged image and source profile; no recovery/engine/catalog/replay code changed.

An obsolete legacy `/admin/cache` health check was removed from the restore Compose
definition because the marker-6 v2 host deliberately returns 404 for it. The live
route was verified after the container-only recreation, through the existing
loopback nginx forwarding path (`127.0.0.1:22232`): a real Chromium page with a
real loopback origin submitted unauthenticated browse, setup mutation, and identical
retry requests. Each returned only `AUTHENTICATION_REQUIRED`; no bearer, account,
fixture, match state, or private data was sent or retained. This is live service
evidence, not a mocked browser response.

```powershell
# Focused contracts: 9 passed.
node --test tools/test/r5-backup.test.mjs tools/test/r5-restore.test.mjs tools/test/r5-live-browser-unauth.test.mjs

# Marker-6 local-profile and v2-route characterization: 8 passed.
C:\Users\jaken\AppData\Local\Programs\apache-maven-3.9.9\bin\mvn.cmd -pl ffb-server -am '-Dtest=LocalServerMainTest,BrowserV2RouteTest' '-Dsurefire.failIfNoSpecifiedTests=false' test

# Browser protocol/decoder regression: 64 passed.
npm.cmd test --prefix browser-client
```

The direct restore is retained privately at
`.tools/r5-restores/marker6-r2.2-20260922T000003Z`; failed create-only restore
attempt records and all pre-existing containers/volumes are retained as well. A
temporary local browser artifact was served from a separate system temporary path
on `127.0.0.1:5000`, using a generated local-dev configuration and no tracked-site
rewrite. It is not a published artifact or a cloud service.

### Remaining live acceptance prerequisite

This computer-use session has no available Chrome, Edge, or in-app browser surface,
so two independent authenticated browser sessions for the original fixture users
could not be opened. Consequently, the following required live steps remain
unperformed: each user's authorized paused-decision and completed-result/replay
projection; authenticated non-member read/mutation/retry denial; reconciliation of
the retained exact request with durable before/after comparison; and the intentional
authoritative continuation of the paused decision. No mocked signed-in response was
substituted, no identity/provider/account was selected, and no user token or private
fixture value was requested or recorded. This is not another M4 gate or a
public-service readiness claim.
