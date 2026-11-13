# Build the journal cursor during compaction

[Issue #489](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489) ·
[November 12 soak evidence](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489#issuecomment-6838571952) ·
`codex/489-recovery-cursor` from `55f0be032`.

Full checkpoint serialization supplies the ordered payload, its checksum and
the envelope byte length. The journal combines those with the session counts
and native log epoch. It calculates the same metadata signature from the payload
without decoding the artifact, checking its checksum again, or encoding the
artifact again to count bytes. It installs the cursor only after a successful
save. Stored checkpoint reads still validate the artifact. Self-review checked
that the serialized envelope, committed fingerprint, generation checks,
append thresholds and recovery read path are unchanged.

The full checkpoint limit lives in `RecoveryArtifactJson`. Session encoding and
restore, journal compaction and assembly, and storage decoding use that same
128 MiB limit. Journal entries retain their smaller limit.

The [existing history workload](../../../tools/diagnostics/run-history-scaling.mjs)
generated one shared set of fixtures (0, 128, 512 and 1,024 retained setup
decisions). Before and after each used two fresh Temurin 21.0.12.1 JVMs,
a 768 MiB heap, one excluded warm-up and three measured actions per
history/action/storage cohort per JVM. Both runs used the same fixture hashes,
native movement and pass actions, and the same forced 31-entry cursor boundary
for compaction. The table shows medians in milliseconds, before → after.

| Added decisions | Action | Cursor | Serialize | Fingerprint | Checkpoint | Handling |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | Move | 9.98 → 2.56 | 16.18 → 17.84 | 0.41 → 0.42 | 26.79 → 21.09 | 39.85 → 36.76 |
| 0 | Pass | 8.99 → 1.32 | 12.08 → 9.52 | 0.31 → 0.37 | 21.59 → 11.58 | 38.80 → 28.38 |
| 128 | Move | 57.33 → 3.14 | 56.81 → 60.04 | 2.61 → 2.77 | 113.72 → 67.02 | 124.79 → 80.37 |
| 128 | Pass | 56.29 → 1.11 | 48.51 → 48.66 | 2.04 → 2.45 | 101.53 → 52.76 | 121.95 → 72.65 |
| 512 | Move | 209.24 → 2.13 | 168.09 → 134.35 | 7.81 → 7.25 | 400.50 → 146.22 | 413.84 → 155.17 |
| 512 | Pass | 184.25 → 0.87 | 145.77 → 132.67 | 7.75 → 7.45 | 350.44 → 142.18 | 378.66 → 163.18 |
| 1,024 | Move | 451.29 → 1.55 | 349.65 → 274.72 | 17.27 → 17.07 | 825.61 → 294.17 | 843.64 → 307.28 |
| 1,024 | Pass | 443.35 → 0.98 | 328.68 → 238.01 | 17.03 → 14.33 | 791.96 → 253.42 | 835.11 → 289.54 |

At 1,024 decisions (24.66 MiB), the in-memory store phase was 0.01–0.02 ms.
Append cursor time remained zero, and median worker allocations stayed about
22 MiB for movement and 28 MiB for pass. Compaction request allocations fell
from about 630–631 MiB to 300–303 MiB cumulatively; these figures do not measure
retained heap. The phase durations are nested. No SQL, socket, or live soak
timings were collected. Full serialization still grows with history and
dominates the remaining compaction latency.

Run the harness with `HISTORY_SCALING_RUN=1`, `HISTORY_SCALING_LEVELS=0,128,512,1024`,
and the selectors `HistoryScalingWorkloadTest#generateFixtures`,
`HistoryScalingWorkloadTest#measureFixtures`, and `HistoryScalingWorkloadTest#verifyFixtures`.
For both measurements, set `HISTORY_SCALING_SAMPLES=3` and run with
`HISTORY_SCALING_REPEAT=1` and `2`. Set `HISTORY_SCALING_DIR` to a separate output
directory on each revision and copy the same fixture manifest to both; it
points to the shared generated artifacts. Use 2 GiB for fixture generation
and verification. Local raw reports are under `.tools/489-before` and
`.tools/489-after` in the #523 workspace.

## Review rerun

The original run discarded its first sample for each cohort. The review rerun
recorded it on both revisions with the same harness and fixture hashes. It
used two fresh 768 MiB JVMs per revision, three warmed samples per JVM and
cohort, and the same fixture ordering for each matching JVM.

Each cell lists median / nearest-rank p95 / maximum in milliseconds,
before → after. With six samples, p95 equals the maximum and does not
estimate a production tail percentile.

| Added decisions | Action | Path | Handling | Checkpoint | Cursor |
| --- | --- | --- | --- | --- | --- |
| 0 | move | compact | 47.27 / 55.36 / 55.36 → 40.46 / 60.72 / 60.72 | 30.98 / 34.44 / 34.44 → 24.68 / 31.59 / 31.59 | 10.46 / 13.83 / 13.83 → 2.32 / 4.02 / 4.02 |
| 0 | move | append | 37.07 / 49.72 / 49.72 → 39.11 / 59.08 / 59.08 | 14.38 / 23.26 / 23.26 → 15.07 / 25.00 / 25.00 | 0.00 / 0.00 / 0.00 → 0.00 / 0.00 / 0.00 |
| 0 | pass | compact | 33.08 / 42.12 / 42.12 → 35.69 / 52.10 / 52.10 | 17.53 / 22.98 / 22.98 → 16.12 / 32.58 / 32.58 | 7.28 / 8.20 / 8.20 → 1.46 / 1.59 / 1.59 |
| 0 | pass | append | 25.97 / 32.39 / 32.39 → 22.84 / 27.58 / 27.58 | 5.82 / 8.78 / 8.78 → 5.26 / 7.03 / 7.03 | 0.00 / 0.00 / 0.00 → 0.00 / 0.00 / 0.00 |
| 128 | move | compact | 119.04 / 156.30 / 156.30 → 74.18 / 79.96 / 79.96 | 105.64 / 139.08 / 139.08 → 59.32 / 60.03 / 60.03 | 57.96 / 76.98 / 76.98 → 2.23 / 2.43 / 2.43 |
| 128 | move | append | 21.29 / 22.61 / 22.61 → 22.25 / 39.28 / 39.28 | 9.35 / 10.63 / 10.63 → 10.39 / 20.13 / 20.13 | 0.00 / 0.00 / 0.00 → 0.00 / 0.00 / 0.00 |
| 128 | pass | compact | 122.19 / 140.46 / 140.46 → 62.65 / 72.59 / 72.59 | 99.45 / 117.44 / 117.44 → 46.13 / 59.97 / 59.97 | 57.25 / 71.33 / 71.33 → 1.29 / 1.88 / 1.88 |
| 128 | pass | append | 26.10 / 35.64 / 35.64 → 28.77 / 51.87 / 51.87 | 5.46 / 12.97 / 12.97 → 5.92 / 12.91 / 12.91 | 0.00 / 0.00 / 0.00 → 0.00 / 0.00 / 0.00 |
| 512 | move | compact | 359.41 / 413.20 / 413.20 → 199.52 / 218.59 / 218.59 | 345.51 / 388.48 / 388.48 → 182.44 / 199.93 / 199.93 | 179.02 / 222.31 / 222.31 → 2.78 / 4.57 / 4.57 |
| 512 | move | append | 19.37 / 21.97 / 21.97 → 26.78 / 51.82 / 51.82 | 9.17 / 10.36 / 10.36 → 11.94 / 24.12 / 24.12 | 0.00 / 0.00 / 0.00 → 0.00 / 0.00 / 0.00 |
| 512 | pass | compact | 377.17 / 420.38 / 420.38 → 176.54 / 215.22 / 215.22 | 352.98 / 391.09 / 391.09 → 154.67 / 194.90 / 194.90 | 204.21 / 237.91 / 237.91 → 1.32 / 3.38 / 3.38 |
| 512 | pass | append | 35.82 / 51.01 / 51.01 → 30.89 / 34.22 / 34.22 | 6.51 / 8.42 / 8.42 → 4.97 / 5.94 / 5.94 | 0.00 / 0.00 / 0.00 → 0.00 / 0.00 / 0.00 |
| 1024 | move | compact | 660.67 / 746.95 / 746.95 → 343.06 / 404.38 / 404.38 | 646.16 / 732.10 / 732.10 → 326.26 / 388.93 / 388.93 | 338.28 / 431.07 / 431.07 → 2.60 / 3.04 / 3.04 |
| 1024 | move | append | 32.08 / 43.08 / 43.08 → 31.43 / 52.07 / 52.07 | 13.58 / 19.90 / 19.90 → 13.42 / 21.37 / 21.37 | 0.00 / 0.00 / 0.00 → 0.00 / 0.00 / 0.00 |
| 1024 | pass | compact | 761.26 / 814.07 / 814.07 → 380.39 / 396.38 / 396.38 | 721.15 / 771.40 / 771.40 → 341.39 / 354.06 / 354.06 | 397.60 / 475.85 / 475.85 → 1.40 / 1.57 / 1.57 |
| 1024 | pass | append | 45.21 / 49.93 / 49.93 → 45.81 / 55.66 / 55.66 | 5.16 / 6.68 / 6.68 → 5.58 / 9.14 / 9.14 | 0.00 / 0.00 / 0.00 → 0.00 / 0.00 / 0.00 |

First load and first action are reported separately in milliseconds.
Each cell gives the two JVM observations in run order, before → after.
The first cohort in each JVM starts with a cold process. Later cohorts
load a fresh session in a JVM that has already handled earlier actions.

| Added decisions | Action | Path | First load | First action handling | First action cursor |
| --- | --- | --- | --- | --- | --- |
| 0 | move | compact | 58.20 / 44.75 → 67.33 / 36.13 | 58.01 / 40.70 → 56.15 / 24.63 | 11.95 / 10.29 → 4.47 / 1.54 |
| 0 | move | append | 363.29 / 46.69 → 382.97 / 29.13 | 164.19 / 24.07 → 151.17 / 24.99 | 0.00 / 0.00 → 0.00 / 0.00 |
| 0 | pass | compact | 38.27 / 40.42 → 43.45 / 31.79 | 33.84 / 42.57 → 34.93 / 23.56 | 5.13 / 7.43 → 1.33 / 0.60 |
| 0 | pass | append | 50.79 / 40.72 → 48.34 / 32.31 | 89.32 / 23.99 → 73.21 / 15.90 | 0.00 / 0.00 → 0.00 / 0.00 |
| 128 | move | compact | 135.72 / 176.14 → 200.91 / 147.92 | 101.16 / 123.54 → 75.00 / 64.01 | 37.28 / 62.43 → 3.24 / 1.82 |
| 128 | move | append | 163.60 / 180.76 → 217.65 / 147.68 | 27.25 / 26.18 → 33.54 / 23.55 | 0.00 / 0.00 → 0.00 / 0.00 |
| 128 | pass | compact | 192.45 / 194.71 → 225.42 / 137.36 | 97.81 / 134.41 → 69.89 / 64.24 | 49.61 / 67.43 → 1.27 / 1.32 |
| 128 | pass | append | 165.34 / 192.33 → 207.24 / 152.42 | 27.96 / 30.06 → 35.84 / 26.82 | 0.00 / 0.00 → 0.00 / 0.00 |
| 512 | move | compact | 479.72 / 529.49 → 557.49 / 876.53 | 331.86 / 324.83 → 169.97 / 184.01 | 154.37 / 184.81 → 1.89 / 2.55 |
| 512 | move | append | 487.03 / 444.01 → 592.20 / 605.35 | 21.75 / 19.95 → 17.40 / 37.52 | 0.00 / 0.00 → 0.00 / 0.00 |
| 512 | pass | compact | 526.79 / 630.10 → 619.69 / 510.05 | 281.62 / 420.93 → 205.08 / 135.05 | 155.31 / 231.57 → 1.60 / 0.99 |
| 512 | pass | append | 600.04 / 549.11 → 572.77 / 548.38 | 33.88 / 27.84 → 34.24 / 35.45 | 0.00 / 0.00 → 0.00 / 0.00 |
| 1024 | move | compact | 968.01 / 1149.68 → 1358.13 / 1625.64 | 634.72 / 709.41 → 432.61 / 293.15 | 339.41 / 370.23 → 2.73 / 5.03 |
| 1024 | move | append | 954.03 / 1709.34 → 1189.97 / 2103.20 | 22.72 / 127.40 → 17.01 / 142.33 | 0.00 / 0.00 → 0.00 / 0.00 |
| 1024 | pass | compact | 936.39 / 1101.00 → 1235.94 / 1224.47 | 704.47 / 726.70 → 419.79 / 339.59 | 334.61 / 410.43 → 1.22 / 1.39 |
| 1024 | pass | append | 1048.89 / 1137.02 → 1147.10 / 1313.25 | 41.79 / 90.40 → 41.60 / 90.52 | 0.00 / 0.00 → 0.00 / 0.00 |

The growth rule from `analyze-history-scaling.mjs --assert-flat` still fails
for both compaction actions. The review rerun evaluated the same rule
(more than 2× and more than 50 ms growth) directly on its two-run sample
set. Median handling went from 40.46 ms at 0 decisions to 343.06 ms at
1,024 for movement (8.48×), and from 35.69 to 380.39 ms for passing
(10.66×). Median full serialization was 307.37 and 323.04 ms respectively
at 1,024 decisions. The in-memory save phase stayed below 0.03 ms at the
median. This leaves full serialization and live soak acceptance open.

Raw review reruns are in `.tools/489-review-before` and
`.tools/489-review-after` in the #523 workspace.

## Validation

The original server package built. The review run passed 30 focused Maven
tests plus 21 storage codec and JDBC repository tests.
Set `HISTORY_SCALING_RUN=1` and point `HISTORY_SCALING_DIR` to the shared fixtures
before running this selector with a 2 GiB test heap:

```sh
mvn -pl ffb-server -am '-Dsurefire.failIfNoSpecifiedTests=false' '-Dtest=RecoveryArtifactJsonTest,RecoveryJournalTest,SetupApplicationCheckpointTest,SetupApplicationJournalTest,SetupApplicationReadOnlyLoadTest,HistoryScalingWorkloadTest#verifyFixtures' test
```

- `RecoveryArtifactJsonTest` verifies exact encoding, checksum, and byte limit,
  including Unicode.
- `RecoveryJournalTest#nativeChoicesRollsAndTurnsRecoverExactlyAcrossCompactionWithoutReexecutingCommands`
  compares both cursor implementations field for field. It verifies the exact
  saved artifact and native restore across compaction and subsequent appends.
- `SetupApplicationJournalTest#compactionConflictAndWriteFailurePreserveTheCheckpointAndAllowOneDurableRetry`
  injects both a stale-generation conflict and a write failure at a compaction
  boundary. It verifies that the failed action stays unpublished, the checkpoint
  survives, retry commits once, and restart recognizes the request as a duplicate.
- `HistoryScalingWorkloadTest#verifyFixtures` verified exact native recovery for
  all 16 action, history, and storage path combinations.

Keep #489 open for matched live acceptance and the remaining serialization cost.
