# R3-D DEV nginx handoff follow-up

Subsequent native profile and integrated Linux results: [native/Linux follow-up](native-linux.md).

2026-09-19. Owner approved nginx TLS termination alongside the JVM. Implemented
as an opt-in DEV Java profile and isolated loopback nginx candidate; nothing was
installed on Compute Engine, published, restarted, or reconfigured externally.
Earlier uncommitted R3-D changes were preserved and extended in place.

## Changes and boundary

- nginx candidate: exact DEV SNI/Host/Origin, TLS 1.2/1.3, only `/browser/v2`,
  no query credentials or Authorization/Cookie carrier, no forwarded-header
  trust, no retry/load balancing, buffering off, bounded connection/time limits.
- Java opt-in `local.browser.v2.proxy.profile=dev` accepts the matching public
  Host and Origin, retains the approved DEV Firebase identity verifier, and
  rejects container wildcard binding. Default local behavior stays unchanged.
- Candidate nginx listener stays on 127.0.0.1:24443. No hosted client URL was
  enabled. A native VM marker-6 JDBC/runtime profile is still absent; the retained
  local launcher's database guard was not relaxed to invent one.
- [Runbook](../../../../deployment/game-service/proxy/README.md) records IP/DNS
  reuse, resource measurements, certificate reuse, nginx-only renewal reloads,
  match drain/compatible-runtime requirement and rollback limits. Old deployment
  scripts are untouched and clearly marked as targeting the older H2 service.

## Commands and results

```powershell
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-server -Test BrowserV2RouteTest,BrowserV2TransportPolicyTest,LocalServerMainTest -Offline
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-server -Offline
$env:NGINX_TEST_BINARY=(Resolve-Path .tools/nginx-1.30.5/nginx.exe).Path
$env:OPENSSL_TEST_BINARY='C:/Program Files/Git/usr/bin/openssl.exe'
node --test deployment/game-service/proxy/test.mjs
git diff --check
```

- Focused Java: 10 passed, no failures/errors/skips; actual Jetty loopback upgrade
  accepts the DEV proxy Host/Origin and rejects local/PROD Origins and wrong Host.
- Full Java: common 174 passed; server 219 discovered, 217 passed, two skipped,
  no failures/errors. Skips remain Marker6SchemaTest and V2PreparationJdbcTest
  because no isolated MariaDB test target was configured. No persistence code
  or storage was changed, and no new database acceptance is claimed.
- nginx test: passed, three accepted upstream upgrades (including explicit
  TLS 1.2 and 1.3), 22 rejected cases. Missing/foreign/duplicate Origin, foreign
  Host, Authorization/Cookie credentials, empty/nonempty queries and encoded
  path fail without reaching the upstream. Six unavailable paths return 404.
  Foreign/absent SNI fails TLS. TLS 1.1 receives a server protocol-version alert;
  plaintext cannot upgrade. Incoming forwarded headers do not reach the backend.
  Every access-log line matches only numeric status/bytes/time fields.
- Final retained synthetic fixture: `.tools/r3d-proxy-sW0fnK/` (generated config,
  one-day self-signed test certificate/key, status-only access log). The test
  stops its own nginx process, retains fixtures, and starts no system service.
- Whitespace check passed, with normal Windows LF/CRLF warnings.

Windows 11, Temurin 21.0.11+10, Maven 3.9.9 target/offline profile, Node 26.7.0,
nginx Windows 1.30.5, OpenSSL 3.5.6. nginx downloaded from the official
`https://nginx.org/download/nginx-1.30.5.zip` into ignored `.tools/`; archive
SHA256 `e5afe28b6a50bec92c478bfe1a4d3758206b80fb77159277bc5c4e88955c2a35`.
This records the downloaded artifact, not independent signature verification.

Initial nginx test execution hit Windows sandbox file access restrictions;
approved execution outside the sandbox was used. Subsequent test failures found
and corrected hostname hash bucket sizing, the Windows prefix temp directory,
and explicit denial by the default virtual host. The final test above passed.
No existing credentials were changed; generated certificates are test-only.

## Not yet proved

The nginx TLS check uses a Node HTTP upgrade double; Jetty is verified separately.
This is not full nginx-to-engine-to-MariaDB or live Firebase acceptance. Windows
nginx is not a Linux performance/capacity result. Linux package validation, the
native VM runtime/storage profile, resource headroom under load, long-idle and
renewal-reload behavior, external backend-port isolation and authorized DEV
cutover remain outstanding. PROD proxy/runtime configuration is not introduced.
Browser/engine code did not change in this follow-up, so their earlier passing
checks were not rerun. No public-service or full R3-D completion is claimed.
