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

Current servers require **marker 10**. With the game service stopped and a restorable backup available, verify a single marker row at version 9. Apply the additive job-availability migration with the operator connection. Verify marker 10, then start the matching server and check its read-only schema validation. Existing matches acquire scheduling metadata from their committed recovery state. [010-computer-job-availability.sql](../../ffb-server/src/main/resources/local-schema/010-computer-job-availability.sql)

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
