# Marker-6 live loopback acceptance

This run is local only. It uses the separately provisioned marker-6 target and
the DEV Firebase project; it neither deploys a Hosting artifact nor exposes a
public game endpoint. Do not start the retained marker-5 server or point this
profile at its database/backup volumes.

## Preconditions

- The target container `ffb-m6-simplification-db-20260918` is running on its
  loopback-only `127.0.0.1:23316` mapping.
- `ffb_m6_runtime` exists only in that target with DML access to `ffb_local`.
- The local Java process can use valid DEV Firebase ADC. The ADC file is never
  copied into the repository or image; Compose mounts it read-only at runtime.

## Start the local runtime

```powershell
$env:M6_ADC_FILE = "$env:APPDATA\gcloud\application_default_credentials.json"
docker compose -f containers/local/compose.marker6.yaml up -d --wait server
node deployment/game-service/proxy/start-local.mjs
node deployment/firebase/scripts/assemble.mjs --environment local-dev
firebase emulators:start --only hosting --project dev-moles-under-the-pitch-org
```

Open `http://localhost:5000/play` in three separate browser profiles. Use one
real DEV Firebase identity per profile. The player that creates the game shares
the invitation link with the joining player. After activation, the third profile
uses **Spectate** / **Watch Home vs Away** in the same `/play` lobby.

The **Build a Human team** panel is the first step in **Your game**. Choose
`Load basic 11-lineman starter`, validate it, and save it; the server remains
the authority for catalog, budget and roster validation. For an import-path
check, the equivalent raw draft is
`browser-client/examples/human-starter-draft.json`. There is deliberately no
Orc sample: the frozen catalog currently accepts Human only.

Check that the watcher gets the same board/state updates, has no usable game
mutation controls, and loses the view on sign-out or access loss. Test a player
disconnect/reconnect and ensure the watcher reconnects and reloads the shared
state. Record only internal match IDs and result codes; do not put Firebase
tokens, UIDs, email addresses, saved-team documents, invitation codes, or ADC
contents in evidence.

## Stop

```powershell
docker compose -f containers/local/compose.marker6.yaml stop server
```

Stopping the server is safe; it retains the marker-6 target and its distinct
backup volume. Never use `down --volumes`, database reset, or any destructive
command as part of this acceptance.
