# Local browser runtime

Use `node tools/dev-local.mjs --start` (or `--restart` for a managed stack)
for the current V2 application at <http://localhost:5000/play>. See
[deployment usage](../../deployment/README.md) for prerequisites and service ownership.
V2 uses existing Firebase authentication and the separately provisioned browser schema.
No remote publication is performed.

## V2 validation

The isolated acceptance profile uses `compose.v2-acceptance.yaml`, separate database
and backup volumes, and game-server port 22235. `node tools/acceptance-local-server.mjs
--start` builds the server, verifies/provisions its schema, and creates synthetic
acceptance identities with existing authorized Firebase credentials. Its token file
is ignored and must never be committed or printed.

With dev-local browser services stopped, `node tools/coach-match-acceptance.mjs
--start-browser` serves the production bundle through the acceptance server.
Set `COACH_ACCEPTANCE_TOKENS_FILE` to the returned ignored path and run
`node tools/coach-match-acceptance.mjs --test` for live play, completion and replay.
Set `COACH_ACCEPTANCE_PROCESS_KILL=1` to additionally exercise isolated V2 process
restart recovery. Stop only these browser helpers with `--stop-browser`, then
start dev-local for manual review. The acceptance helper never deletes volumes.

## Retired diagnostic storage

V1 startup profiles, bearer-token setup, fixtures and executable callers are removed.
The former `local.browser.v2.enabled=false` selection is rejected. Neither the
endpoint retirement nor normal V2 startup migrates or deletes diagnostic data.

Existing Docker named volumes remain where Docker stores them, with their original
Compose project labels. Historical projects are `ffb-local-m0b`, `ffb-local-r1`,
`ffb-local-r2` (format-1 trial), and `ffb-local-r2b`. Their `<project>_database` volumes hold
saved teams, prepared matches and recovery; `<project>_backup` holds backups. Inspect
actual volume names and labels with `docker volume ls` and `docker volume inspect`.
No retirement command prunes volumes, starts an old profile, or imports its data.
Existing ignored `containers/local/.secrets/` files are also untouched.

Any later data migration or disposal requires separate review and authorization.
Old configuration and forensic instructions remain available in Git history.

## References

- [Browser client](../../browser-client/README.md)
- [Current match review](match-review.md)
- [Runtime compatibility history](runtime-compatibility.md)
- [Retirement inventory](../../docs/specs/v1-retirement-inventory.md)
