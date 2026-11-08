# Retained-history scaling experiment

Date: November 8, 2026. Requested follow-up to [#489](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489). Production source: `46d896256758f1deb0417566e556b56228d90d21`; experiment branch: `test/489-history-scaling`. Production code was not changed. Dev-local remains stopped.

The verified results and remaining limits are also [recorded on #489](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489#issuecomment-6724076686). Experimental code and this report accompany the [performance observability feature](../performance-observability/feature.md) in the user's authorized publication handoff for independent review.

**Result: retained history causes substantial server-side slowdown when an action triggers journal compaction.** In this experiment, long-history compactions took approximately 20–23 times as long as fresh ones. Ordinary journal appends increased much less. This demonstrates a history-sensitive processing boundary; it does not establish the complete cause of the reported live-game experience or the previous one-second spike.

## Matched action results

All values below are **median server handling milliseconds**, excluding fixture loading, SQL, compression, network and browser presentation. Each cell contains 12 measured actions: four per independently launched JVM, repeated three times. One additional action per cohort was excluded as warm-up.

| Added retained decisions | Recovery artifact MiB | Move: journal append | Pass/catch: journal append | Move: compaction | Pass/catch: compaction |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 (fresh baseline) | 0.44 | 12.3 | 16.8 | 26.6 | 23.5 |
| 32 | 1.19 | 12.6 | 13.5 | 34.3 | 37.3 |
| 128 | 3.45 | 12.4 | 15.6 | 84.7 | 83.5 |
| 512 | 12.51 | 14.6 | 21.8 | 264.8 | 271.1 |
| 1,024 | 24.58 | 19.5 | 30.1 | 538.5 | 547.2 |

The fresh fixture already has eight transcript records and 42 native commands from starting the match and preparing the target action. The longest has 1,032 transcript records and 1,066 native commands. Added decisions are history-depth controls, **not turn numbers**. MiB means 1,048,576 bytes.

The long-history compaction medians were consistent across the three runs: move **526.0 / 538.5 / 544.1 ms**; pass **536.5 / 542.7 / 553.1 ms**. The maximum observed compaction handling time was **580 ms for movement** and **650 ms for passing**. Twelve samples per cell are insufficient for stable tail-latency estimates; the exported results include p95/max and every repetition's median.

## Where the time went

Median phase durations at the longest history:

| Phase | Move with compaction | Pass/catch with compaction |
| --- | ---: | ---: |
| Whole handling | 538.5 ms | 547.2 ms |
| Action application | 7.8 ms | 27.2 ms |
| Checkpoint total | 529.6 ms | 517.6 ms |
| Recovery serialization | 202.0 ms | 199.5 ms |
| Recovery cursor preparation | 309.5 ms | 304.4 ms |
| Recovery fingerprint | 14.2 ms | 15.0 ms |

Checkpoint subphases are nested, and independently calculated medians need not add to the median total. These are server processing durations, not frame/display timings.

The cursor path is particularly relevant: after producing the full serialized recovery document, `SetupApplication.checkpoint()` passes it to `RecoveryJournal.cursor()`. That method parses and validates the envelope, counts retained history (including parsing `eventsJson`), computes a metadata signature and measures its UTF-8 size. The measured cursor phase alone exceeded the serialization phase in this long-history fixture. See [checkpoint](../../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/SetupApplication.java) and [cursor construction](../../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/RecoveryJournal.java).

Measured allocation also grew substantially. A movement compaction allocated **30.8 MiB when fresh versus 631.6 MiB with long history**; a pass compaction allocated **23.6 versus 637.8 MiB**. These are cumulative allocations on the request thread, including test instrumentation, **not retained heap, peak RAM or database bytes**. The experiment did not isolate garbage-collection pauses, so it does not assign a specific share of the delay to GC.

Ordinary appends stayed in the tens of milliseconds. Movement medians were somewhat sensitive to run order, while pass application rose from roughly 13.0 to 25.9 ms. Thus the ordinary action path is not completely independent of history, but the pronounced slowdown in this test is at compaction.

Fixture restore/load preparation also grew from roughly **26–29 ms** to **840–867 ms** across the cohorts. That includes native restoration and initial checkpoint work in the harness and is outside the resident-action table. It is not the cost paid by every action in a resident match and is not a measured network reconnect time.

## Interpretation

- The growth concern is confirmed for server checkpoint processing. Bounded journal size does not bound the size of the full retained match history. Periodic compaction consolidates history rather than truncating it.
- The useful optimization boundary is full-checkpoint creation and cursor reconstruction from the newly serialized document. Any correction must preserve exact recovery data, retry behavior and commit-before-acknowledgment.
- Appends and compactions have different scaling behavior. A later match can therefore have relatively quick ordinary actions interspersed with increasingly expensive checkpoint actions. The production journal's entry/byte limits and native-log resets can trigger full checkpoints; this test forced the entry boundary to measure it independently.
- This is evidence of a contributor to late-game latency. It does not establish its frequency in the user's match, explain all browser stalls, or reproduce a natural seven-turn action sequence. Browser history/rendering and database/storage compression were excluded.

## Method and correctness

The generator performs real accepted out-and-back player placements during setup. Each even-length history returns to the same formation, then advances through the native engine to a regular turn. A controlled pitch with two players on the field is prepared for both target actions; the match retains its 22-player roster. Current players and ball projections are asserted identical across all five history lengths. Native command snapshots are frozen after each history-building action, as at the production recovery boundary.

The measured action is either a one-square native movement or a native square-targeted pass followed by a catch, with successful general dice fixed to six. Required revision/counter values differ with history length; player identities, target coordinates and current pitch are otherwise held constant.

Each sample restores the exact retained artifact, loads an application session, then starts timing. Both cohorts use a journal-capable repository. For the compaction cohort, the resident cursor's entry count is set to the real 31-entry boundary immediately before the measured action. This changes the compaction trigger only; the retained history, current pitch and requested action are unchanged. It exercises the actual full checkpoint, fingerprint and cursor-preparation path. No production configuration or source is modified.

All 240 measured actions were accepted as new requests. The movement destination or successful catch and repository generation advancement were checked for every sample. Every starting artifact restored exactly. A separate verification JVM performed a post-action journal/full-checkpoint restore round trip for all 20 history/action/path combinations. The repository is in memory: these checks establish recovery parity and ordering in the harness, not physical SQL durability.

Windows, JDK **21.0.11**, AMD Ryzen 7 260 with Radeon 780M. Timed JVM maximum heap: **768 MiB**, matching the dev-local server. Preparation and multi-copy verification use separate **2 GiB** JVMs and are not included in action timings. History order was ascending, descending and rotated across the three repetitions. Heavy local builds/browser suites and dev-local were stopped during measurements.

The reported median is the middle value, averaging the central pair for even counts. P95 uses nearest rank. Raw duration samples are combined only within equal-count matched cohorts; absolute clocks are not aligned. Per-JVM medians remain available to expose order effects.

## Reproduction and evidence

From the repository root, with the pinned Java/Maven setup and installed PowerShell 7:

```powershell
$env:HISTORY_SCALING_DIR='.tools/history-scaling-new-run'
node tools/diagnostics/run-history-scaling.mjs
node tools/diagnostics/analyze-history-scaling.mjs .tools/history-scaling-new-run --assert-flat
```

Choose a new output directory; the runner refuses to overwrite an experiment. `--smoke` runs the smaller functional check. `--generate-only` and `--measure-only` allow separate preparation and reuse of retained fixtures. `CAPTURE_POWERSHELL` overrides the PowerShell 7 path. The workload is opt-in through `HISTORY_SCALING_RUN=1`; ordinary test runs skip it.

The final analysis returned **exit code 1**, reproducing the declared history-growth signal: the longest-history median exceeds fresh by both **2× and 50 ms**. That discriminator is an experiment assertion, not a universal product SLA. Move compaction crossed it at **20.22×** and pass compaction at **23.24×**; ordinary appends did not cross the combined discriminator.

Sanitized numerical evidence, artifact hashes, runtime identity, all cohort distributions and limitations: [history-scaling-results.json](history-scaling-results.json). Raw synthetic fixtures, per-action numeric samples and logs remain locally under `.tools/history-scaling-20261108-final`. The test does not access credentials, real matches, SQL or remote services.

Independent Python `statistics.median` checks confirmed all 20 cohorts' medians, maxima and allocation summaries directly against the 240 raw action samples. The exported JSON matches the computed summary and excludes fixture paths and synthetic player identities. Both JavaScript entry points pass syntax checks, `git diff --check` passes, and final shutdown verification confirms dev-local containers and all four loopback ports remain stopped/closed.

## Harness corrections and excluded runs

Small fixture checks caught an action-field lookup mismatch, an uninitialized save/resume retention clock, and the distinction between recipient targeting and square targeting after declaring Pass. These were corrected before final measurement; successful native movement/catch and recovery checks prevent accepting these failures as latency data.

The first large preparation attempt exhausted a 768 MiB heap while holding multiple complete states for round-trip checking. Preparation and verification were isolated in larger JVMs. An earlier timed loop also accumulated inline Mockito bookkeeping between completed synthetic lifetimes; disposing that bookkeeping outside the timed interval allowed the unchanged 768 MiB measurements to finish. Neither harness failure is presented as proof of a production memory leak or production out-of-memory condition.

An initial direct full-checkpoint fallback control showed history growth but excluded the journal cursor's compaction work. The final experiment instead forces the actual journal boundary with journaling enabled. Only the final three runs supply the tables above; earlier controls and incomplete runs are excluded. No timing threshold, correctness assertion or measurement heap was relaxed to obtain the final result.
