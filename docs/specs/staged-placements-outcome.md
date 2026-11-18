# Staged placements implementation outcome

Issue [#556](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/556) implements [ADR 0008](../adr/0008-staged-placements.md) on `codex/556-live-staged-placements`.

## Delivered behavior

- Setup placements, swaps, reserve moves, and saved formations update the resident board. Solid Defence, Quick Snap and Charge selections also stage. Solid Defence and Quick Snap movements and the High Kick placement remain open until their confirming action.
- The acting coach receives a live acknowledgement with current legal actions. The opponent and spectators receive one best-effort `stagedPlacement` frame with `baseRevision`, `stageSeq`, and the current squares of players touched during the stage. The browser applies it using the separate stage sequence and the computer coach can act again at the same revision.
- The setup limit is 100 accepted adjustments and the kick-off limit is 50 per stage. At the limit, an illegal setup or Solid Defence formation reverts and confirm remains available. The worker owns request deduplication and the adjustment budget.
- Confirmation records one revision, snapshot, transcript record, and recovery update. A resident reconnect sees current staged positions. Recovery restores the last checkpoint and resets the stage. Checkpoint version 7 and runtime `ffb-3.4.0-bb2025-r5.4` explicitly reject older live artifacts with `RECOVERY_UNSUPPORTED`.
- The forced-confirmation routine checks the current setup, then tries the first saved formation or the role template, then completes a legal formation from the line of scrimmage. It has no clock trigger. Tests cover each roster size from one through ten.

## Self-review and validation

Self-review checked the published message, request retry, checkpoint, recovery, replay, cap, and confirmation boundaries. The computer transport test caught a coach-side decoder that rejected live staging fields. The worker now uses the live projection decoder and still requires a coach seat. Checkpoint load and compaction fixtures now generate durable gameplay decisions instead of using placement loops to grow history.

| Check | Evidence |
| --- | --- |
| Setup-heavy engine test | 1,000 attempted adjustments accepted 100 and rejected 900. The decoded recovery artifact stayed byte-for-byte identical at 161,545 bytes through staging. One confirmation produced one revision, event, and transcript record and brought the artifact to 184,727 bytes. |
| Kick-off engine tests | Solid Defence selection and 50 adjustments stayed outside recovery. The 50th illegal formation reverted. Quick Snap and High Kick stayed open until explicit finish. |
| Persistence and publication tests | Confirm was the sole checkpoint. Opponent and spectator received identical compact frames. Resident reconnect returned the overlay and restore returned the checkpoint board. |
| Browser | 548 unit tests passed. Chromium verified live opponent and spectator pitch markers, plus existing setup drag-and-drop and kick-off controls. Vite and TypeScript built successfully. |
| Computer player | The transport regression confirmed two requests at the same confirmed revision. The full suite had 55 passes and one persistence-worker timeout. The timeout case and the staging regression both passed on a focused rerun. |
| Maven suites | The broad rerun had 855 server test passes, 15 skips, and one JDBC partial-handshake timeout. The JDBC test passed on its focused rerun. The earlier Firebase DNS timing failure reproduced on unchanged main. The focused reactor install passed all modules with 45 tests passing and four opt-in database tests skipped. |
| Dev-local | `node tools/dev-local.mjs --start --quick` built the current branch. Hosting, the Java engine, the review database, and the computer daemon started. The real browser reached the Java proxy authentication gate on initial connect and reconnect. |

## Review considerations

- Staged fan-out uses one existing batched JDBC authorization read to preserve next-push account, scope and membership revocation. The overlay path performs no checkpoint I/O, and publication has no provider call or per-recipient state load. The authorization read is a departure from the no-JDBC publication line in ADR 0008.
- Quick Snap offers exclude trap-door destinations because a move there can roll dice and trigger a reaction. Browser V2 here has no trap-door stadium setup.
- The authenticated Bogruk soak stopped before match creation on two attempts. Redacted server diagnostics showed a Firebase provider socket timeout. The 1,000-attempt engine workload is a controlled comparison point for the November 15 soak's 46.8 MB observation. A matched authenticated soak remains outstanding.
- The dev-local service was left up for manual testing with redacted Firebase diagnostics enabled in the running container. Existing local game data was retained. Older incomplete matches require the deployment-time cleanup described in ADR 0008.
