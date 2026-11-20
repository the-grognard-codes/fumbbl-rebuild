# Server history retention investigation (#524)

Resident replay events and transcript snapshots dominate the supplied heaps.
Freezing these immutable records as JSON strings cuts the measured late-session
heap delta by about 62%, without dropping history or changing stored formats.
The controlled reduced-heap sequence now completes. Full natural AI sequencing
and the user's long live soak remain pending; this does not establish that every
768 MiB live workload is safe.

## Retaining path

Eclipse MAT 1.17 analyzed private copies of both original dumps locally before
any reproduction. Originals were unchanged; no dump was uploaded. The first
dominator tree shows:

```text
SetupApplication
  sessions (LinkedHashMap): 640,326,368 retained bytes / 8 sessions
    SetupSession
      events -> expanded JSON snapshots
      transcript.records -> expanded JSON snapshots
```

SetupApplication retains 640,332,504 bytes (81.79% of the first dump). Selected
exclusive object-retained measurements, in bytes:

| Snapshot | Revision | Session | Events | Transcript | Native state |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 471 | 166,535,904 | 70,898,264 | 90,846,632 | 4,501,392 |
| 1 | 429 | 154,290,640 | 65,408,960 | 84,240,160 | 4,367,568 |
| 1 | 231 | 83,142,512 | 35,275,840 | 45,284,328 | 2,410,336 |
| 2 | 471 | 166,479,424 | 70,898,264 | 90,846,632 | 4,501,088 |
| 2 | 429 | 154,290,264 | 65,408,960 | 84,240,160 | 4,367,264 |

The second dump contains five sessions and independently identifies the same
large fields. The first revision-471 event/transcript graphs together own about
97% of its session's retained bytes. This demonstrates history bloat within
resident lifetimes; it does not prove completed sessions leaked indefinitely.
Cursor allocation was the OOM site, not the dominant retained owner.

The companion [numeric evidence](server-heap-retention-results.json) contains all
13 session measurements, sizes/counts only. Heap object addresses, game data,
account identifiers, system properties and thread values are excluded.

MAT's [batch reports](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/tasks/batch.html)
and [OQL](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/reference/oqlsyntax.html)
were used with a local Java 21 / 4 GiB analysis process. To repeat, run the
suspects/overview reports on a private copied heap, then export only numeric
columns from:

```sql
SELECT s.revision AS revision, s.@retainedHeapSize AS retained,
       s.events.@retainedHeapSize AS events,
       s.transcript.@retainedHeapSize AS transcript,
       s.state.@retainedHeapSize AS state
FROM com.fumbbl.ffb.server.match.SetupSession s
```

## Original correction and regression

SetupSession freezes accepted replay events once. MatchTranscript freezes each
record once and retains only the latest time, unfinished movement, and small
current-drive presentation facts. Append and restore rebuild those facts.
Ordinary views use them without decoding historical snapshots. Transcript pages
decode only their bounded requested records; checkpoints and completed results
materialize the required JSON at the serialization boundary. Existing recovery,
replay and completed-result versions/shapes, byte limits, idempotency, engine
authority, durable acceptance and session activation limits are unchanged.

SessionRetentionMemoryTest is opt-in (`SESSION_RETENTION_MEMORY_RUN=1`) and
launches isolated SerialGC JVMs and records after-GC
whole-heap deltas. Each session makes 450 real legal out-and-back native setup
placements on a 22-player roster, freezing native log entries as production
does. This is controlled retained history, not 450 natural match turns.

| Probe | Heap | Baseline | Corrected |
| --- | ---: | ---: | ---: |
| One late resident, completion release | 256 MiB | 87,507,264 bytes; fails 64 MiB ceiling | 33,316,880 bytes |
| One late resident, idle release | 256 MiB | same pre-release failure | 33,413,872 bytes |
| Eight late residents in one JVM | 384 MiB | actual OutOfMemoryError | 111,636,032 bytes after GC |
| After eight releases | 384 MiB | not reached | 22,386,120 bytes above startup baseline |

The exact final probe was compiled against unchanged main Java classes for the
baseline and run against the corrected branch. Startup/class initialization and
test infrastructure are included in these deltas; they are not MAT exclusive
retained sizes or a universal 64 MiB allowance for every possible history.
The eight-session after-GC ceiling is 256 MiB within a 384 MiB process.

