# R3-B invitation, player-slot and reconnect evidence

Implemented locally on 2026-09-17. This bounded slice adds durable H2 invitation
records and local React setup controls to the isolated `game-service` proof. It
does not alter the BB2025 engine, catalog, replay schema, MariaDB schema-4 data,
retained evidence, credentials or deployment.

## Accepted local contract

- `create` produces a cryptographically generated, 128-bit lower-case
  hexadecimal bearer code. It is transferable: the first available,
  authenticated account to submit it gets slot 1. It is not recipient-bound.
  Pending codes expire after one hour and are stored as `PENDING`, `ACCEPTED`,
  `EXPIRED` or `REVOKED` records with only internal account ids and timestamps.
- An account has one live connection and one active session. A concurrent
  connection is rejected at authentication; a connected player trying to join
  any session receives `already_in_session`.
- A code for an existing full session gives an available third account
  `session_full`; an unknown code gives `session_not_found`. A disconnect keeps
  the member's private slot reserved, and a later same-account join restores
  that slot with an ordered `reconnected` event.
- The connected creator can refresh an unclaimed invitation, immediately
  revoking its old code and issuing a replacement. Before activation, that
  creator can release a claimed but disconnected opponent; this clears slot 1,
  revokes the old code and issues a replacement. The setup page exposes each
  action only in its applicable creator state.
- Invitation records are durable, but sessions and chat remain process-local.
  The implementation purges a session only when both slots are disconnected for
  one hour and a later create/join invokes purge. A session with either
  participant connected never expires under that policy. A process restart does
  not recreate a game from a surviving invitation: it fails closed as
  `session_not_found`.

The recorded 2026-09-17 clarification supersedes the earlier 15-minute pending
and 24-hour abandonment values in the owner-decision table: both intervals are
one hour for this local policy.

## Verification

Host tooling: Eclipse Temurin OpenJDK `21.0.11+10`, Apache Maven `3.9.9`,
Node `26.7.0`, npm `11.19.0`, Google Chrome `153.0.8010.48`, Windows 11 amd64.
All fixtures are in-memory `SessionManager` instances, local ephemeral TLS/H2,
or mocked Firebase/WebSocket browser fixtures; no Firebase credential, browser
profile, MariaDB database, backup volume or cloud service is used.

| Command | Result |
| --- | --- |
| `mvn -f game-service/pom.xml '-Dtest=InvitationPolicyCharacterizationTest,InvitationStoreTest,TlsSessionTest' test` | 16 tests passed: three invitation-policy characterizations, three durable invitation-record contracts and ten local TLS WebSocket tests. |
| `npm.cmd test --prefix site` | 5 tests passed, 0 failures. The Node 26/Windows CRLF loader issue in the test fixture was corrected without changing application behavior. |
| `npm.cmd run test:browser --prefix site` | 3 tests passed, 0 failures. The mocked two-browser flow verifies creator-only refresh, disconnected-opponent release and replacement-link rendering. |
| `mvn -f game-service/pom.xml clean verify` | 28 tests passed, 0 failures, 0 errors, 0 skipped; shaded local service jar built. Maven emitted its existing shade overlap warnings. |
| `npm.cmd run check --prefix site` | 10 public-site inputs checked successfully. |

`InvitationPolicyCharacterizationTest` covers transferable-code acceptance,
cross-session rejection, full/unknown code failures, concurrent reconnect
ordering and the exact one-hour process-local purge boundary.
`InvitationStoreTest` covers persistence, expiry and immediate code revocation.
`TlsSessionTest` uses independent creator, opponent and replacement peers to
cover creator-only release, old-code rejection and replacement-player
acceptance, as well as duplicate connection and reconnect state delivery.

## Known limits

The database record and process-local player slot cannot be atomically recovered
across a process crash. A stored invitation without its in-memory session fails
closed and does not resume this isolated session proof. The accepted R2 runtime
separately provides compatible format-2 durable engine recovery; R3-B does not
yet route invitations into, or identify members against, that runtime. Scheduled
cleanup, engine abandonment, capacity/retention, spectator visibility, mutual
save/resume, operational runbook, backup/restore and public-service readiness
remain outside this R3-B local slice.
