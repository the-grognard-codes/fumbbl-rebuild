# Idle computer matches implementation outcome

The computer daemon now parks workers that are waiting for the human coach. It keeps the worker slot available for another match and resumes the parked match when a committed human action or timer update is published. A new worker loads authoritative state before taking any action. [Issue #573](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/573)

The existing active-job refresh supplies a fallback when a notice is missed. The retry delay starts at 48–60 seconds and doubles up to a jittered range of 4–5 minutes. Registration negotiates change notices so the daemon can still use the fallback with an older server. The worker reports the revision it observed before yielding so a publication racing its exit can still wake it.

Computer state loads no longer refresh the session idle timer. The engine worker releases idle sessions at the existing 30-minute threshold during its maintenance pass. A cold load can return the validated computer-side projection from the current durable checkpoint when the session is waiting for the human and there is no maintenance to run. Active computer decisions, reaction deadlines and save/resume transitions use the normal recovery path. `SaveResumeState.COMPUTER_RETENTION_MILLIS` allows one hour for a pending human decision. When control passes to the human, the clock starts. When the computer takes control, the clock clears. The decision owner includes the coach who owes a prompt, reaction or save/resume response. Passive loads and dispatcher wake-ups do not refresh the clock. Both restored and resident sessions enforce the persisted deadline. Mutually saved computer matches retain the normal 30-day deadline, as do human-versus-human matches.

The preparation document stores lifecycle and document version. An activated match retains the same document version across gameplay revisions, and its current actor is stored only in the recovery checkpoint. A cold worker therefore still reads preferences and validates the checkpoint before answering. Returning a waiting view skips engine reconstruction. A follow-up tracks persisting a small turn summary with the durable generation so unchanged probes can skip the full read and hash. [Issue #548 follow-up](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/548#issuecomment-6969969843)

## Self-review

- Checked worker capacity, revision and exit ordering, same-revision save/resume notices, and compatibility with legacy registration. Notices expose only scheduling fields to the authenticated dispatcher for registered computer matches.
- Checked that returning human coaches still restore the native session and can publish the next action. The waiting path checks the checkpoint envelope and checksum and leaves the existing artifact format intact.
- Restored timing coverage around the original recovery lookup after the first Java run caught an instrumentation regression. The timing tests passed on the rerun.
- The first soak exposed a preference-read ordering regression introduced in the initial PR draft. The cold computer path now reads skill-use preferences before the checkpoint, while JDBC still has budget. A regression test enforces that order for a runnable cold load.

The dispatcher reconciles a complete registration inventory, prunes missing jobs, and preserves parked revisions across reconnect. When the server advertises a parked match again, the dispatcher schedules one retry after an independent random delay of 1 to 31 seconds at the default refresh interval. A newer revision or a same-revision save/resume change wakes the worker immediately. A terminal notice or an abandoned worker response removes the job from scheduling. A negotiated registration that gets a malformed-message response retries without notices and periodically probes for support again. Fallback deadlines are checked on the registration refresh interval.

Activation announces a new job. Human setup changes (including concession), decision expiry and deferred completion can wake the dispatcher. Ordinary computer actions only publish game state. Saving removes the job from dispatch and a resume proposal makes it available again. The match-result endpoint reads the result or replay. Proposal expiry can wake the dispatcher at the same gameplay revision. If mutual save still applies, expiry withdraws the suspended job. The timer publishes abandonment to enrolled viewers after the abandonment checkpoint commits.

## Validation

The third review pass covered saved-match inventory, dispatcher IPC ordering, reconnect timers, and human decision deadlines across recovery. A native reaction or consent timeout that predates abandonment is settled at its original deadline. Saved matches leave the worker inventory until a resume proposal. On marker-9 upgrades, a suspension-aware dispatcher requests another registration after one second while legacy rows still need classification. All 137 focused server tests passed, including the MariaDB migration and journal tests. The two state-test classes that failed on the previous CI head passed locally (31 passed, 2 skipped). All 65 computer-player tests and 551 browser tests passed.

- The original dispatcher started the waiting worker three times before the human acted in the transport regression. The updated dispatcher started it once, ignored repeated registration refreshes, and restarted after the revision notice.
- All 56 computer-player tests and 548 browser tests passed. The Hosting build passed, and the live proxy smoke test reached the Java authentication gate on both connections.
- The pinned full Maven clean install passed before the final cold-load ordering correction. The initial PR passed 84 focused Java tests covering recovery, timing, checkpoint workload, and dispatch. That server image also built in quick mode.

Review corrections passed 155 distinct focused Java tests across checkpoint recovery, match retention, publication authorization, and computer policy. All 61 computer-player tests and 549 browser tests passed. The final browser bundle and quick server image built successfully.

Both the authenticated computer connection and its policy now support either seat. Ordinary human and spectator connections reject private computer policy data. The dispatcher excludes suspended matches from inventory and releases their worker slots. After reconnect, the dispatcher keeps ended jobs out of scheduling while they remain in an authoritative inventory.

The second review added the staggered reconnect retry. All 17 dispatcher transport tests and 9 focused Java load tests passed after this change. The soak below ran before this reconnect adjustment.

## Saved matches and decision deadlines

The third review changed the retention and dispatch behavior after the soak. A checkpoint records the start of a human-owned decision. On first recovery of an older checkpoint without that field, a pending human decision receives a fresh hour and the server persists its start. The 30-day retention period for a mutually saved computer match starts at suspension.

Schema marker 10 records computer job availability in the same transaction as a checkpoint or journal append. A classified suspended job is absent from the registration inventory. A resume proposal advertises the job immediately and remains eligible until the proposal expires. Registration includes activated legacy matches while classifying up to four heads at a time using the committed generation. A lost backfill race leaves the job visible until the next snapshot. Active rows with classified availability need no prepared-document decode in the inventory path. [Migration procedure](../operations/recovery-journal-schema.md)

The dispatcher reads the idle revision after child IPC has drained. A reconnect timer can enqueue its job even if the wall clock has moved backwards. Human changes, save/resume transitions, concessions and reactive expiry can trigger notices. An ordinary computer move does not send a wake-up to its own dispatcher.

## Third-round review of `c0df23e34`

The backfill logs classification failures and leaves legacy jobs eligible with unknown availability. A five-minute cooldown bounds retries for the same generation. The MariaDB regression covers availability past that interval, a lost backfill write, a mismatched computer seat, and legacy jobs beyond the batch limit. The transport regression verifies that a saved job uses no worker slot and that Bogruk accepts a resume proposed during a dispatcher disconnect before the five-minute window expires.

The isolated server was stopped while migration 010 was applied to a backed-up marker-9 database. The ten active legacy matches began with unclassified availability. Backfill classified seven as eligible and excluded three with zero availability. The two completed rows remained unclassified and outside the inventory. The first worker runs exposed an additional recovery incompatibility from the announcement changes merged from main. The previous five-field announcement checkpoint now restores with empty kickoff and weather state. A read-only recovery check restored all ten legacy matches with this fix.

After the patched marker-10 server restarted, the dispatcher started seven distinct retained jobs during the registration check with zero failed workers and zero server `PERSISTENCE_FAILED` entries. All 133 focused Java tests passed, including the live MariaDB schema and journal checks. All 65 computer-player and 556 browser tests passed, and the browser and server builds succeeded. The credential-free engine harness reached full time for Orc versus Human with seed 73 after 737 accepted decisions and seven checkpoint restores. The known seed-42 setup-candidate stop was reproduced at revision 402.

## Integration with staged placements

The update from `main` combines staged setup and kick-off publication with computer dispatch and keeps recovery version 7 as the supported format. Both native restore and cold computer loads reject older checkpoints. The announcement reader handles the five-field sidecar within a supported checkpoint. Schema migration preserves checkpoint bytes and does not convert retired recovery versions.

Both MariaDB tests passed on a disposable instance. Migration 010 preserved the stored checkpoint and journal bytes. Registration classified two saved matches as ineligible and kept one corrupt checkpoint in the inventory for normal recovery diagnostics. A committed resume proposal readvertised the saved match. A fresh engine restored its migrated journal and accepted the proposal. The dispatcher regression separately confirms that Bogruk accepts a proposal made during a reconnect within its five-minute window.

All 196 focused Java tests passed after integrating `main`, followed by 47 focused recovery, journal, and native-policy tests after the backfill fix. All 65 computer-player tests and 559 browser tests passed. The production browser build and local server image build succeeded. The credential-free engine harness ran Orc versus Human with seed 73 to a 0–3 finish at revision 667. It recorded 673 accepted decisions, six checkpoint restores, and zero invalid responses or decision-limit warnings.

Three GitHub shards exhausted the Java heap during the server suite. A local run with a 1,800 MiB limit reproduced the failure and retained about two million Mockito call records during the recovery tests. The server test suite now releases inline mocks after each test class. The same capped run passed with 887 server tests passed, 16 environment-gated skips, and zero failures or errors.

The authenticated dev-local soak is pending. Both configured DEV credential sources returned `SESSION_EXPIRED`. The current build still needs a browser save and resume, a live match through full time, and `PERSISTENCE_FAILED` and `RATE_LIMITED` totals from that run. Maintainer acknowledgement of the [migration and rollback procedure](../operations/recovery-journal-schema.md) is pending before merge.

## Earlier uninterrupted dev-local soak

The quick-built server from the earlier review ran continuously from kickoff to full time. Three previously abandoned matches remained in the database. The browser created three additional Bogruk matches and left them on the human turn, then played a fourth to a 0-3 finish at revision 825 in 11 minutes 44 seconds. MariaDB confirmed the completed match at document version 4 and all three new unattended matches at version 3.

| Measure | Final run |
| --- | --- |
| Browser retained retries | 0 |
| Server `PERSISTENCE_FAILED` log entries during the run | 0 across all matches. Up to 4 separate lobby responses could have been JDBC allowance refusals (see below). |
| Worker starts for the three new unattended matches | 4 each, including the initial load (9 reloads total) |
| Browser driver recovery | 5 click timeouts recovered. The socket observer also recorded 105 rate-limit responses. |

The 105 `RATE_LIMITED` responses break down as follows.

- **101 diagnostic probes.** Fourteen retained browser captures directly identify 63 distinct rejected probes, including 57 with matching server traces. The other 38 are attributed by route and message order. On all six live match-page connections, the startup lobby browse preceded the first setup state and the first throttle followed it. The match page did not poll the lobby afterward. The server enforces a one-second probe interval after authorization, so variation in processing time can throttle consecutive probes.
- **4 lobby reads.** One occurred during each match-creation visit, about half a second after lobby authentication and before entering the match. Both the lobby request limiter and a JDBC operation refused before it starts (`JdbcConnections.NotStarted`) return this code. The observer kept no request IDs for these four errors and the server logged no individual cause. Between 0 and 4 could be JDBC allowance refusals. None of the 105 responses was a gameplay mutation refusal.

The browser observed full time during the same run. Evidence is under `.tools/573-review-final-soak` in the issue worktree.

## Initial two-stage dev-local soak

The browser created three Bogruk matches and left each waiting on its human coach. A fourth match ran through full time in two stages. The first stage reached revision 544 and exposed the cold-load ordering regression. After rebuilding the isolated server, the computer coach resumed from the durable checkpoint and advanced to revision 571 before the browser rejoined. The match finished at revision 652 with a 0–2 score. The browser confirmed full time after a refresh, and MariaDB still held all three unattended matches as active alongside the durable completed result.

| Evidence | Earlier soak from #573 | Isolated dev-local soak |
| --- | --- | --- |
| Unattended worker reloads | About 303 cycles in 25 minutes | 16 reloads across three matches by browser completion verification, plus their three initial starts. Later retry delays were approximately 4–5 minutes. |
| Browser `retainedRetries` | No retained retries recorded in the stalled run | Two `PERSISTENCE_FAILED` retries before the ordering correction, zero after it. |
| `PERSISTENCE_FAILED` | 11 checkpoint refusals reported against the stalled live match | At least five live-match warnings before the rebuild. The final server logged two refused broadcast reads for the live result and zero persistence failures for the unattended matches. |
| Live match | Stalled at revision 365 | Full time at revision 652, verified in the browser and database. |

The final server deferred the result write once and completed it through the existing retry path. The browser driver also recovered from a click timeout. The two refused result broadcasts and the refresh needed to see full time match the known broadcast budget issue in #535. [Checkpoint budget follow-up](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/535)

Local evidence is under `.tools/573-soak-run-3`, `.tools/573-soak-resumed-final`, and `.tools/573-isolated-local` in the issue worktree.

## Local review instance

The review used Hosting at [localhost:5173/play](http://localhost:5173/play). The isolated instance uses proxy port `22236`, game server port `22235`, and MariaDB port `23318`. The repository’s isolated startup procedure uses `-DskipTests`, the same Maven flag as `--quick`, while the test suite runs separately. The default dev-local ports were occupied by another worktree.

The container’s first Firebase sign-in attempts timed out during provider connection setup. The isolated Compose override uses the server’s supported 1,700 ms provider allocation, 400 ms DNS allowance, and 650 ms connection allowance. Synthetic browser sign-in and dispatcher registration both succeeded after recovery.
