# R3-C.1 spectator-consent compatibility foundation

Implemented locally on 2026-09-18. This is the first small, separately
reviewable foundation for the authorized spectator feature. It adds no
spectator route, browser control, runtime deployment, database migration run,
credential, provider configuration or public exposure.

## Durable policy

`SpectatorConsent` records only a match identifier, a monotonic generation,
the home and away pre-activation choices, and a locked flag. Both players must
choose allow before activation; activation locks both values permanently. Only a
locked, mutually allowed record is eligible for discovery. A player role may
change only its own choice before activation. A non-player, stale compare-and-
swap, missing record, or post-lock change fails closed.

The consent service rejects a non-player role before it reads the record. The
future runtime still has to establish that `home` or `away` is the requesting
authenticated member before it may call this internal persistence boundary.

The JDBC repository uses short, compare-and-swap transactions over the planned
`ffb_match_spectator_consent` table. Commit acknowledgement failures are
reported as unknown rather than treated as a denied or accepted update.

`006-spectator-consent.sql` is intentionally not wired into `LocalSchema`: the
accepted R2 marker-5 database and its active format-2 matches must not be
upgraded in place. The future `/browser/v2` runtime must use a separate copied
database, marker 6 and compatible principal-to-membership mapping.

## Verification

Host tooling: Eclipse Temurin OpenJDK `21.0.11+10`, Apache Maven `3.9.9`,
Windows 11 amd64. Tests use an in-memory repository and mocked JDBC
connections; no MariaDB database, volume, Firebase credential, browser profile
or cloud service is touched.

| Command | Result |
| --- | --- |
| `mvn -pl ffb-server -am '-Dtest=SpectatorConsentTest,JdbcSpectatorConsentRepositoryTest' '-Dsurefire.failIfNoSpecifiedTests=false' test` | 7 tests passed, 0 failures, 0 errors, 0 skipped. |
| `mvn -pl ffb-server -am test` | `ffb-common`: 174 tests; `ffb-server`: 182 tests; 0 failures and 0 errors. |
| `mvn -pl ffb-statetest -am '-Dtest=RecoveryApplicationTest,RecoverySessionTest,RecoveryScenariosTest,RecoveryArtifactInspectionTest,SpectatorProjectionTest' '-Dsurefire.failIfNoSpecifiedTests=false' test` | 14 passing tests across recovery and restored-session projection; `RecoveryArtifactInspectionTest` has one existing skipped optional fixture, with 0 failures and 0 errors. |

Known limits: this is not a watcher implementation. `/session/v1` and
`/browser/v1` retain their existing behavior; the R3-C spectator route remains
explicitly unavailable. The remaining work is the separately versioned
authenticated R2 runtime, principal/membership bridge, marker-6 copied-storage
workflow, neutral live projection, read-only browse/watch protocol, browser UI,
recovery compatibility and R4 capacity limits.
