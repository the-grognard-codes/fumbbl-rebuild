# Local nginx-backed marker-6 connection

The `local-dev` Hosting build now selects:

`browser -> ws://127.0.0.1:22232/browser/v2 -> nginx -> 127.0.0.1:22231 -> existing Java container`

This is the loopback-only diagnostic WS exception, **not TLS or hosted readiness**.
No certificate is generated or trusted and no DEV/PROD endpoint is enabled.
The separate `local` Auth Emulator profile is unchanged. The Java publication
remains loopback-only and directly reachable by local tools; nginx is not a
security boundary against other processes on this computer. The `local-dev`
browser profile rejects the direct-backend URL and never falls back to it.

## Start and use

Keep the existing marker-6 Java/MariaDB stack and Hosting emulator running. From
the repository root, on this Windows workstation:

```powershell
node deployment/game-service/proxy/start-local.mjs
npm.cmd run assemble --prefix deployment/firebase -- --environment local-dev
```

The launcher defaults to the existing `.tools/nginx-1.30.5/nginx.exe`. On another
machine set `NGINX_LOCAL_BINARY` to an already installed compatible nginx binary.
It does not download/install software, create credentials, start/restart Java,
or touch database/backup volumes. Each launch creates a fresh ignored
`.tools/local-nginx-*` prefix. Existing prefixes/logs are retained. A busy port
fails instead of stopping another process. The process starts with no visible
console and is not installed as an auto-start OS service.

If Hosting is not already running:

```powershell
firebase emulators:start --only hosting --project dev-moles-under-the-pitch-org
```

Reload `http://localhost:5000/play` (or `http://127.0.0.1:5000/play`). Existing open
tabs retain their old socket until reloaded. Reauthenticate if needed, then use
Resume play or Watch. Browser network inspection should show port **22232**.
Do not export request frames, tokens or HAR files. No Java restart is necessary.

The launcher prints the exact instance prefix and a targeted `nginx -p ... -c
nginx.conf -s quit` command. On this workstation invoke the same nginx executable
with that command to stop only that instance. Do not use a machine-wide process
kill. A stop disconnects proxy clients; retain pending intents and reconnect
after starting the proxy again. Reloading the page is not permission to replay
an uncertain mutation with a new request ID.

## Boundary

Only raw `/browser/v2` is forwarded. All queries (including empty `?`), escaped
path aliases, foreign Host, missing/foreign/duplicate Origin, non-GET requests,
and Authorization/Cookie credential carriers are rejected. Absent route families
return 404; recognized forbidden requests return 403, or parser-level 400.
Allowed Origins are exactly HTTP localhost/127.0.0.1 on ports 5000 and 5173.
Host is exactly `127.0.0.1:22232`. nginx forwards the fixed backend Host
`127.0.0.1:22231`, preserves the validated Origin, strips forwarded identity
headers, and disables upstream retries and buffering. Authentication, scopes,
membership, legality and single-worker mutation remain Java responsibilities.

Logs contain only status, byte count and elapsed time. Request error logging is
disabled to avoid raw URL/credential leakage. Do not enable request/debug logs.
The WS timeout remains 360 seconds, above the existing Java idle policy. No new
heartbeat, abandonment or recovery semantics are introduced.

## Checks

```powershell
$env:NGINX_TEST_BINARY=(Resolve-Path .tools/nginx-1.30.5/nginx.exe).Path
node --test deployment/game-service/proxy/local-test.mjs
node --test site/test/play-client.test.mjs
node deployment/firebase/scripts/verify-environment.mjs
# Requires the running proxy, Java service and assembled Hosting emulator:
node --test deployment/game-service/proxy/live-local-test.mjs
```

The isolated proxy test uses synthetic HTTP/WebSocket handshakes and a backend
double, never credentials or retained storage. The live Chrome check verifies
the served endpoint and reaches the real Java authentication gate through nginx
twice, without signing in or changing a match. Real signed-in create/join/play/
watch through the new proxy still needs the owner's manual check. TLS, long idle,
certificate renewal and deployment acceptance are separate evidence.
