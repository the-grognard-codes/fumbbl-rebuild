# Local nginx-backed play path — 2026-09-20

Owner follow-up: after deploying/reloading this slice, the owner reported signed-in
play through a full turn working successfully. This is owner-reported functional
evidence, not a captured TLS/public-service test. Subsequent preparation/default-
setup changes have separate evidence in `../setup-defaults-20260920/README.md`.

Implemented the owner-authorized local proxy connection only. DEV/PROD remain
unchanged/unavailable in browser profiles. No engine/catalog/recovery/replay,
database, identity, concurrency or credential change. Existing dirty-tree work
and retained fixtures were preserved. Java and MariaDB were not restarted.

## Configuration and observed routing

- `local-dev` generated config and browser validation select exactly
  `ws://127.0.0.1:22232/browser/v2`; direct port 22231 is rejected by that profile.
- New `deployment/game-service/proxy/local.nginx.conf`: loopback 22232, exact
  Host/path/Origin, query/header-credential denial, fixed upstream Host and
  loopback 22231 target. Forwarded headers stripped, retries/buffering off.
- Fresh running prefix: `.tools/local-nginx-mMwUd0/`; nginx PID 6704.
  Read-only listener inspection confirmed `127.0.0.1:22232` (nginx) and
  `127.0.0.1:22231` (Docker host publication, PID 31160).
- Existing `ffb-local-m6-server-1` remains on `ffb-server:3.4.0-m6.1`, started
  `2026-09-20T20:44:40.918183164Z`, unchanged by this slice.
- Served Hosting config was read from `http://127.0.0.1:5000` and verified to
  contain the new endpoint. The actual Chrome WebSocket used port 22232.
- The isolated launcher refuses an occupied port with EADDRINUSE; a second
  invocation was checked and did not replace the existing nginx process.

This retains the **local-only plaintext WS exception**, not hosted TLS parity.
The backend is still directly reachable by local processes; no claim that nginx
is the sole possible local ingress. No certificate/trust-store changes occurred.

## Commands and results

Windows 11, Node 26.7.0, npm 11.19.0, nginx 1.30.5, Chrome 153.0.8010.50,
Playwright 1.62.1, Vite 8.2.2. Node 24 remains the declared browser CI baseline;
this workstation's Node 26 result does not substitute for that CI gate.

```powershell
$env:NGINX_TEST_BINARY=(Resolve-Path .tools/nginx-1.30.5/nginx.exe).Path
node --test deployment/game-service/proxy/local-test.mjs
node --test site/test/play-client.test.mjs
node deployment/firebase/scripts/verify-environment.mjs
node deployment/game-service/proxy/start-local.mjs
npm.cmd run assemble --prefix deployment/firebase -- --environment local-dev
node --test deployment/game-service/proxy/live-local-test.mjs
node --test site/test/play-browser.test.mjs
git diff --check
```

- Proxy contract: 1 passed, zero skipped; four accepted Origin variants and 24
  denied cases, with exact upstream receipt count proving denied requests never
  reached the backend double. Status-only logs contained no test secret, URL,
  origin, forwarded address or credential field. Successful fixture retained at
  `.tools/local-proxy-test-l3gQGa/`.
- Site contracts: 4 passed; environment verifier passed. DEV/PROD mixing and
  direct-backend fallback remain rejected.
- Assembly: TypeScript and Vite passed; local Hosting artifact rebuilt. No
  cloud deploy command was run. Existing Hosting emulator served the new config.
- Live browser-to-nginx-to-Java: 1 passed. Two independent native WebSocket
  connections each submitted only a synthetic unauthenticated `browse` request
  and received version-2 `AUTHENTICATION_REQUIRED` with the correlated request
  ID and no match list. This proves the real protocol round trip, not successful
  Firebase sign-in. No token/account/team data was read or recorded.
- Live nginx status-only log recorded both protocol connections as 101; a
  separate `curl.exe` upgrade also received `Server: nginx` and 101.
- Existing three-context UI regression: 1 passed (2.990 s), covering shared
  player/spectator board, read-only controls, updates and reconnect. Its identity
  and WebSocket are doubles; it does not establish live game play through nginx.
- Whitespace check passed; existing Windows LF/CRLF warnings only.

The first proxy test was blocked by Windows sandbox file access. The identical
test passed with authorized host process access; its earlier fixture is retained.
The initial live Chrome fixture used an intercepted document response and failed
with `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` before contacting nginx. The
final test uses the actual local Hosting document with scripts/assets blocked,
preserving real network provenance without disabling browser protections or
initializing Firebase. Initial failed checks are not acceptance evidence.

No Java runtime or persistence code changed in this slice (only a ChangeList
entry), so Maven/database suites were not rerun and no new recovery/database gate
is claimed. Real signed-in create/join/play/watch through nginx, long idle,
TLS/renewal, hosted cutover and public-service readiness remain unverified here.
See [local operation instructions](../../../../deployment/game-service/proxy/LOCAL.md).
