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

## Correction and regression

SetupSession freezes accepted replay events once. MatchTranscript freezes each
record once and retains only the latest time, unfinished movement, and small
current-drive presentation facts. Append and restore rebuild those facts.
Ordinary views use them without decoding historical snapshots. Transcript pages
decode only their bounded requested records; checkpoints and completed results
materialize the required JSON at the serialization boundary. Existing recovery,
replay and completed-result versions/shapes, byte limits, idempotency, engine
authority, durable acceptance and session activation limits are unchanged.

SessionRetentionMemoryTest launches isolated SerialGC JVMs and records after-GC
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
mvn -pl ffb-server -am -Dtest=SessionRetentionMemoryTest -Dsurefire.failIfNoSpecifiedTests=false test
```

For a before run, copy only the two new SessionRetentionMemory test/probe files
into a separate baseline worktree, compile against its unchanged Java classes,
and run the same selector. The native fixture and public session/application
interfaces are unchanged.

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
