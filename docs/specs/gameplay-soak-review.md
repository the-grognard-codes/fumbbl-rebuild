# Gameplay soak review

Status: tracked in [#522](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/522)
(this file is its local mirror). Reviewer: Claude. Date: 2026-11-12.

| Finding | Issue |
|---|---|
| 1. Engine worker death | [#523](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/523) |
| 2. Heap exhaustion, heap dump on OOM | [#524](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/524) |
| 3. Unlogged `PERSISTENCE_FAILED` | [#525](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/525) |
| 4. Compaction checkpoint growth | evidence on [#489](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489) |
| 5. AI bursts and playback backlog | [#526](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/526) |
| 6. DOM growth and pan latency | [#527](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/527) |
| Follow-up: deferred PR #528 review findings | [#530](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/530) |
| Follow-up: compaction retry after genuine appends (PR #529) | [#531](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/531) |
| AI match permanently unloadable after `PERSISTENCE_FAILED` (blocks soaks) | [#532](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/532) |
| Follow-up: pending final state and nested computer retries (PR #533/#534) | [#535](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/535) |

Fixes in review on 2026-11-12: [PR #528](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/528)
(#523 plus #524's heap-dump flags) and [PR #529](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/529)
(bounded cursor fix for #489).
Base: `main` at `55f0be032`. Related: [gameplay latency journal](gameplay-latency-journal.md)
(latest implementation status of the durable journal), [ADR 0006](../adr/0006-single-engine-worker.md).

## Context

Coaches report small stutters, input and output lag, the pitch trailing the
cursor while panning, and AI turns that "time travel" (several actions commit
before the board redraws). It is noticeable at kickoff and worsens as a match
progresses. Frame rate alone does not appear to be the cause.

An unattended soak played the home side of AI-opponent matches on the dev-local
stack through the production UI and recorded:

- a diagnostics overlay export (graph mode, detailed phases, probes) every 50 s;
- a 20 s Chrome trace around a scripted right-drag pan every 30 min;
- page runtime metrics every 30 s and server container stats every 60 s;
- the arrival time and size of every authoritative `setupState` revision.

Driver: `browser-client/test/overnight-soak.mjs` (not yet committed). Raw data,
kept locally: `.tools/overnight-soak/run-2026-11-12T06-22-02-188Z/`.

The 7-hour run ended after **37 minutes**: 2 matches (1 completed), 208 home
decisions, 42 captures, 2 traces. Finding 1 is why. Both matches show the same
patterns, but the sample is small; treat magnitudes as indicative.

Environment: Windows, AMD Ryzen 7 260 (16 threads), 15 GiB, Chrome 157,
1280 × 665 CSS px at device pixel ratio 2. Server container `-Xms128m -Xmx768m`, JDK 21.0.11.

## Hard defects

### 1. An `Error` on the engine worker kills it permanently; health stays green — Critical

- **Where:** `ffb-server/src/main/java/com/fumbbl/ffb/server/net/ServerCommunication.java:53`
  catches only `RuntimeException` around `work.run()` (line 52).
- **Observed:** at 06:48:51 UTC `browser-engine` threw `OutOfMemoryError` inside
  `SetupApplication.checkpoint` (stack below). The thread ended. All later work
  queued behind a dead worker: the match stalled with the AI's turn clock at
  0:00, a reload showed **Disconnected**, and the computer daemon logged
  repeated transport errors. Docker still reported the container **healthy**,
  restarts 0.
- **Failure scenario:** any `Error` on the single engine worker leaves every
  match on the server frozen until someone restarts it by hand.
- **Fix:** catch `Throwable` at the worker boundary, log it, and fail the process
  so the orchestrator restarts it (or replace the worker and fail its in-flight
  work explicitly). Make the health check assert that the engine worker is alive
  and draining its queue.

```
Exception in thread "browser-engine" java.lang.OutOfMemoryError: Java heap space
  at java.lang.String.getBytes
  at com.fumbbl.ffb.server.match.RecoveryJournal.bytes(RecoveryJournal.java:121)
  at com.fumbbl.ffb.server.match.RecoveryJournal.cursor(RecoveryJournal.java:26)
  at com.fumbbl.ffb.server.match.SetupApplication.checkpoint(SetupApplication.java:325)
  at com.fumbbl.ffb.server.match.SetupApplication.handleWithOutcome(SetupApplication.java:470)
  at com.fumbbl.ffb.server.match.SetupApplication.handleComputerWithOutcome(SetupApplication.java:381)
  at com.fumbbl.ffb.server.local.BrowserV2Adapter.handleComputerConnection(BrowserV2Adapter.java:483)
  ...
  at com.fumbbl.ffb.server.net.ServerCommunication.run(ServerCommunication.java:52)
```

### 2. The 768 MB heap filled after 80 minutes of uptime — Critical, cause not identified

- **Observed:** the server container started at 05:28 UTC and exhausted its heap
  at 06:48, after roughly six AI matches (three abandoned mid-match by short
  test runs, two from the soak, plus any interactive play). Each match's
  persisted recovery artifact (`ffb_match_recovery.artifact_json`) is about
  **727 KiB** at revision ~450.
- **Implication:** resident state per match is far larger than its persisted
  artifact, or something is retained across matches. Abandoned matches stay
  resident for `IDLE_MILLIS` = 30 min (`SetupApplication.java:45`, `:94-99`), and
  up to 32 sessions may be resident (`SetupApplication.java:187`, `:214`, `:234`), which a
  768 MB heap cannot hold at this footprint.
- **Failure scenario:** a few concurrent or recently abandoned matches exhaust
  the heap, triggering finding 1.
- **Next step:** the server image is a JRE without `jcmd`, so no heap histogram
  was possible. Add `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=<volume>`,
  reproduce with sequential AI matches, and analyze the dump's dominator tree.
  Add a regression test that measures retained size of one `SetupSession` at a
  late-match revision and asserts release after completion or idle eviction.

### 3. `PERSISTENCE_FAILED` discards the `SQLException` unlogged — High

- **Where:** `SetupApplication.java:485`
  (`catch (SQLException failure) { return outcome(failure(requestId, "PERSISTENCE_FAILED"), false); }`).
- **Observed:** match 1 stalled from about 06:31 UTC. The computer daemon's
  error log holds exactly `Load rejected: PERSISTENCE_FAILED` and
  `Action rejected: PERSISTENCE_FAILED`; the server log has no entry. The AI never
  acted again; the match only reached full time after an 8-minute stall and a
  client reload.
- **Failure scenario:** a transient or memory-pressure database failure silently
  freezes an AI match with no operator signal.
- **Fix:** log the exception with match id and phase. Give the computer coach a
  bounded retry or reload path after `PERSISTENCE_FAILED` instead of idling.

### 4. Compaction checkpoints grow through the match and block the single worker — High

- **Where:** compaction in `SetupApplication.checkpoint` (`:305-326`) serializes
  the full artifact, fingerprints it, stores it, then
  `RecoveryJournal.cursor` (`RecoveryJournal.java:22-27`) re-parses the full
  artifact (up to `MAX_ARTIFACT_BYTES` 128 MiB), builds a signature from a copy,
  and calls `getBytes()` on the whole string (`:121`). All of this runs on the
  engine worker.
- **Observed (worst checkpoint per ~50 s capture window):**

  | Minutes into match | Match 1 | Match 2 |
  |---:|---:|---:|
  | 1 | 364 ms | 380 ms |
  | 3 | 683 ms | 803 ms |
  | 5 | 1,226 ms | 1,213 ms |
  | 7 | 1,683 ms | 1,435 ms |
  | 9–10 | 2,225 ms | 2,037 ms |

  Median checkpoint stays near 40 ms. Server phase means across the run:
  `RECOVERY_CURSOR` **459 ms** (21 compactions), `RECOVERY_SERIALIZE` 53 ms,
  `CHECKPOINT_STORE` 38 ms, `CHECKPOINT_SQL` 23 ms. Requests queued behind a
  compaction: probe queue wait up to **4.1 s**; mutation round trips up to
  2.3 s.
- **Failure scenario:** every compaction stalls every match on the server for
  seconds late in a match, which coaches see as freezes and bursts.
- **Fix:** derive the new cursor from the in-memory payload counts, signature and
  hash computed during serialization; do not re-parse or re-encode the artifact
  just written. Then consider moving compaction serialization off the engine
  worker or making it incremental, consistent with ADR 0006's bounded-work rule.

### 5. AI actions publish in bursts; client playback backlog reaches 30 — High

- **Observed (`revisions.jsonl`):** inside an AI turn, revisions arrive about
  100 ms apart in runs of up to 12 (for example 12 revisions in 1.1 s; 7 in
  0.6 s after a 4.2 s silence). AI inter-arrival p50 / p90 / p99: 138–156 /
  1,255–1,846 / 10,101–14,072 ms. `setupState` size stays 23–36 KB throughout, so
  payload growth is not the cause. Captured playback state showed backlogs of
  19, 19 and **30** queued revisions.
- **Failure scenario:** the board lags the authoritative state by many actions,
  then catches up, which coaches see as "time travel".
- **Fix:** finding 4 removes most of the silences that create the bursts.
  Separately, define playback behavior for a large backlog (pace, coalesce
  intermediate states, or shorten per-beat animation when behind), with a
  test that a 30-revision backlog drains within a stated bound.

### 6. The match page grows ~13 DOM nodes per revision; compositing cost follows — High

- **Observed (CDP `Performance.getMetrics`):** DOM nodes about 930 → 6,300
  (match 1) and 1,100 → 6,000 (match 2); `LayoutObjects` about 2,000 → 8,000.
  JS heap stays 25–48 MB, so this is DOM growth, not a JS leak.
- **Trace evidence:** main-thread self time in `Layerize` was 3.5 s of 20 s early
  in match 1 and **9.0 s of 20 s** late in match 2 while the game was idle.
  Pan-drag `EventLatency` (`MOUSE_DRAGGED`, 240 samples each) rose from
  p50 / p95 / max 8 / 26 / 80 ms to **18 / 36 / 111 ms**. Diagnostics
  frame-interval p95 rose from 12–16 ms to 36–38 ms through each match; longest
  tasks grew from about 50 ms to about 100 ms.
- **Failure scenario:** panning and every repaint get slower each turn, which
  coaches see as the pitch trailing the cursor and growing stutter.
- **Fix:** identify the container that grows with revisions (likely the game log
  or transcript list) and virtualize or cap what is mounted. Add a regression
  check that DOM node count stays bounded across a long synthetic match.

## Judgement calls

- **Idle repaint.** With nothing changing, the page still spent about 75% of
  main-thread task time per 30 s (CDP `TaskDuration` about 22.5 s per 30 s
  while script, layout and style totalled about 1 s), dominated by `Layerize`.
  Something invalidates paint every frame and each invalidation rebuilds the
  enlarged layer tree. The diagnostics overlay in graph mode re-renders every
  250 ms and contributes; repeat with diagnostics off before attributing it to
  gameplay UI. Look for continuous CSS or canvas animations on the pitch.
- **Text-selection work during pans.** About 1.2 s of
  `EditingUtility::nextCandidateAlgorithm` / `previousCandidateAlgorithm`
  appeared during the scripted drags. `user-select: none` on the pitch viewport
  is a cheap experiment.
- **Heap headroom.** Even after finding 2 is fixed, `-Xmx768m` against a
  32-session activation limit deserves an explicit sizing rule.

## Recommended order

1. Finding 1 (process restarts instead of a silent freeze) and finding 3 (log
   the failure). Small and reduce the impact of everything else.
2. Finding 2 heap dump, then fix the retention it shows.
3. Finding 4 cursor rework; re-measure finding 5 afterwards.
4. Finding 6 DOM bound; re-measure pan latency and the idle repaint.

## Re-measurement

Re-run the soak after each step and compare per-capture worst checkpoint,
probe queue wait, playback backlog, DOM node count, `Layerize` share and
pan `EventLatency` against the tables above:

```powershell
cd browser-client
node test/overnight-soak.mjs --hours 7
node ../tools/diagnostics/analyze-capture.mjs <run>/captures/capture-0010.json <run>/captures/capture-0030.json
```

The driver stops when it cannot create a match (for example after finding 1
occurs), so a longer unattended run depends on finding 1 being fixed.
