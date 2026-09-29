# Isolated authoritative match review stack

## Daily dev-local command

From the repository root, run one of:

```powershell
node tools/dev-local.mjs --start
node tools/dev-local.mjs --stop
node tools/dev-local.mjs --restart
```

`--start` assembles the latest local-dev Firebase Hosting site, rebuilds and
starts the isolated Docker game server and database, validates or renews the
game server's Google Application Default Credential, starts the local WebSocket
proxy and Hosting emulator, and checks both browser routes. Open
<http://localhost:5000/play>. `--restart` stops and repeats that sequence;
`--stop` shuts down only these review processes and containers, retaining their
database volumes. The script records the browser processes it owns in the
repository's shared `.git/dev-local-state.json` file so it can stop the exact
instances from any checkout of this repository. It also recognizes the former
`.tools/dev-local-state.json` file when upgrading an already running session.
It refuses to take over an unrelated process on port 5000 or 22232.

The one-time review stack provisioning below must already have been completed.
Docker Desktop, Node.js, the Firebase CLI, and the local nginx binary must be
installed. The command reuses the existing mounted secret files; it does not
print or copy their contents into the repository. A Google sign-in opens only
if both the mounted ADC and standard gcloud ADC need renewal. A normal local
Firebase Hosting start does not require a separate Firebase CLI sign-in.

Hosting output is saved under `.tools/dev-local-hosting*.log`. If startup fails,
fix the reported condition and rerun `--start`; the next run stops any browser
processes recorded by the interrupted run before starting them again.

The review stack uses `compose.match-review.yaml`, MariaDB port 23317, game-server
port 22234, and separate Docker volumes. The retained `ffb-current-dev` game
container, its four activated matches, and its database/backup volumes stay
untouched. The browser's local-dev endpoint remains `127.0.0.1:22232` through
the local nginx proxy. To review this build, start that proxy with
`LOCAL_GAME_BACKEND_PORT=22234`; the default 22231 continues to select the
retained runtime.

The Compose file requires the existing local ADC and four secret *file paths*
through `M6_ADC_FILE`, `M6_DB_PASSWORD_FILE`, `M6_DB_ROOT_PASSWORD_FILE`,
`M6_ADMIN_PASSWORD_FILE`, and `M6_COACH_PASSWORD_FILE`. Set them from the
corresponding mount sources of the retained containers. Do not copy their
contents into this worktree. `docker compose -f
containers/local/compose.match-review.yaml config --quiet` validates the
paths before creating anything.

1. Start only the review database with `docker compose -f
   containers/local/compose.match-review.yaml up -d database`. Check its
   health and verify the target volume is `ffb-match-review_database`.
2. Once, run `node tools/match-review-provision.mjs`. It checks the exact source
   and target containers, distinct volumes, empty destination, and schema
   marker 7. It streams a consistent database snapshot directly into the
   review container, retains accounts/scopes/saved teams, and clears match
   documents, membership, invitations, consent and recovery in the review copy
   only. If import or cleanup is interrupted, inspect the target and provision
   a fresh empty review volume; the script refuses to overwrite populated data.
3. Build and start the review game container with `docker compose -f
   containers/local/compose.match-review.yaml up -d --build server`. Verify
   health and the loopback 22234 listener before changing the proxy.
4. Stop only the known local nginx instance bound to 22232 using its recorded
   process ID and verified command line. Set
   `LOCAL_GAME_BACKEND_PORT=22234` and run
   `node deployment/game-service/proxy/start-local.mjs`. Assemble local-dev
   Hosting with `npm run assemble --prefix deployment/firebase --
   --environment local-dev` and reload `http://localhost:5000/play`.

Existing open sockets must reconnect after the proxy switch. The previous
runtime and volumes remain available on 22231. This review stack is local and
does not change the hosted DEV or PROD service. Never run the provision script
against a populated target or point the new container at the retained database.

## Authentication preflight

`tools/dev-local.mjs` invokes `tools/match-review-start.mjs` as part of the full
startup. That helper starts the existing isolated database and game containers,
checks the exact ADC mount, and reuses it while valid. If it has expired, it
checks the standard gcloud ADC file, opens `gcloud auth application-default login`
only when both credentials need renewal, installs the validated credential into
the review mount with the DEV quota project, restarts only the review server,
and verifies Firebase Auth access before reporting ready. It never touches the
retained `ffb-current-dev` runtime. Run it on its own only when checking the
review containers without building or serving the browser site.

Before a signed-in review, run `node tools/match-review-adc-check.mjs` from the
repository root. It checks the **exact ADC file mounted by the review server**,
including refresh-token validity and Firebase Auth access for the dev project.
It prints only a status code; it does not print credentials or bearer tokens.
`Review Firebase ADC: OK` is the passing result. `REAUTHENTICATION_REQUIRED`
means the mounted user credential must be renewed before coaches can connect.
`SESSION_EXPIRED` identifies Google's `invalid_rapt` session-control subtype.
The HTTP container healthcheck does not exercise this credential.

The mounted file can differ from gcloud's standard ADC file. A successful
`gcloud auth print-access-token` checks the separate Cloud CLI credential and
does not establish that the game server can authenticate users. After renewing
the mounted ADC, restart only `ffb-match-review-server-1`, rerun the preflight,
and reconnect an already signed-in browser. See [ADC reauthentication](adc-reauthentication.md)
for renewal behavior and recovery considerations.
