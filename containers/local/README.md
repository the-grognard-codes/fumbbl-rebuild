# Local browser runtime

Use `node tools/dev-local.mjs --start` (or `--restart` for a managed stack)
for the current V2 application at <http://localhost:5000/play>. See
[deployment usage](../../deployment/README.md) for prerequisites and service ownership.
V2 uses existing Firebase authentication and the separately provisioned browser schema.
No remote publication is performed.

The dev-local server restarts on a nonzero exit, including a fatal engine
worker failure. A JVM heap OOM writes a private `java-<unique-id>.hprof` before
exiting. Find the files on the host at `.tools/dev-local/heap-dumps/`, or set
`DEV_LOCAL_HEAP_DUMP_DIR` to an absolute host path. This bind mount survives a
container restart or recreation. On Linux, create the directory with mode
`0700` and owner UID/GID `10001:10001` before starting. If the mount is
unavailable, the server logs a warning and uses `/tmp`. Docker clears that
temporary filesystem on restart. Keep dumps private and archive or remove
them after analysis.

Docker probes `/health/engine` from inside the server container. The endpoint
returns 204 while the worker is alive and has progressed in the last 10 seconds
and 503 otherwise. Once started, Docker checks every five seconds and reports
unhealthy after three failures. The restart policy acts on process exit; a
stall alone is reported as unhealthy.

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
