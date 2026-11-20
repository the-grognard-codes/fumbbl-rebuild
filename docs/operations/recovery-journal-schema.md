# Durable recovery and computer job availability

Schema marker **9** adds compact
recovery records to the marker-8 account preferences schema. Runtime startup
verifies the storage contract without running migrations. The journal stores
recorded native continuation and history tails; public replay formats and native
BB2025 rules do not change.

For an existing marker-8 database, stop the game service and take a restorable
backup before an authorized rollout. Verify exactly one marker row containing 8.
Apply [009-recovery-journal.sql](../../ffb-server/src/main/resources/local-schema/009-recovery-journal.sql)
with the established operator connection. The additive migration records each
existing recovery generation as its base-checkpoint generation and creates the
journal table; it does not delete or rewrite existing match artifacts, teams or
accounts. Verify marker 9 before continuing.

Current servers require **marker 10**. Roll out the migration and server
together.

1. Stop the game service. Verify that `ffb_local_schema` contains a single marker
   row at version 9 and take a restorable backup.
2. Apply [010-computer-job-availability.sql](../../ffb-server/src/main/resources/local-schema/010-computer-job-availability.sql)
   using the operator connection. Verify the marker is 10 and
   `ffb_match_recovery.computer_work_until_epoch_ms` exists as a nullable
   `BIGINT UNSIGNED`.
3. Start the marker-10 server and verify that its read-only schema check passes.
   Check dispatcher registration for active computer matches and backfill errors.

The server commits the availability column with each full checkpoint or journal
append. `0` excludes suspended and abandoned jobs, a pending resume proposal sets its expiry
in epoch milliseconds, and `Long.MAX_VALUE` marks a job with no scheduling
deadline. A `NULL` value marks an unclassified legacy row. Registration includes
activated legacy jobs and classifies up to four heads per request, guarded by
their recovery generation. If another write wins, the job stays in that
snapshot and the next registration reads the authoritative availability.
A legacy row with a decoded preparation document and inconsistent computer
membership is set to `0`. If classification fails, the server logs the match
ID and keeps the job eligible with `NULL` availability. Registration retries
the same generation after a five-minute cooldown, so an unreadable row alone
does not trigger the one-second inventory continuation. A subsequent successful
checkpoint or journal append sets availability from the new head. Registration
uses stored membership for classified rows. The load path verifies it against
the frozen seat and rejects inconsistencies, such as after a manual data repair.
Schema 10
preserves the saved artifact's recovery format. In-progress matches need
recovery version 7 (r5.4) to resume. Finish or reset in-progress matches with
older checkpoints before the upgrade. Older checkpoints return
`RECOVERY_UNSUPPORTED`.

To roll back, stop the marker-10 server. Use the pre-upgrade marker-9 backup,
or another verified marker-9 database, before starting the older server.
Backup restoration loses writes made after the snapshot, so retain the
marker-10 database for reconciliation and get the maintainer's approval for
the recovery point. Verify the marker and the older server's schema check.

MariaDB DDL commits implicitly. After interruption, inspect the column, journal
table and marker before retrying; never automatically drop partial storage or
downgrade the marker. Restoring a backup is a separate operator action.

For isolated review/acceptance databases, the explicit `schema-bootstrap` service
creates or upgrades verified supported targets. It preserves the existing guard
against populated marker-5/6 migration. The one-time review provisioner accepts
marker 7 through 10 sources and upgrades only its verified empty review destination.
The ordinary server process never migrates a database. The local cleanup tool
recognizes journal rows as game data and preserves account preferences; this
feature does not authorize running cleanup against user games.

Journal append and compaction use transactional generation compare-and-swap.
Successful responses follow durable acceptance. Recovery checks the complete
contiguous chain between base and head, including the missing-all-records case,
and refuses corrupted or incomplete history rather than silently returning an
older state. See [ADR 0004](../adr/0004-durable-recovery-journal.md).
