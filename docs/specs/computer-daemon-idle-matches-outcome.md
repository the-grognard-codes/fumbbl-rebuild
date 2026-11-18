# Idle computer matches implementation outcome

The computer daemon now parks workers that are waiting for the human coach. It keeps the worker slot available for another match and resumes the parked match when a committed human action or timer update is published. A new worker loads authoritative state before taking any action. [Issue #573](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/573)

The existing active-job refresh supplies a fallback when a notice is missed. The retry delay starts at 48–60 seconds and doubles up to a jittered range of 4–5 minutes. Registration negotiates change notices so the daemon can still use the fallback with an older server. The worker reports the revision it observed before yielding so a publication racing its exit can still wake it.

Computer state loads no longer refresh the session idle timer. The engine worker releases idle sessions at the existing 30-minute threshold during its maintenance pass. A cold load can return the validated away projection from the current durable checkpoint when the session is waiting for the human and there is no maintenance to run. Active computer decisions, reaction deadlines and save/resume transitions use the normal recovery path. The one-month abandonment policy remains in effect.

## Self-review

- Checked worker capacity, revision and exit ordering, same-revision save/resume notices, and compatibility with legacy registration. Notices expose only scheduling fields to the authenticated dispatcher for registered computer matches.
- Checked that returning human coaches still restore the native session and can publish the next action. The waiting path checks the checkpoint envelope and checksum and leaves the existing artifact format intact.
- Restored timing coverage around the original recovery lookup after the first Java run caught an instrumentation regression. The timing tests passed on the rerun.
- The first soak exposed a second ordering regression after a checkpoint refusal. The cold computer path now reads skill-use preferences before the checkpoint, while JDBC still has budget. A regression test enforces that order for a runnable cold load.

## Validation

- The original dispatcher started the waiting worker three times before the human acted in the transport regression. The updated dispatcher started it once, ignored repeated registration refreshes, and restarted after the revision notice.
- All 56 computer-player tests and 548 browser tests passed. The Hosting build passed, and the live proxy smoke test reached the Java authentication gate on both connections.
- The pinned full Maven clean install passed before the final cold-load ordering correction. The final source passed 84 focused Java tests covering recovery, timing, checkpoint workload, and dispatch. The final server image also built successfully in quick mode.

## Dev-local soak

The browser created three Bogruk matches and left each waiting on its human coach. A fourth match ran through full time in two stages. The first stage reached revision 544 and exposed the cold-load ordering regression. After rebuilding the isolated server, the computer coach resumed from the durable checkpoint and advanced to revision 571 before the browser rejoined. The match finished at revision 652 with a 0–2 score. The browser confirmed full time after a refresh, and MariaDB still held all three unattended matches as active alongside the durable completed result.

| Evidence | Earlier soak from #573 | Isolated dev-local soak |
| --- | --- | --- |
| Unattended worker reloads | About 303 cycles in 25 minutes | 16 reloads across three matches by browser completion verification, plus their three initial starts. Later retry delays were approximately 4–5 minutes. |
| Browser `retainedRetries` | No retained retries recorded in the stalled run | Two `PERSISTENCE_FAILED` retries before the ordering correction, zero after it. |
| `PERSISTENCE_FAILED` | 11 checkpoint refusals reported against the stalled live match | At least five live-match warnings before the rebuild. The final server logged two refused broadcast reads for the live result and zero persistence failures for the unattended matches. |
| Live match | Stalled at revision 365 | Full time at revision 652, verified in the browser and database. |

The final server deferred the result write once and completed it through the existing retry path. The browser driver also recovered from a click timeout. The original attempt overlapped other host work, and the cause of individual live-match budget refusals remains open. [Checkpoint budget follow-up](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/535)

Local evidence is under `.tools/573-soak-run-3`, `.tools/573-soak-resumed-final`, and `.tools/573-isolated-local` in the issue worktree.

## Local review instance

Hosting is available at [localhost:5173/play](http://localhost:5173/play). The isolated instance uses proxy port `22236`, game server port `22235`, and MariaDB port `23318`. The repository’s isolated startup procedure uses `-DskipTests`, the same Maven flag as `--quick`, while the test suite runs separately. The default dev-local ports were occupied by another worktree.

The container’s first Firebase sign-in attempts timed out during provider connection setup. The isolated Compose override uses the server’s supported 1,700 ms provider allocation, 400 ms DNS allowance, and 650 ms connection allowance. Synthetic browser sign-in and dispatcher registration both succeeded after recovery.