Against the production 32-session activation cap, the measured eight-resident
delta averages 13,954,504 bytes (13.31 MiB) per resident. Assuming the same fixture
shape and linear scaling, 32 residents project to 446,544,128 bytes (425.9 MiB)
above startup baseline. This is an empirical projection, not a retained-heap
guarantee: setup-only records understate natural in-play records, the probe uses
independent applications, and production native/publication/infrastructure and
transient serialization graphs also need heap. The asserted 64 MiB one-session
ceiling alone would permit 2,048 MiB at the 32-session cap, and the eight-session
256 MiB ceiling scales to 1,024 MiB; neither proves all 32 fit in `-Xmx768m`.
The current tested bounds therefore protect these controlled fixtures only.
Natural completed/abandoned AI sequencing and the long 768 MiB soak remain
required before claiming cap-wide safety; heap and activation cap are unchanged.

The sequence holds eight independent application fixtures in one JVM. Four
sessions complete via a real native concession and full completedMatch()
materialization; four expire through real 31-minute idle eviction. Persistence
and server infrastructure are mocked. Weak references assert collection of the
session, native state, events, transcript and retry history while applications
remain strongly reachable. Each application reports zero resident sessions.

An initially unnecessary session spy kept original nested graphs alive in
Mockito despite collecting the shallow spy. A private test dump isolated that
harness artifact; the final test uses real sessions and asserts their complete
graphs collect. No production cleanup was added for test-double references.

Run the committed regression in an isolated worktree with the pinned toolchain:

