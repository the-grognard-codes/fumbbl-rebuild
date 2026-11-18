# Idle computer matches implementation outcome

The computer daemon now parks workers that are waiting for the human coach. It keeps the worker slot available for another match and resumes the parked match when a committed human action or timer update is published. A new worker loads authoritative state before taking any action. [Issue #573](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/573)

The existing active-job refresh supplies a fallback when a notice is missed. The retry delay starts at 48–60 seconds and doubles up to a jittered range of 4–5 minutes. Registration negotiates change notices so the daemon can still use the fallback with an older server. The worker reports the revision it observed before yielding so a publication racing its exit can still wake it.

Computer state loads no longer refresh the session idle timer. The engine worker releases idle sessions at the existing 30-minute threshold during its maintenance pass. A cold load can return the validated computer-side projection from the current durable checkpoint when the session is waiting for the human and there is no maintenance to run. Active computer decisions, reaction deadlines and save/resume transitions use the normal recovery path. A computer match is abandoned on the first maintenance check or touch after one hour without human player activity. Human matches retain their 30-day deadline. Abandonment uses the existing durable checkpoint state.

The preparation document stores lifecycle and document version. An activated match retains the same document version across gameplay revisions, and its current actor is stored only in the recovery checkpoint. A cold worker therefore still reads preferences and validates the checkpoint before answering. Returning a waiting view skips engine reconstruction.

## Self-review

- Checked worker capacity, revision and exit ordering, same-revision save/resume notices, and compatibility with legacy registration. Notices expose only scheduling fields to the authenticated dispatcher for registered computer matches.
- Checked that returning human coaches still restore the native session and can publish the next action. The waiting path checks the checkpoint envelope and checksum and leaves the existing artifact format intact.
- Restored timing coverage around the original recovery lookup after the first Java run caught an instrumentation regression. The timing tests passed on the rerun.
- The first soak exposed a preference-read ordering regression introduced in the initial PR draft. The cold computer path now reads skill-use preferences before the checkpoint, while JDBC still has budget. A regression test enforces that order for a runnable cold load.

The dispatcher reconciles a complete registration inventory, prunes missing jobs, and reloads parked matches after reconnect. A terminal notice or an abandoned worker response removes the job from scheduling. A negotiated registration that gets a malformed-message response retries without notices and periodically probes for support again. Fallback deadlines are checked on the registration refresh interval.

Activation announces a new job. Committed setup changes (including concession), computer actions, decision expiry and deferred completion publish changes. The match-result endpoint reads the result or replay. Expiry of a pending save/resume proposal alone clears metadata and cannot give the computer an engine turn. Periodic refresh covers that case.

## Validation

- The original dispatcher started the waiting worker three times before the human acted in the transport regression. The updated dispatcher started it once, ignored repeated registration refreshes, and restarted after the revision notice.
- All 56 computer-player tests and 548 browser tests passed. The Hosting build passed, and the live proxy smoke test reached the Java authentication gate on both connections.
- The pinned full Maven clean install passed before the final cold-load ordering correction. The initial PR passed 84 focused Java tests covering recovery, timing, checkpoint workload, and dispatch. That server image also built in quick mode.

Review corrections passed 155 distinct focused Java tests across checkpoint recovery, match retention, publication authorization, and computer policy. All 61 computer-player tests and 549 browser tests passed. The final browser bundle and quick server image built successfully.

Both the authenticated computer connection and its policy now support either seat. Ordinary human and spectator connections reject private computer policy data. A suspended Bogruk releases its worker even when it holds the turn. After reconnect, the dispatcher keeps ended jobs out of scheduling while they remain in an authoritative inventory.

## Final uninterrupted dev-local soak

The final quick-built server ran continuously from kickoff to full time. Three previously abandoned matches remained in the database. The browser created three additional Bogruk matches and left them on the human turn, then played a fourth to a 0?3 finish at revision 825 in 11 minutes 44 seconds. MariaDB confirmed the completed match at document version 4 and all three new unattended matches at version 3.

| Measure | Final run |
| --- | --- |
| Browser retained retries | 0 |
| Server `PERSISTENCE_FAILED` log entries during the run | 0 across all matches |
| Worker starts for the three new unattended matches | 4 each, including the initial load (9 reloads total) |
| Browser driver recovery | 5 click timeouts recovered. The socket observer also recorded 105 rate-limit responses. |

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

Hosting is available at [localhost:5173/play](http://localhost:5173/play). The isolated instance uses proxy port `22236`, game server port `22235`, and MariaDB port `23318`. The repository’s isolated startup procedure uses `-DskipTests`, the same Maven flag as `--quick`, while the test suite runs separately. The default dev-local ports were occupied by another worktree.

The container’s first Firebase sign-in attempts timed out during provider connection setup. The isolated Compose override uses the server’s supported 1,700 ms provider allocation, 400 ms DNS allowance, and 650 ms connection allowance. Synthetic browser sign-in and dispatcher registration both succeeded after recovery.
