# Account skill use preferences: schema 8

Schema marker **8** introduced account skill use preferences. Current builds also
require [schema 9 for recovery journaling](recovery-journal-schema.md). Startup
checks the marker, account preference table, columns, primary key, enum modes,
approved use-case constraint and account foreign key without changing the database.
Desktop and the legacy local v1 profile retain their existing schema contracts.

For an existing marker-7 database, stop the game service and take a restorable
database backup before an explicitly authorized rollout. Verify that
`SELECT version FROM ffb_local_schema` returns exactly one row containing `7`.
Apply [008-skill-use-preferences.sql](../../ffb-server/src/main/resources/local-schema/008-skill-use-preferences.sql)
to that database with its established operator connection. The migration creates
only `ffb_v2_skill_use_preferences` and advances the marker to 8; it preserves
accounts, teams, matches, recovery and replay data. Verify the marker and start
the matching server artifact, whose read-only schema verification must succeed.
Do not point an older marker-7 server at the upgraded database.

MariaDB DDL commits implicitly. If interrupted, inspect the table and marker
before retrying; do not automatically drop a partial table or downgrade the
marker. Restore the backup if a rollback is required.

For isolated review/acceptance databases, the explicit `schema-bootstrap`
Compose service creates marker 8 for an empty target and upgrades an existing
verified marker-7 target. It retains the existing protections against populated
marker-5/6 migration and against targeting the retained database. The one-time
`tools/match-review-provision.mjs` copy accepts a marker-7 or marker-8 source,
upgrades only its verified empty review destination to 8, and preserves account
preferences when copying from 8. Runtime startup never invokes these migrations.
Game cleanup supports 7 and 8 and preserves the preference rows on 8.

Each account/use-case row stores `always-use` or `always-ask`. Missing rows use
the approved inventory defaults; no backfill is necessary. A per-case upsert
prevents one device overwriting other cases changed on another device. Writes
commit before an accepted response. The server reads the durable account policy
at the next native decision; updating preferences never answers a pending prompt.

The request family is `skillUsePreferences`, version 2, using the existing
authenticated socket. `operation: "load"` accepts only the envelope and operation.
`operation: "update"` adds exactly `useCase` (the descriptive lower-kebab key)
and `mode` (`always-use` or `always-ask`). Unknown, duplicate and extra fields
are rejected. Responses contain only the envelope, `code: "ACCEPTED"` and the
normalized 18-key `preferences` map. Errors use the existing error family.
Account identity comes exclusively from the verified, currently authorized PLAYER
principal. Spectator-only and computer-service credentials cannot read or write
the account policy API. Native code resolves role ownership through durable
match membership; an unowned/computer seat uses defaults. Replays retain recorded
decisions and do not load account preferences.