```powershell
$env:SESSION_RETENTION_MEMORY_RUN = '1'
mvn -pl ffb-server -am -Dtest=SessionRetentionMemoryTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Without that environment variable, plain `mvn test` skips this class before
launching any child JVMs. The launcher chooses `java.exe` on Windows and
`java` elsewhere.

To reproduce the original baseline, take the two SessionRetentionMemory
test/probe files from `b7f1df32e`, compile them against the original baseline
Java classes in a separate worktree, and run the same selector.

## Timing and compatibility

Three fresh 768 MiB JVMs per side use the exact #489 retained fixtures
(0/128/512/1024 decisions), 48 cohort-first and 384 warm native move/pass durable
replies each. At 1024 decisions (24.65 MiB), warm median handling time in ms:

| Action/path | Baseline | Corrected |
| --- | ---: | ---: |
| Move append | 25.1 | 25.5 |
| Pass append | 37.6 | 39.6 |
| Move compaction | 272.0 | 268.1 |
| Pass compaction | 273.9 | 271.3 |

Largest corrected checkpoint across all first/warm samples: 303.87 ms.
Corrected longest-history warm compaction median/p95/max: movement
254.85/291.56/303.87 ms; passing 242.28/273.50/274.95 ms. Warm fixture-restore
medians are 843-881 ms, with the largest cohort-first restore 1,421.35 ms.
Baseline restore medians are 898-973 ms. Complete phase distributions and
allocation/restore statistics remain in the numeric evidence.

Every sample verifies generation/native outcomes; all 16 post-action recovery
combinations match exactly. These are descriptive matched-fixture experiments,
with other local validation running, not an isolated-host speedup claim or a
live two-second SLA. In-memory storage excludes real SQL/provider/storage-codec,
socket and browser cost; nested timing phases overlap. Warm actions restore
fixtures independently. Small cohort-first n=3 / warm n=24 tails are descriptive.

The workload and reproduction policy are documented in the #489 outcome. Set
HISTORY_SCALING_RUN=1, HISTORY_SCALING_DIR to a new private directory containing
the retained fixtures manifest, HISTORY_SCALING_SAMPLES=8, and repeat
HistoryScalingWorkloadTest#measureFixtures for repeats 1/2/3 at -Xmx768m.
Run #verifyFixtures separately at -Xmx2g. No live service/sign-in is required.

Focused drive presentation, transcript isolation, journal, concession and
bounded completion tests pass; browser unit tests (539) and build pass. Full
clean install results are recorded in the PR. No browser production source
changed. Independent standards/spec reviews approved the correction.

Existing HeapDumpOnOutOfMemoryError/HeapDumpPath launch flags already landed in
containers/local/Dockerfile and deployment/game-service/proxy/moles-game-v2-dev.service.
Their READMEs document the host-visible/retained private dump directories. No
launch configuration, heap increase or live container operation was needed.

Remaining: sequential full AI matches including natural completions and
abandonment at the existing 768 MiB heap, and the user's long soak. Keep #524
open. The controlled test and retaining-path diagnosis support this bounded
correction while that broader acceptance evidence remains pending.

## Integrated soak preparation

The local integration includes `main` at `66239f8a3` and #559 at
`3f9eade48`. It keeps the decoded checkpoint limits and the shared working
reserve from #559. A reconstructed resident or a growing checkpoint charges
the compact string storage for frozen replay and transcript history. The
remaining checkpoint data uses #559's retained-size factor. Idle release
removes the resident's charge.

The updated probe makes 450 legal out-and-back setup adjustments across
five stages. Controlled native touchdowns create additional setup stages.
Confirmation commits the formation, so these adjustments produce far
fewer durable records than the original per-placement workload. The probe
parks a computer match on the human coach's turn and restores it from a
file-backed checkpoint. It checks the last transcript record, the rebuilt
frozen byte count, and the resident budget charge. After idle eviction a
waiting computer load returns the stored view while the application reports
zero residents and zero retained budget bytes. Weak references verify that
the evicted engine and history can be collected.

| Probe | Child heap cap | After-GC delta with residents | After release |
| --- | ---: | ---: | ---: |
| One resident, native concession | 256 MiB | 29,821,264 bytes | 24,060,728 bytes |
| One resident, idle eviction | 256 MiB | 28,393,344 bytes | 22,633,576 bytes |
| Eight residents, four of each release | 384 MiB | 69,847,776 bytes | 23,701,552 bytes |

Both one-resident fixtures parked at revision 17. The eight-resident delta
averages 8.33 MiB per fixture, projecting to 266.45 MiB above startup baseline
at 32 same-shape residents. The probe uses independent applications and
includes JVM and test-infrastructure overhead. Natural in-play histories and
production transient allocations may be larger.

The focused default run passed 92 server checks and five native adapter
checks, with the heap probe class skipped by design. Setting
`SESSION_RETENTION_MEMORY_RUN=1` passed all three probe modes.

The combined #559, #543 and #541 soak still needs natural full-time
completion and abandonment through real activation. Run with
`-Xmx768m`, record each PR head SHA, and measure retained heap per resident
and after completion, abandonment and idle eviction. Use those observations
to assess the 32-resident cap.

## Shared workspace fix

Admission adds the resident charges and one shared workspace. Each
resident's workspace is its 11× decoded peak allowance less the heap
already charged to that resident. The server reserves the largest
workspace across the cache and the candidate. A restore still charges
the expanded size before reconstruction. `retainedBudgetBytes` and
`workingReserveBytes` report the two terms separately.

On `465da238c`, the checkpoint growth regression accepted the mutation
with zero evictions. The existing residents and the growing candidate
totaled 276 MiB retained. The fixed 280 MiB workspace estimate fit them
inside the 576 MiB budget. Expanding the frozen history needs a modeled
396 MiB workspace, so the corrected admission evicts one unpinned engine.

The frozen storage estimate uses the pinned server JDK's default compact
strings and compressed references.

### Peak materialization at 768 MiB

The opt-in probe extends a real native checkpoint with repeated board
snapshots to exercise the history shape at a controlled size. Its restored
revision 871 checkpoint was 38.01 MiB decoded, including 37.82 MiB of frozen
replay and transcript content. Seven other native engines shared the same
application. A chat write committed a full disk-backed checkpoint. A native
concession then materialized and validated the completed result.

| Operation | Process heap before | Sampled process peak | Peak above startup |
| --- | ---: | ---: | ---: |
| Full checkpoint | 128.22 MiB | 566.01 MiB | 557.32 MiB |
| Completed result | 136.44 MiB | 641.10 MiB | 632.41 MiB |

The application charged 65.03 MiB retained and 382.15 MiB shared workspace
for 447.18 MiB total. Both sampled peaks above the 8.69 MiB startup baseline
exceeded that total and stayed within the 768 MiB JVM cap. The sampled
process heap includes test infrastructure and allocations awaiting GC.

Result validation now compares the already parsed transcript records with
the replay. It still validates the transcript and avoids building another
expanded graph for the comparison. In paired Serial GC diagnostic runs, the
highest occupancy after a full collection during result creation dropped
from 598 MiB to 457 MiB. With the cleanup, sampled occupancy still exceeded
the modeled budget. The evidence does not support lowering the 11× factor.

The 450-placement rerun retained 27.03 MiB for one resident before native
concession, 27.04 MiB for one resident before idle eviction, and 64.64 MiB
for eight residents. The eight-resident process retained 20.63 MiB above
startup after release. Projecting those staged fixtures to 32 gives
258.57 MiB retained plus one 7.38 MiB workspace, or 265.94 MiB above
startup. The workspace term uses the largest observed fixture reserve.
The near-limit probe represents a different history shape. Production
capacity remains subject to the combined soak.

The final focused run passed 88 tests with the opt-in gate enabled,
including all four probe modes. The full Maven clean install passed
with the default gate. Across all modules, 1,253 tests passed and 26
were skipped.
