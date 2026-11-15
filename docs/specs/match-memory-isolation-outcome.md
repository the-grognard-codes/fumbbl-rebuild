# Match memory isolation: implementation outcome

Issue: [#554](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/554).
PR: [#559](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/559), open for independent review.
Branch: `codex/554-match-memory-isolation`.
Base: `33d95b7c6c0342e9a7ef1fbea2ba02a05a62905d`.
Date: 2026-11-15.

## Result and policy

Oversized stored recovery is refused using its declared decoded size before
base64 decoding, inflation or native restoration. Legacy raw records are checked
without allocating an artifact-sized UTF-8 array. Prepared/completed records
receive the same admission check. Checkpoint-plus-journal decoded allocations
are admitted together before journal reassembly.

Native mutations, save/resume changes, chat and timer-driven actions share the
heap policy. Incremental byte accounting includes escaped replay events,
transcript records, native command JSON, request history and current metadata.
A 1 MiB append reserve allows the next bounded action; the exact checkpoint
boundary also checks the decoded cap before persistence. Exceeding either bound
releases the resident session, preserves the last durable checkpoint, records
`MATCH_SIZE_LIMIT`, and makes the match unavailable. It does not fabricate a
score or replay uncommitted game commands. Connected coaches and spectators
receive the stop through existing locally authorized publication, including
stops from chat or expiry timers.

At the deployed 768 MiB heap the policy allows **one resident session**, a
**32 MiB decoded artifact**, and a **31 MiB append threshold**. Capacity returns
when a session completes, is released after failure, or reaches its existing
idle eviction time. Extra activations receive `ACTIVATION_LIMIT`.
The derivation, heap histogram and retained paths are in the
[heap evidence](match-memory-isolation-heap.md).

## Restart protection

`backup.dir/match-safety.log` records a short diagnostic begin line before risky
match work and an end line only after the complete worker task returns normally
or with a handled request failure. A fatal `Error` or JVM
`ExitOnOutOfMemoryError` leaves its begin line unmatched. At startup, that match
is quarantined with `MATCH_QUARANTINED`; other matches remain eligible.
Size-limit quarantines preserve `MATCH_SIZE_LIMIT` across restarts.

The log contains only canonical match IDs and record tags. Startup reads are
bounded. An isolated daemon compacts the diagnostic log at 1 MiB with atomic
replacement, preserving active and quarantined IDs. Engine lock acquisition
waits at most 25 ms or the remaining request allowance; maintenance cannot
indefinitely occupy the worker. Ordinary append cost remains inside complete
task timing under ADR 0006's local-logging allowance. Storage failures reject
further risky work with `MATCH_SAFETY_UNAVAILABLE` and do not invoke the fatal
worker halt path.

Operators should retain the log with the recovery backup. Quarantine review is
an administrator action: stop the server, preserve the log for investigation,
review or replace the suspect checkpoint, remove only its reviewed quarantine
record, and restart. This work does not automatically discard private games.
As with ordinary local diagnostics, this protects process crashes; it does not
claim power-loss durability without an fsync-backed storage protocol.

## Standards

The independent standards review initially requested changes for log cleanup
outside task timing, cleanup failure reaching fatal halt, duplicated history
serialization, and unbounded contention with log compaction. All were fixed.
The final scoped review reported: “No remaining actionable findings in the
scoped fixes.” Tests were inspected by the reviewer and run by the implementer.

## Spec

The independent spec review initially requested changes for missing timer/chat
stop publication and diagnostic-log exhaustion. Both were fixed. The final
scoped review reported: “No remaining actionable findings in the fixes.”
The review found no serialization undercount or authorization bypass.

Final findings: **Standards 0 unresolved; Spec 0 unresolved**.

## Validation

- Before: `SetupApplicationRecoveryFailureTest#oversizedRecoveryIsRefusedBeforeNativeRestoreAndOnlyBlocksItsOwnMatch`
  failed: expected `MATCH_SIZE_LIMIT`, received `RECOVERY_CORRUPT`.
- After: the oversized-load test passes and leaves another match available.
- 33 focused review regressions pass. These include genuine native placement
  growth to the budget without an extra checkpoint write; exact byte counting;
  successful and interrupted restart paths; real `ExitOnOutOfMemoryError` in a
  child JVM; 45 MiB compressed recovery refusal followed by a healthy native
  restore at `-Xmx768m`; log compaction; bounded compactor contention; authorized
  and revoked stop publication; cleanup timing and permit release.
- Browser unit suite: **541 passed**; the final replay-protocol selector passes
  all **7 tests**, including the added size-limit rejection. Browser production
  build and final local Hosting assembly: passed.
- Reconnect browser suite: passed, including coach-facing size-limit/quarantine
  notices, no retained retry for a definitive stop, existing reconnect behavior,
  and no page errors.
- Full pinned `mvn clean install`: 19 common tests and 860 server tests passed
  (15 opt-in server tests skipped). The native suite ran 297 tests (7 skipped)
  with one failure: the capacity test still assumed 32 resident engines. The
  fixture now uses the derived limit and supports a one-slot heap. A focused
  dependency-reactor rerun passes all 27 final JDBC/memory regressions and the
  corrected native capacity test. Passing unrelated suites were not repeated.
  The complete clean-install command was not rerun after this test-only fix.
- A final pinned Maven `install` with the corrected capacity selector and
  `-DargLine=-Xmx768m` passes the affected reactor, proving admission, idle
  eviction and lost-acknowledgement restore with the actual one-slot policy.
- Dev-local: final `node tools/dev-local.mjs --restart --quick` passes health,
  mounted ADC, real proxy authentication gate on connection/reconnection, and
  computer-daemon readiness. Quick mode is startup evidence; it substitutes for
  none of the tests above.
- Live soak: **20.1 minutes**, one match, **90 coach decisions**, revision **399**,
  10 diagnostics exports and one trace. **No OOM, fatal engine failure or
  restart**; final container health is healthy, restart count 0. Peak container
  RSS was approximately 1,053 MiB (RSS includes native/JVM memory; it is not Java
  heap usage). **No match completed.** A checkpoint was refused with
  `PERSISTENCE_FAILED` / `NotStarted` after exhausting its JDBC allowance; the
  retained action was refused again when repeated. Authentication rejection and
  UI-driver recovery timeouts followed. The driver recorded 15 errors and nine
  unavailable/backoff notices while engine health remained green. This is
  limited memory-isolation evidence, **not a clean gameplay-soak pass**.

The live driver used the existing test Chrome profile. Its normal launcher
rejected a cached session; refreshing the existing Firebase token allowed
authentication. An ignored local copy ran headless Chrome, refreshed that
session, and handled match navigation/resume. No authentication checks, ADC,
server configuration or tracked soak-driver code were changed. The final
authenticated smoke connection passed twice with no alerts, separately from
the stalled soak.

The first full Java run exposed two constructor-count regressions from an
unnecessary codec instance in size accounting. Sharing the existing envelope
overhead constant removed the allocation; all read-only-load regressions pass.
The first added publication test also needed its checked exception declaration;
the focused rerun passes.

## Compatibility and scope

Recovery, completed-match and transcript formats are unchanged. Existing data
within the new admission limit still uses its recorded runtime. The large
original recovery artifact remains stored and is refused across restarts; it
was not cleared to make startup succeed. Full snapshots are retained for now;
their reduction is explicitly handed to #548, with staged placements in #556.
The Solid Defence policy bug remains #553.

The unrelated `main` edit to `docs/specs/gameplay-soak-review.md` is preserved.
No merge, remote deployment, ADC reconfiguration or private-game deletion is
part of this delivery.

## Follow-up

The 12× expansion policy is deliberately conservative, not a proof for arbitrary
object graphs. Continue the real-play operating-envelope work in #548/#524 and
repeat a longer soak after the snapshot and computer-policy improvements land.
The opt-in SQL operating-envelope benchmark was not run: its fixed 32-resident
preload and distinct resident-match repetitions need adaptation to the new
admission policy in #548. The observed checkpoint/authentication failures also
remain follow-up work; this change leaves the 2,000 ms request budget intact.
The installed skill catalog has no `/retro` skill; no agent instruction or
environment files were changed. The practical testing lesson is to verify the
existing browser session and current match before an unattended run.
