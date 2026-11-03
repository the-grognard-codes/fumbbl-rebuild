# Browser client and public team builder

The authenticated V2 application provides saved teams, invited match preparation,
setup and live play, spectating, results and private replay. Public routes remain
`/teambuilder` and `/play/...`; the sole game transport is `/browser/v2`.

## Run locally

From the repository root:

```powershell
node tools/dev-local.mjs --start
# Rebuild and restart a managed stack:
node tools/dev-local.mjs --restart
```

Open <http://localhost:5000/play>. See [deployment usage](../deployment/README.md)
for credentials, Docker services, and ownership. Node 26 and the pinned Java 21
build toolchain are required. Vite development previews remain available through
`npm run dev`; the default entry directs users to the authenticated local app.

## Verification

```powershell
npm test --prefix browser-client
npm run build --prefix browser-client
npm run test:interaction --prefix browser-client
```

The build produces the V2 product bundle. The supported dev-local command runs
mandatory browser validation before starting services. Real authenticated
play/result/replay validation uses `test/real-server-match.mjs` and the isolated
V2 acceptance profile documented in [local runtimes](../containers/local/README.md).

## V1 retirement

The old bearer-token diagnostic UI, synthetic movement/choice fixtures and their
V1 demos are retired. Useful rejection, retry, reconnect, choice and renderer
coverage is maintained through V2 tests. Shared setup/catalog/saved-team decoders
and stored format versions are independent of transport version and remain supported.

See the [retirement inventory](../docs/specs/v1-retirement-inventory.md) for
capability dispositions and replacement checks. Earlier M1-M3 protocol and
exercise documents describe historical behavior, not supported startup commands.
No existing diagnostic database or backup volume is migrated or deleted.
