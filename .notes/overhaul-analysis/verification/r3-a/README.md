# R3-A principal, scope and credential-lifecycle evidence

Implemented locally on 2026-09-17. This is an authorization-model contract
slice for the isolated `game-service`; it does not deploy, provision an
identity provider, alter credentials, or change the BB2025 engine, catalog,
replay schema, MariaDB schema-4 data, or retained recovery evidence.

## Implemented boundary

- `TokenVerifier` remains the provider-neutral verification boundary. Firebase
  verification establishes only issuer, subject and expiry.
- `PrincipalDirectory`, `Principal`, `ApplicationScope` and the H2-backed
  `AccountStore` map a verified `(issuer, subject)` to an internal account ID.
  Email, display name, client roles and client UID fields are not inputs.
- A newly authenticated account receives the owner-approved `PLAYER` and
  `SPECTATOR` scopes. `OWNER` and `ADMINISTRATOR` require a separate
  server-side grant. Any combination of the four scopes is representable.
- Account disablement, provider-identity revocation, token expiry and a
  missing player scope reject authentication or subsequent valid
  create/join/chat/leave operations. Recipient snapshot delivery also checks
  player authorization before reading a session.
- Existing game-service account links are initialized once with the new default
  lifecycle and player/spectator grants; no existing link is remapped.
- `SafeAuditFields` contains only fixed event/outcome values. The service does
  not log authentication input or exceptions carrying client data.

The durable account store is the game-service's isolated H2 store, not the
authoritative FUMBBL MariaDB/JDBC schema-4 database. No schema-4 migration was
run or changed.

## Verification

Host tooling: Eclipse Temurin OpenJDK `21.0.11+10` and Apache Maven `3.9.9` on
Windows 11 amd64. The H2 fixtures are JUnit `@TempDir` files; TLS tests generate
an ephemeral PKCS12 keypair and use a local test `TokenVerifier`. No Firebase
token, account, email address, production database, browser profile or cloud
service is used.

| Command | Result |
| --- | --- |
| `mvn -f game-service/pom.xml '-Dtest=AccountStoreTest,TlsSessionTest' test` | 13 tests passed: four principal/lifecycle contracts and nine local TLS WebSocket tests. |
| `mvn -f game-service/pom.xml clean verify` | 21 tests passed, 0 failures/errors/skips; shaded JAR built. |
| `git diff --check` | Passed after the implementation. |

`AccountStoreTest` proves issuer-plus-subject isolation; positive and negative
checks for player, spectator, owner and administrator scopes; expiry,
disabled-account and revoked-identity rejection; and zero internal accounts
after stale or malformed identities are rejected. It also proves the generated
audit fields do not contain fixture bearer token, raw provider UID, email,
internal account or private team text. `TlsSessionTest` proves a player scope
revoked after authentication closes the local TLS WebSocket before `create`
can establish a session. Existing Firebase verifier tests remain in the full
suite for signature, issuer/audience, disabled-user and revocation handling.

## Limits and pending owner choice

There is deliberately no browser or public admin route, no scope-granting
command, no service credential, no account-deletion workflow, and no live log
review in this slice. The `grantScope`, `revokeScope`, `disableAccount` and
`revokeIdentity` methods are a server-only persistence seam, not an operator
runbook or authorization mechanism.

Before an administrative-user feature is exposed, the recommended decision is
an owner-bootstrap, audited, strongly reauthenticated management path with a
separate recovery process; it must not let a player self-assign
`OWNER`/`ADMINISTRATOR`, and it should record actor, target internal account,
operation and time without logging bearer tokens, raw Firebase UIDs, email or
private game/team data. The owner still needs to select that operation path and
the account-deletion/retention and credential-review cadence before R3-A can
be considered an operational/public-service gate.
