# Isolated authoritative match review stack

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
   `nginx -p <instance-prefix> -c nginx.conf -s quit` command. Set
   `LOCAL_GAME_BACKEND_PORT=22234` and run
   `node deployment/game-service/proxy/start-local.mjs`. Assemble local-dev
   Hosting with `npm run assemble --prefix deployment/firebase --
   --environment local-dev` and reload `http://localhost:5000/play`.

Existing open sockets must reconnect after the proxy switch. The previous
runtime and volumes remain available on 22231. This review stack is local and
does not change the hosted DEV or PROD service. Never run the provision script
against a populated target or point the new container at the retained database.
