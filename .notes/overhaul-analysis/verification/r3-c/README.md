# R3-C route-projection and host-boundary evidence

Implemented locally on 2026-09-17. This slice documents and tests the isolated
`game-service` host's only exposed route. It does not expose spectator, admin,
result, replay or legacy functionality, change Firebase configuration, deploy a
service, modify the BB2025 engine/catalog/replay schema, or touch MariaDB,
backup volumes or retained evidence.

## Contract

The complete matrix is [the game-service public API boundary](../../../../game-service/public-api.md).
The exact player WebSocket route is `/session/v1`; the host's catch-all servlet
returns `404` for every other path. A normal HTTPS request to the known WebSocket
route returns `405`, rather than silently becoming an HTTP API. The existing
upgrade handler rejects missing/foreign origins and query credentials with `403`
before token verification.

The test inventory covers root, a nested player/spectator attempt, spectator,
admin, support, result, replay, legacy and FUMBBL-named paths. Each is `404` and
performs zero token verifications. The service does not proxy any request.

## Verification

Host tooling: Eclipse Temurin OpenJDK `21.0.11+10`, Apache Maven `3.9.9`,
Windows 11 amd64. The fixture starts an ephemeral local TLS Jetty server, creates
a temporary H2 account/invitation database and uses a local test verifier. No
Firebase credential, browser profile, MariaDB database, backup volume or cloud
service is used.

| Command | Result |
| --- | --- |
| `mvn -f game-service/pom.xml '-Dtest=TlsSessionTest' test` | 11 tests passed, 0 failures, 0 errors, 0 skipped. |
| `mvn -f game-service/pom.xml clean verify` | 29 tests passed, 0 failures, 0 errors, 0 skipped; shaded local service jar built. Maven emitted its existing shade overlap warnings. |

Known limits: this is a local host-boundary contract, not authorization to expose
non-player routes. The R2 recovery runtime remains separately isolated; this
matrix does not establish a public route to its engine recovery, result or replay
artifacts. Public-service readiness is not claimed.
