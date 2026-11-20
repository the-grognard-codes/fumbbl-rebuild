# Staged placements implementation outcome

Issue [#556](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/556) implements [ADR 0008](../adr/0008-staged-placements.md) on `codex/556-live-staged-placements`.

## Delivered behavior

- Setup placements, swaps, reserve moves, and saved formations update the resident board. Solid Defence, Quick Snap and Charge selections also stage. Solid Defence and Quick Snap movements and the High Kick placement remain open until their confirming action.
- The acting coach receives a live acknowledgement with current legal actions. The opponent and spectators receive one best-effort `stagedPlacement` frame with `baseRevision`, `stageSeq`, the current squares of players touched during the stage, and the current kick-off selection. During participant selection, opponents and spectators see picks and deselections on the pitch. The browser applies it using the separate stage sequence and the computer coach can act again at the same revision.
- The setup limit is 100 accepted adjustments and the kick-off limit is 50 per stage. At the limit, an illegal setup or Solid Defence formation reverts and confirm remains available. When default setup is enabled the base is the deployed formation. With manual setup the base can be an empty half. If reverting leaves it illegal, the worker deploys a legal fallback so the coach can confirm. The worker owns request deduplication and the adjustment budget.
- While adjustments are pending, the server rejects unrelated gameplay commands with `INVALID_OPTION` and keeps the board, selection, sequence and retry history. Setup confirmation, Solid Defence confirmation, and ending a movement event commit positions. Confirming a participant selection passes the validated group to the engine. Declining that selection or conceding discards pending adjustments.
- Confirmation records one revision, snapshot, transcript record, and recovery update. A resident reconnect sees current staged positions. Recovery restores the last checkpoint and resets the stage. Checkpoint version 7 and runtime `ffb-3.4.0-bb2025-r5.4` explicitly reject older live artifacts with `RECOVERY_UNSUPPORTED`.
- The forced-confirmation routine checks the current setup, then tries the first saved formation or the role template, then completes a legal formation from the line of scrimmage. It has no clock trigger. Tests cover each roster size from one through ten. With three or fewer available players, the fallback places them at team-relative x=12 and y=4 through 10, on the Line of Scrimmage in the Centre Field band.

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

## Independent review follow-up

- `SetupStaging` owns stage selection, validation, request deduplication and forced confirmation. `StagedPlacements` owns the temporary board and `StagedPlacementMessage` encodes it. Durable and staged moves share placement validation. Both paths ask the ruleset-selected setup mechanic for legality.
- Live fan-out uses the worker's authorized viewer enrollment and checks token expiry. Disconnect, observed provider revocation and definitive authorization denials remove the affected enrollment. An expired token cannot receive a staged frame. A database-only revocation is observed on the next authorization read. Staged frames perform zero JDBC reads and are dropped when the request budget expires.
- Only durable decisions count toward the 1,024-decision guard. Setup and kick-off adjustments use their respective stage limits. Tests cover the interaction at the guard boundary.
- All public recoverable constructors write version 7. The recovery reader accepts only version 7 / r5.4 and preserves the manual-setup option on restore. Completed replay and administrative access to retired matches remain available.
- Quick Snap excludes trap-door destinations because a move there can roll dice and trigger a reaction. Browser V2 currently has no trap-door stadium setup.

The clean server suite exercised 875 tests with 15 opt-in skips. Three fixtures still expected staged decisions to count or survive restore. After updating them, all nine tests in their class passed. The full native-state run exercised 300 tests with seven skips. Its depleted-roster fixture tried to move a player to an already occupied legal starting square. The corrected saved-formation suite passed. A final focused reactor install passed 38 tests covering current recovery, placement, policy and memory. The separate authorization and publication run passed all 83 tests, including the new request-denial regressions. All 548 browser unit tests passed. Two of 56 computer tests timed out or failed scheduling assertions under concurrent load. Both passed on a focused rerun. The dev-local quick build compiled the production client and passed the real proxy connection and reconnect check. That review run used local Firebase budgets of 1,700 ms per operation, 300 ms for DNS, and 450 ms for connect, with redacted diagnostics enabled. The existing 2,000 ms request ceiling and local database were retained.

During fixture migration an additional native issue surfaced on a regular dodge reroll. After a restore, declining the reroll could skip the failed dodge and continue the blitz. The existing paused-blitz regression now pins a rush reroll and verifies cancellation, resumption and retained target. The regular dodge recovery issue remains open.

## Checkpoint and result sizes after review

The authenticated dev-local measurements use the production journal reader to reconstruct the current recovery envelope. The decoded size of the stored checkpoint plus journal is a separate number because journal entries repeat some recovery state. Decoded sizes count UTF-8 bytes before compression. The last column shows the compressed storage footprint.

| Authenticated match | Last measured state | Reconstructed recovery | Decoded checkpoint plus journal | Compressed checkpoint plus journal |
| --- | --- | ---: | ---: | ---: |
| `dde51f7e-a33c-30fb-b58b-4e4b8dbf132f` | Active, revision 146 | 8,520,583 | 9,506,038 | 407,561 |

The first authenticated run reached staging sequence 22 at revision 2 and entered normal play. Checkpoint requests later exhausted their JDBC deadlines. At revision 112 (generation 113) the reconstructed envelope was 6,656,815 bytes. After a restart the same match advanced to revision 146 (generation 147). That first run ended without a verified terminal result.

A separate seeded real-engine cohort played to natural full time. These three runs used mocked server communication, so their transcript sizes omit native model-sync payloads. Each setup stage included 100 accepted edits followed by ten rejected edits. The recovery bytes and journal cursors stayed identical across each unconfirmed stage.

| Seed | Match and score | Final revision | Accepted setup edits | Final recovery | Completed replay/result |
| --- | --- | ---: | ---: | ---: | ---: |
| 55601 | Human 0-4 Orc | 715 | 1,200 | 28,820,426 | 26,215,639 |
| 55602 | Orc 0-3 Human | 816 | 1,000 | 32,550,261 | 29,630,562 |
| 55603 | Human 0-2 Human | 703 | 800 | 27,961,700 | 25,436,875 |

An additional real-engine run enabled native model-sync capture through `ServerCommunication`. Human versus Orc, seed 55605, reached full time at 0-2 in revision 293. The replay contained 294 events and 957 native sync entries. It measured **13,428,635 bytes** as a completed result and **16,187,741 bytes** as a terminal recovery envelope. At revision 2, 1,000 setup attempts produced 100 accepted edits and 900 rejections. Recovery remained byte-identical at 213,922 bytes until confirmation advanced the revision to 3. The driver preferred an offered end-turn action after eight ordinary decisions in 27 turns. External storage and transport were mocked. An earlier unrestricted native-capture probe exhausted the 768 MiB test JVM at revision 311 and supplied no terminal measurement.

These are individual match observations. The November 15 runaway reached 46.8 MB from repeated durable placements. The before/after comparison within each stage isolates the storage effect of removing those placements from durable history. Match duration, play decisions and native sync volume still affect the final size.

## Second review follow-up

Quick Snap, Charge and Solid Defence now broadcast each accepted participant selection and deselection. The acting coach, opponent and spectators see the same participant markers before confirmation. An unrelated durable gameplay command returns `INVALID_OPTION` and preserves the pending board for every viewer. An explicit concession discards the pending changes and publishes the last confirmed positions at full time.

All 550 browser unit tests and the production client build passed. Headless Chromium covered selection, deselection, late frames and reconnect, including the opponent and spectator displays and desktop and phone controls. A focused run of 89 Java tests passed, covering placement, kick-off presentation, publication and recovery.

A fresh database hosted authenticated match `741e905d-c088-3f69-a5b9-ea7cde61520c`. Two coaches played both halves using 32 ordinary end-turn actions and reached natural full time at 0-0, revision 41. The opponent and a spectator saw edits in all four setups before confirmation. Each confirmation advanced the revision once. The driver reconnected to the same match when playback fell behind. Both coaches loaded identical results, replay could seek to the first and last event, and all 42 transcript records matched the durable events. Staged placements appeared in replay only at confirmation.

The database marked the match `COMPLETED`. The decoded completion artifact measured 2,231,742 bytes. Its full stored document measured 2,269,785 bytes decoded and 158,316 bytes compressed. This end-turn run exercises the authenticated lifecycle with minimal ordinary gameplay.
