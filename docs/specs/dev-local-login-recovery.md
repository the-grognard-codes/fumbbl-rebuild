# Dev-local login recovery — 2026-10-26

Issue: [#363](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/363).
The owner reported a disconnected Create a Game page after refreshing the page
and ADC. This is a local runtime incident, separate from the skill-prompt UI.

## Evidence

- The Java shared communication thread threw `OutOfMemoryError: Java heap space`
  while restoring a computer match through `BoundedJsonStorageCodec.strictUtf8`,
  `JdbcRecoveryRepository.findJournal` and `SetupApplication.restore`.
- Docker's HTTP health check remained green while the actual v2 request probe
  failed with `Proxy response timeout`.
- Stopping the computer dispatcher/workers and restarting only the verified
  review server restored the proxy initial/reconnect probe and the owner's
  existing authenticated browser session. Saved teams/current games loaded.
- Mounted ADC verification passed. No credential rotation or account changes
  were performed. A transient old authentication error remained in the page
  while reconnect was pending; it cleared when the connection completed.
- The first ad hoc direct-socket check omitted a request and is not evidence of
  the failure. The supported proxy probe reproduced it. Final direct and proxy
  checks send an actual read-only `browse` request and both return
  `AUTHENTICATION_REQUIRED` as expected without credentials.

## Local mitigation applied

- Preserved all database volumes, match records, teams and working-tree edits.
- Kept one review server/database, Hosting and proxy. Reused the already built
  image; no feature-source changes or remote deployment.
- Recreated the local server with a 2 GiB heap instead of 768 MiB, using ignored
  `.tools/dev-local-runtime.yaml` as an additional Compose override.
- Restarted the existing computer daemon with `--max-matches 1` instead of four.
  Updated its managed PID and recorded mitigation metadata in
  `.git/dev-local-state.json` so normal shutdown can stop it.
- Removed the temporary authentication diagnostic override; no token logging or
  bearer capture was used.

The ordinary `tools/dev-local.mjs` startup still uses its checked-in capacity
defaults. A future normal rebuild/restart will replace these local overrides.
Permanent recovery memory/capacity and command-thread health work is tracked in
#363; this mitigation is not presented as that implementation.

## Verification and remaining gaps

`node --test deployment/game-service/proxy/live-local-test.mjs` failed before
recovery and passed after restart and again after mitigation. It exercises the
assembled local client and real server authentication gate on initial connection
and reconnect. Final direct/proxy read-only v2 requests also passed with AI active.
`node tools/match-review-start.mjs` confirmed mounted ADC and container health.
The owner's existing browser shows saved rosters, current games, AI availability
and enabled creation controls after reconnect. No game was created as a test.

The reduced AI worker authenticated, restored a match and yielded while waiting
for its human coach. No renewed out-of-memory error was observed during the
verification window. This is a short operational check, not a long-duration soak.
Some other retained matches return `RECOVERY_CORRUPT` and appear temporarily
unavailable. Those records were left untouched; their diagnosis/repair remains
part of #363. No matches were discarded or overwritten.

Local ignored logs: `.tools/dev-local-login-repro.log`,
`.tools/dev-local-login-recovered.log`, `.tools/dev-local-login-final-proxy.log`
and `.tools/dev-local-computer-recovery{,.err}.log`.
