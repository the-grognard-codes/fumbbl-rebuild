# R3-D local transport and configuration boundary

**Final status, 2026-09-21: R3-D closed for its defined scope.** The historical
local-only limits below were followed by authorized hosted installation,
transport checks and owner DEV/PROD acceptance. See
[final PROD evidence](prod-install-20260921.md) and the R3-D section of the
[workstream reference](../../m4-workstreams-reference.md). Recovery operations,
backup/restore, capacity, R3-E and general public-service readiness are not claimed.

The 2026-09-20 [local nginx-backed connection](local-nginx.md) now routes the
`local-dev` browser through a running loopback proxy. That follow-up retains the
local WS exception and does not establish hosted TLS or full R3-D completion.

2026-09-19, Windows 11. Bounded implementation, **not full R3-D acceptance**.

Subsequent owner-approved nginx work and local TLS evidence are recorded in
[the proxy follow-up](proxy.md). The results below describe the preceding slice.

## Changed contracts

- The marker-6 v2 upgrade accepts only raw `/browser/v2`, no query (even empty),
  one exact allowed Origin and one loopback Host with the configured base port.
  Foreign/missing/duplicate Origin and foreign Host fail before the protocol or
  authentication. Malformed HTTP may receive Jetty 400; unavailable routes 404;
  policy-denied upgrades 403. All player/browse/watch operations share this route.
- Native local connectors, including the retained diagnostic runtime, bind
  127.0.0.1 by default. Docker forwarding requires an explicit configuration
  flag and `/.dockerenv`; existing Compose publications remain host-loopback-only.
  The flag is not a substitute for checking the Docker publication.
- Local marker-6 authentication pins the approved DEV project and rejects the
  Firebase emulator environment override. Cross-project issuer/audience tests
  exercise DEV-to-PROD and PROD-to-DEV rejection before account creation.
- Browser initialization and hosting generation share profile validation:
  project, auth domain, game endpoint and emulator cannot be mixed. Hosted page
  origins are exact HTTPS DEV/PROD origins. Local pages require HTTP loopback.
  DEV/PROD game endpoints remain unavailable, including arbitrary WSS endpoints.

No engine, catalog, replay/recovery format, schema, identity link, grant policy,
or mutation scheduling changes. No credentials, database/backup volumes or
retained synthetic evidence were modified. No running service was restarted.

## Commands and results

Toolchain: Temurin 21.0.11+10, repository Maven 3.9.9 with target profile/offline
cache; Node 26.7.0, npm 11.19.0; Vite 8.2.2, Playwright 1.62.1,
Windows Chrome 153.0.8010.48. Node is newer than the browser package's declared
24.x range; a pinned Node 24 CI run remains necessary for that environment.

```powershell
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-server -Test BrowserV2RouteTest,BrowserV2TransportPolicyTest,LocalServerMainTest,FirebaseV2PrincipalAuthenticatorTest -Offline
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-server -Offline
npm.cmd test --prefix site
node deployment/firebase/scripts/verify-environment.mjs
npm.cmd run test:browser --prefix site
git diff --check
```

- Focused Java: 16 tests, zero failures/errors/skips. Initial sandbox runs failed
  reading the cached google-oauth-client JAR during compilation. The identical
  offline command passed with approved execution outside the sandbox.
- Full Java regression: common 174 passed; server 217 discovered, 215 passed,
  two skipped, zero failures/errors. Skips: Marker6SchemaTest and
  V2PreparationJdbcTest, because isolated MariaDB test configuration was absent.
  No persistence code changed; this is not new database acceptance evidence.
- Site contracts: four passed. Environment verifier passed.
- Browser: one three-context scenario passed (13.812 s): home/away/spectator,
  shared updates, read-only spectator controls and reconnect. Includes TypeScript
  checking and Vite production build. Authentication and WebSocket responses are
  synthetic doubles, not live Firebase or a MariaDB-backed runtime.
- Diff whitespace check passed (Windows LF/CRLF warnings only).

Fixtures: Jetty tests use ephemeral loopback ports and synthetic masked frames;
the principal verifier uses mocked Firebase Admin responses and an in-memory
directory. No token or personal account data is recorded. Browser mock config
uses the actual local-dev profile and synthetic match/account IDs.

## Loopback check and retained limits

The Jetty route tests bind their listener to 127.0.0.1 and exercise real HTTP
upgrades. The transport policy tests assert the native bind default. The site
contract checks marker-6 Compose's `127.0.0.1:22231:22227` publication and absence
of host networking. Retained diagnostic Compose uses `127.0.0.1:22227:22227`.
Before any later authorized restart, inspect `docker compose ... config` and
`docker port <container>`: require those host-loopback mappings, never 0.0.0.0
or `[::]`. For a native process, inspect `Get-NetTCPConnection -State Listen`
and require LocalAddress 127.0.0.1 for the selected port. Do not restart an active
match merely to make this check; drain or retain its compatible runtime.

No live Docker bind/publication or external network reachability claim is made
by this run. `/.dockerenv` is a launch guard, not a Docker networking guarantee.

The earlier service's TLS-required profiles do not establish TLS for this v2
runtime. It currently rejects non-local startup. Remaining R3-D work is a
reviewed hosted authority/TLS configuration for v2, real TLS handshake tests,
and insecure-listener/forwarded-header tests against that configuration. Do not
enable hosted game URLs to bypass this gap. No public deployment, public-service
readiness, R3-E acceptance or full-R3 completion is claimed.
