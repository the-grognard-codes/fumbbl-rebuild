# Marker-6 target-only provision and copy

`tools/m6-provision-copy.mjs` copies an accepted marker-5 database into a
separately provisioned, empty destination, then applies the marker-6 identity,
membership, bearer invitation/retry and v2 saved-team tables. Spectator consent is not created:
authenticated watch access defaults to allowed. It never creates, clears,
truncates, deletes, or reuses a destination volume. It refuses a non-empty
target and records evidence using create-only files.

Before it can mutate the target, the command inspects both containers. The
specified names must resolve to distinct running container IDs, each with one
`/var/lib/mysql` mount, and those mounts must have different inspected sources.
It also creates the evidence directory and a create-only preflight record before
the import. Use a path that does not already exist; retained evidence must never
be overwritten or reused.

Set the source and target container names explicitly. The target must already be
a new, empty MariaDB container/volume approved for this v2 runtime. Do not point
the target variable at retained R1/R2/trial/evidence storage. The source is the
explicitly selected retained marker-5 R2 reference and is read only.

```powershell
$env:M6_SOURCE_CONTAINER = 'approved-marker5-source'
$env:M6_TARGET_CONTAINER = 'new-empty-marker6-target'
$env:M6_EVIDENCE_DIR = '.notes/overhaul-analysis/verification/r3-c2/marker6-local-run-1'
node tools/m6-provision-copy.mjs
node tools/m6-provision-copy.mjs verify
```

The command is intentionally not run by tests or startup. A fresh evidence
directory is required for every run. During the dump it compares the source R2
document fingerprints before and after the snapshot, refusing an active source.
It verifies the copied documents before the marker-6 DDL, records marker-6 table,
column and index evidence, and binds the manifest to inspected container IDs and
MariaDB data mounts. `verify` checks all of those bindings, the marker version,
the schema evidence, and source/target document fingerprints without writing to
either database. Passing this local copy check does not authorize a public
deployment or prove Firebase, browser, recovery or capacity acceptance.

The consolidated runtime is selected by `local.browser.v2.enabled=true` with
`local.browser.v2.firebase.project` set explicitly in a separate target-only
server configuration. Point its JDBC URL at the copied marker-6 target, never
the retained source. Application DB permissions and Firebase Admin credentials
must already be approved/configured; the copy command does not copy MariaDB
system users or provision provider credentials. Startup verifies marker 6 before
serving and binds loopback. See the [current route matrix](../../browser-client/public-api-v2.md)
and [local consolidation evidence](../../.notes/overhaul-analysis/verification/r3-c-simplification/README.md).
