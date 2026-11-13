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

The server package built and 29 focused Maven tests passed. They compare old and new cursors field for
field across native compactions, check exact byte length and checksum including
Unicode, and verify exact native restoration for all 16 workload combinations.
Keep #489 open for matched live acceptance and the remaining serialization cost.
