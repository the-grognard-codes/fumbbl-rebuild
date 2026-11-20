# Match memory isolation: review corrections and outcome

Issue: [#554](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/554).
PR: [#559](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/559).
Branch: `codex/554-match-memory-isolation`; base: `33d95b7c6`.
Date: 2026-11-15; follow-up review: 2026-11-16 UTC.

**Acceptance pending.** The November 20 integration brings #574, #558 and #575
into this branch. The three-hour concurrent soak will run with #543 and #541 on
a disposable branch. Record all three PR head SHAs and keep #554 open until the
evidence is recorded. [Integration instructions](https://github.com/the-grognard-codes/moles-under-the-pitch/pull/559#issuecomment-7031175823)

## Result

The initial one-slot policy, permanent size quarantine and synchronous safety
file writes were rejected by the owner review. This revision replaces them.

The application preserves the **32-slot ceiling**, charges actual retained
history sizes and releases least recently used checkpointed engines when a
restore or checkpoint needs headroom. It runs idle cleanup on maintenance ticks. Pending reactions remain resident
so their server deadlines continue. If a timed mutation cannot checkpoint,
a bounded ID/time retry restores its durable prefix on a later tick; committed
uncertain outcomes publish without executing the decision again. Reaction and
completion retries share the same 32-slot bound. Temporary capacity pressure
delays completion retry rather than discarding it.
Eviction preserves durable recovery and bounded completion-retry metadata;
retrying a detached terminal result still verifies its identity against any
stored completion. Definitive completion rejection releases its engine.

At the deployed **768 MiB heap**, the post-placement policy permits **44 MiB
decoded** with a **40 MiB append threshold** and a 4 MiB reserve. It ends a match at its
current score, clears any pending reaction, checkpoints the terminal state and
records the result. The match leaves the active set. The existing transcript
decision records the reason; fresh wire projections expose it on completed
loads, so reconnecting coaches see why the match ended. No permanent size-stop
flag is written. An already oversized stored row is refused with the stable
`MATCH_SIZE_LIMIT` code before decompression; its durable data is preserved.

Recovery and completed-result serialization share one bounded canonical writer.
Restore takes ownership of private transcript records and shares immutable
snapshots with replay where their semantic contents match. Older differing
projections remain unchanged. Public transcript pages still copy their data.
Staged checkpoint version 7, schema v10 computer scheduling, checksum encoding,
and replay ordering remain intact. Recovery does not replay engine commands.
Cold computer projection, legacy inventory classification and timer maintenance
share size and quarantine admission. Timer retries preserve an uncommitted
human decision clock while its durable generation is current. `stopReason` is a wire-only extension and is
not inserted into stored replay or recovery projections.

See [heap evidence and policy](match-memory-isolation-heap.md) for the histogram,
ownership investigation, formula and measured headroom.

## November 20 integration checks

- 125 focused server tests passed at 768 MiB, including cold computer and
  inventory decode refusal, a quarantined timer tick, checkpoint retry and
  journal compaction at decoded admission.
- The staged native probe recovered a 9,433,372-byte Unicode checkpoint plus
  journal with a 4,296,598-byte warm engine still resident. The
  restore/serialize/terminal pipeline took 1,797 ms in that run.
- The production browser build, 564 browser tests and Chromium reconnect
  checks passed.

## November 20 soak review corrections

Prepared documents, completed results, inventory and cold computer projections
retain their decoded size bounds without evicting engines. Dedicated native
restores check the resident budget before decompression. A cold computer load
that needs an engine admits the already decoded checkpoint before reconstruction.
Timer retries double from one second to one minute on repeated failures and keep
their deadline ownership until quarantine expires.

If a decision or a resulting terminal checkpoint exceeds the decoded limit,
discard the oversized continuation. Restore the last committed generation and
record a neutral size stop there. A generation check protects concurrent
updates, and a refused or uncertain write reconciles through durable recovery.
The rejected decision carries the committed terminal state to the coach. The
computer worker treats that state as completion.

The final focused Java run passed 217 tests. Both MariaDB journal tests, 67
computer-player tests and the Chromium reconnect checks also passed.

## November 15 owner review response

| Finding | Correction |
| --- | --- |
| Blocking safety-file writes violated ADR 0006 | One maintenance writer, immutable snapshots, one coalesced pending update, bounded worker acknowledgement charged to the request |
| One-slot derivation and unexplained eight residents | Fixed 32 ceiling; eight dump residents proven unfinished; actual history-weighted LRU admission; timer idle cleanup; separate definitive-completion leak fixed |
| 31 MiB threshold truncated legitimate long games | 45.45 MiB append threshold at deployment heap; Unicode 47.7/50.7 MB journal/native probes pass, including a retained warm engine |
| Permanent size stop had no result | Current-score terminal checkpoint/result, full-time publication and reconnect explanation |
| Extra projections/file flush could cause deadline stalls | No runtime worker file I/O; one normal post-mutation recovery-size projection; cached pre-append size; canonical writer avoids deep history clone; replay-array reassembly and fingerprints avoid whole-history temporary graphs/buffers |
| Generic crash/kill caused permanent quarantine | Exact prior-run OOM dump evidence required; automatic reload only; thirty-minute expiry; stopped-server admin clear |
| Tracking failures rejected all gameplay | Advisory fail-open tracking with one diagnostic; memory admission stays enabled |
| Standards/duplication/wiring | Shared injected policy; explicit production tracker constructor; stop-reason enum; shared UTF-8 counter and canonical writer; backup-dir constant; documented exceptions |
| Missing live comparison | Clean-main startup reproduced OOM/restart exhaustion on unchanged persisted data; corrected 20-minute soak completed and stored a natural full-time game without OOM/restart; driver errors and assisted retries are disclosed below |
| Snapshot reduction / staged placement coordination | Full snapshots remain compatible; #548 owns broader serialization work, #556/ADR 0008 owns staged placement history reduction. Recalibrate after #556 lands |

## OOM tracking and operator recovery

Production owns `backup.dir/match-safety.json`. It contains a run UUID, startup
time, the exact configured heap-dump filename, a sequence and at most 33 canonical
match IDs, plus independent suspect IDs with absolute quarantine expiry. The
version-2 advisory state reads the earlier version-1 breadcrumbs. One central transport boundary covers ingress, restoration,
publication and control tasks; control snapshots include resident engines and bounded detached reaction/completion retries. Startup/admin reads occur off-worker.

The engine enqueues an immutable snapshot and returns immediately, without an
acknowledgement wait. A late or failed write never rejects gameplay. One pending snapshot replaces
older pending snapshots, preventing an unbounded I/O backlog. Runtime writes
and atomic replacement belong exclusively to the daemon. A fatal `Error` does
not clear the last operation snapshot; ordinary handled exits do.

On startup, automatic reloads of prior suspects are delayed only if the prior
run's named OOM dump exists, is nonempty and has a timestamp from that run.
Ordinary kills/crashes without that evidence do not quarantine matches. The
block expires after thirty minutes and applies before every recovery read,
including browser reconnects, observers, computer loads and detached retries.
There is no browser bypass: coaches see an unavailable-after-failure message
with the expiry and administrator-clear route. Current-task rotation preserves unexpired quarantines across ordinary restarts;
the stopped-server clear removes only the named suspect. Tracking corruption or I/O failure emits
`MATCH_SAFETY_TRACKING_UNAVAILABLE` once and leaves gameplay admission active.
This diagnostic is not a protocol rejection code.

To clear one reviewed suspect before expiry, stop the server, preserve its
tracking file/dump for investigation, then run on the existing server classpath:

```text
java -cp "FantasyFootballServer.jar:lib/*" com.fumbbl.ffb.server.match.MatchSafetyAdmin clear <backup-dir>/match-safety.json <match-id>
```

Use `;` instead of `:` as the Windows classpath separator. The file lease rejects
clearing while the writer owns the state; the command changes only that match.
The initial PR's `match-safety.log` is ignored and preserved; it cannot impose
old permanent size/crash blocks.

**Residual attribution gap:** a JVM can fail before a late handoff reaches disk,
or while tracking storage is unavailable. In that case restart attribution can
be absent or stale. This is advisory crash-loop mitigation, not a power-loss or
synchronous durability guarantee. The memory admission policy operates
independently. The real OOM child test explicitly verifies a persisted
breadcrumb before triggering `ExitOnOutOfMemoryError`; a separate blocked-store
test verifies immediate fail-open handoff and coalescing.

## Validation

- Before rework, regression tests reproduced the deployment ceiling falling
  from 32 to 1 and a definitive completion conflict retaining its engine.
- The final focused selector passes **65 tests**, including legacy presentation
  recovery, reaction pinning/automatic retries, uncertain-commit publication,
  transient completion capacity, mixed retry-slot admission, completed recovery
  pruning, checkpoint reconciliation and storage-failure isolation.
- Final native eleven-player Unicode probes at `-Xmx768m`: 47,672,358 bytes /
  revision 1,552 with a 13,903,826-byte warm native engine retained; 50,735,758
  bytes / revision 1,652 below the derived cap. Both exercise compressed
  checkpoint+real journal delta reassembly, exact native restore, serialization,
  fingerprint/cursor creation and completed-result materialization. These are
  real legal placement histories, not padded JSON strings. A 23,386,727-byte
  warm engine was evicted before decode in a separate passing cohort.
- The real native 32-slot pool/capacity/idle/lost-acknowledgement test passes at
  `-Xmx768m`, preserving the original activation-ceiling assertion.
- Browser unit suite: **543 passed**. Production build passes. Reconnect UI
  tests pass for definitive stop notices, the durable terminal explanation,
  normal reauthentication and retained-request behavior, with no page errors.
- Final pinned `mvn clean install` via `tools/target-build.ps1 install`: **passed**
  across all modules: 19 common, 876 server and 297 native test totals, with
  zero failures/errors and 23 expected opt-in skips. This full run includes the
  final timer-pressure and uncertain-outcome corrections and completed at
  22:29:49 UTC in 15m45s.
- `git diff --check` passes.

The first full rework build caught four historical-projection restore failures.
The implementation now shares equal states without introducing a new equality
admission rule; all four tests pass in the focused rerun. Independent review
also found a canonical depth off-by-one at an empty-container boundary; the
writer now preserves the old 64-container completed-result rule and has a
round-trip boundary regression.

## Dev-local and comparison

Both revisions used `node tools/dev-local.mjs --restart --quick`, the same
existing database/backup data and the same local headless UI soak driver.
No games, checkpoints or credentials were removed to obtain a passing startup.

Clean main (`33d95b7c6`) started, then repeatedly exhausted its **768 MiB** heap
while the existing computer service reloaded persisted games. Docker recorded
**three restarts**, followed by **exit code 3** and unhealthy/exited state at
20:58:46 UTC. The UI driver could not get past loading saved teams because the
server was unavailable. This baseline is a reproduced crash loop, not a
completed 20-minute gameplay run.

The first rework started successfully but later exhausted the heap once at
21:09:44 UTC during Unicode checkpoint/journal reassembly. Its initial zero-
restart observation was incomplete and is withdrawn. The new dump showed one
22 MB warm engine beside the incoming reconstruction. The final correction
removes artifact-sized encoding buffers and the replay reassembly graph and
reduces the cap to the measured Unicode-safe policy above. See the heap report
for the stack and ownership counts. The final implementation started with `--quick` at 22:15:26 UTC and remains
running/healthy with zero automatic restarts. Proxy authentication-gate checks
passed on initial connection and reconnect; Firebase ADC preflight and the
computer-service readiness check passed. The normal hosted result page then
confirmed the stored 1-0 / revision 557 result. Quick mode skipped duplicate
startup tests; the full build and browser checks above ran separately.

The first authenticated attempts were rejected at sign-in. Refreshing and
reloading through the normal application eventually succeeded. The previously
proposed expanded credential-backed diagnostic was rejected by automatic
approval review and was not run; no authorization bypass or credential change
was needed.

The final memory-correction soak ran **20.0 minutes**: three games started,
**one naturally reached full time at revision 557, score 1-0**, 158 driver
choices, 22 exports and one trace. The server stayed healthy with **zero OOM,
zero fatal engine failures and zero automatic restarts**. Peak container RSS
was about 1,140 MiB; RSS includes JVM native memory as well as the 768 MiB heap.
The normal hosted result page subsequently returned `ACCEPTED` with the stored
revision 557 / 1-0 result on the final implementation, with no UI alerts.

This was **not a clean latency or unattended-driver pass**. There were 13 driver
errors, including stale/disabled action and interception controls. Three
checkpoint deadline refusals were recovered by a companion that clicked the
visible `Repeat retained request` control; every assisted retry was recorded.
No timeout or durability guarantee was relaxed. The final timer-pressure
follow-ups were verified by focused/full tests and a subsequent exact-code
`--quick` restart; they were added after the 20-minute memory soak.

The earlier stalled revision 399 run is superseded by this comparison. The
measured memory isolation and completed recorded game improve the evidence;
serialization/deadline performance remains #548, and driver improvements are
separate work. The final pin/retry follow-up preserves server-owned reaction
expiry across pressure, SQL failure and uncertain commits.

## Independent review and remaining work

## Standards

The scoped review approved the bounded handoff, eviction and retry corrections.
The final Unicode/journal review also reports no actionable findings. The reviewer inspected the implementation and tests; execution was performed by the implementer.

## Spec

The canonical-depth and recovery-pruning findings are fixed and regression-
tested. The Unicode/journal correction is approved with no actionable findings. Live authenticated soak evidence and its latency limitations are recorded separately in this report.

The PR remains open for independent review; no merge or deployment is authorized.
The unrelated main-checkout edit to `docs/specs/gameplay-soak-review.md` remains
untouched. No private heap data is included in these reports. Snapshot/delta
format redesign remains #548 and staged placements remain #556. A longer unassisted latency soak remains useful after the #548 serialization and driver follow-ups.

## Reproduction commands

Use the pinned JDK/Maven configured by the repository bootstrap:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 install
cd browser-client
npm.cmd test
npm.cmd run build
npm.cmd run test:reconnect-ui
cd ..
node tools/dev-local.mjs --restart --quick
```

The opt-in native memory test is `MatchMemoryWorkloadTest`. Set
`MATCH_MEMORY_WORKLOAD` to a local JSON output path and pass
`-DargLine=-Xmx768m` to pinned Maven. The staged workload defaults to an 8 MiB
checkpoint built from committed native decisions plus a 100-decision warm
engine. It exercises a checkpoint and journal tail, native restoration and
terminal result serialization. Set `MATCH_MEMORY_WORKLOAD_MIB` to adjust the
checkpoint target.
These test processes require no database or Firebase credentials. The local
soak uses the existing signed-in browser profile and normal application flow.


## Second review response (2026-11-16)

Review: [maintainer follow-up](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/559#issuecomment-6906842421).

**Merge hold:** retain the size-limit result feature, but merge this PR only after
#556 implements staged placement **and the setup adjustment limit**, and #558
lands the computer/kick-off guards. Neither dependency was merged at this review.
Rebase onto their integrated main before final validation. This PR must not ship
the size-limit result ahead of those safeguards: unlimited placements currently
let a leading coach inflate history into a forced victory.

- Removed the safety writer's acknowledgement/latch and all worker waiting.
- Persisted absolute quarantine expiry separately from current-task breadcrumbs,
  protecting repeated restarts and selective administrator clear.
- Enforced OOM quarantine at the shared recovery-read boundary, including coach,
  observer, chat, computer and maintenance entry points. The coach message states
  that the match is unavailable, the thirty-minute pause and admin-clear option.
- Expressed admission as total retained charges plus **one shared working
  allowance**, sized for the largest admitted history on the serial worker.
  Stable or shrinking checkpoints reuse their existing reservation. Terminal or
  idle durable victims precede active victims; timed reactions remain pinned.
- Cached the size-stop flag when ending and rebuilt it once on restore, retaining
  compatibility with older coach-attributed records.
- Recorded new server-generated stops with `system` history/transcript attribution.
  Recovery and browser transcript validation accept that specific terminal reason;
  the match log describes the server limit without blaming either coach.

The November 20 integration supersedes this review's merge procedure. The
integrated three-hour soak remains the acceptance test.

### Follow-up validation

- Regression baseline: stalled-writer handoff exceeded the no-wait bound, and
  coach reconnect returned `ACCEPTED` instead of `MATCH_QUARANTINED`. The separate
  constructor probe failed with `Second restart bypassed quarantine`; it now passes.
- Full clean install passed (20m22s): 19 common, 879 server and 297 native cases,
  with 23 expected opt-in skips. The later persistence/expiry corrections were
  then covered by the full affected server suite: **882 cases, 0 failures/errors,
  16 expected skips** (4m24s). The final diagnostic-only result-read logging hunk
  also passed `MatchResultV2Test`.
- Focused final safety/checkpoint/reaction/transcript suite: **64 passed**. Covers
  the shared recovery-read quarantine boundary, three 25 MiB active accounting
  fixtures without eviction, terminal-before-active preference, selective clear,
  repeated restart, expiry, v1 compatibility, 513-suspect round trip and overflow
  preserving the last valid tracking file.
- An earlier final-server attempt had one OOM-child breadcrumb handoff failure.
  The child now confirms persistence through a test-only writer signal rather
  than polling a file concurrently with atomic replacement. Production remains
  nonblocking. Five separate real JVM OOM children then each exited **3** and
  produced the configured dump; the full final server suite passed afterward.
- At `-Xmx768m`, the real Unicode checkpoint/delta/native restore and terminal
  result probe passed with **47,672,358 decoded bytes** and a **13,903,827-byte**
  warm resident retained. Sampled retained heap afterward: 348,008,360 bytes;
  restore/serialization took 11,799 ms. This is memory evidence, not a two-second
  latency pass. #548 remains relevant.
- Browser: 544 complete unit tests plus the added neutral server-log regression
  pass (545 distinct cases); production build and reconnect UI checks pass.
  The browser accepts the specific system size-stop record, rejects system coach
  decisions, renders a neutral score notice and explains quarantine to coaches.
- Both independent review axes approve, with no remaining scoped findings.
- Dev-local restarted using `node tools/dev-local.mjs --restart --quick`; Java
  server and database became healthy with zero automatic restarts. The real
  proxy authentication gate and reconnect checks passed. No persisted game data
  or local credential configuration was cleared.

A separate normal-UI stored-result read repeatedly returned `PERSISTENCE_FAILED`
while the server stayed healthy. This is **not a clean runtime UI acceptance
pass**; the result boundary now logs the existing redacted persistence diagnostic
without changing its response. The diagnostic confirmed `CleanupNotStarted`,
SQL state `HYT00`: the JDBC allowance was exhausted before cleanup. This is a
remaining request-budget gap relevant to #548 and integrated validation; the
memory probe and healthy startup do not establish a clean result-page pass.
The service remained healthy with zero automatic restarts after the diagnostic
restart. No broader latency fix is claimed by these review corrections.

Local ignored evidence: `.tools/554-round2-install.log`,
`.tools/554-round2-server-release.log`, `.tools/554-round2-focused-final.log`,
`.tools/554-round2-native-memory.log`, `.tools/554-round2-browser.log`,
`.tools/554-round2-browser-final.log`, `.tools/554-round2-browser-build.log`,
`.tools/554-round2-reconnect-final.log` and the dev-local startup logs.
