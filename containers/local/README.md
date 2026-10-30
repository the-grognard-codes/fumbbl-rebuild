# Local browser runtimes

Use `node tools/dev-local.mjs --start` (or `--restart` for a managed running stack)
for the complete current V2 application at <http://localhost:5000/play>. See
[deployment usage](../../deployment/README.md) for prerequisites and service
ownership. V2 is the standard runtime, with existing Firebase authentication and
the separately provisioned browser schema. No remote publication is performed.

## V1 development diagnostics

V1 remains development-only tooling. `server.ini` explicitly selects
`local.browser.v2.enabled=false` with `server.local=true`. The fixture uses two
browser bearer tokens and is independent of product matches. Its in-memory
scenario resets when the diagnostic JVM restarts.

From the repository root in PowerShell, after Docker Desktop is running:

```powershell
./containers/local/setup.ps1
docker compose -f containers/local/compose.r1.yaml up -d --build --wait
# Real browser WebSocket fixture check; run once after fresh startup:
docker compose -f containers/local/compose.r1.yaml exec -T server java -cp 'FantasyFootballServer.jar:lib/*' com.fumbbl.ffb.server.local.BrowserLocalProbe
npm run dev --prefix browser-client
```

Open <http://localhost:5173>. The diagnostic server is published only at
`127.0.0.1:22228`; select that `/browser/v1` endpoint in the diagnostic UI. Tokens
live under ignored `.secrets/` and must not be printed or committed. The V1
container health check probes HTTP reachability without changing fixture state.

```powershell
docker compose -f containers/local/compose.r1.yaml stop
docker compose -f containers/local/compose.r1.yaml start --wait
```

Stop/start retains named volumes. Startup never drops existing data. An empty
V1 database receives only browser saved-team, prepared-match and recovery tables;
existing partial/unversioned/unknown schemas fail closed. V2 schemas are separately
provisioned and verified without migration writes during normal startup.

Neither runtime exposes desktop transport, administration, static-file or launch
services. Other routes return 404. Browser-owned services persist product match
results and recovery. V1 process-restart evidence does not establish V2 recovery.

## Validation and references

- [Browser client](../../browser-client/README.md)
- [Current match review](match-review.md)
- [Runtime compatibility history](runtime-compatibility.md)
- [Browser-only design and evidence](../../docs/specs/browser-only-support.md)

The other versioned Compose profiles and verification records describe earlier
browser-runtime experiments. Use the supported dev-local command for current V2
work, and the explicit diagnostic profile above for V1.
