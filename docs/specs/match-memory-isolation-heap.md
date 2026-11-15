# Match memory isolation: heap evidence

Issue: [#554](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/554).
Analyzed on 2026-11-15 against `main` at `33d95b7c6`.

## Method and privacy

Read an existing, local, read-only copy of one 1,150,110,700-byte OOM dump from
the failed soak. The shared server volume and its dump files were not altered.
No strings, player data, credentials, account identifiers, object addresses or
match identifiers are included here. Only class names, counts and sizes were
exported. The local Python reader follows the
[OpenJDK HPROF writer](https://github.com/openjdk/jdk21u/blob/master/src/hotspot/share/services/heapDumper.cpp).

The dump contains **26,502,060 objects**, with approximately **783,718,392 bytes
(747.4 MiB)** of shallow object storage. Sizes below assume the deployment's
compressed object references/class pointers and eight-byte alignment. They are
layout estimates, not a claim of exact JVM accounting or exclusive dominator
retention. The dump also includes allocation-time temporary graphs; the
histogram alone does not distinguish those from resident history.

| Class | Count | Estimated shallow bytes |
| --- | ---: | ---: |
| `byte[]` | 8,591,028 | 312,226,712 |
| `java.lang.String` | 7,777,034 | 186,648,816 |
| `java.lang.Object[]` | 1,798,158 | 115,265,224 |
| `java.util.ArrayList` | 2,221,046 | 53,305,104 |
| `com.eclipsesource.json.JsonString` | 2,057,923 | 32,926,768 |
| `com.eclipsesource.json.JsonNumber` | 1,365,409 | 21,846,544 |
| `com.eclipsesource.json.JsonObject` | 807,820 | 19,387,680 |
| `com.eclipsesource.json.JsonObject$HashIndexTable` | 807,820 | 12,925,120 |
| `com.eclipsesource.json.JsonArray` | 565,681 | 9,050,896 |
| `com.fumbbl.ffb.model.change.ModelChange` | 56,388 | 1,353,312 |

## Resident ownership paths

The dump contains **eight `SetupSession` instances**. The instance graph confirms
this retained path for all eight:

```text
SetupApplication.sessions
  -> LinkedHashMap.table
  -> HashMap.Node[]
  -> LinkedHashMap.Entry.value
  -> SetupSession
```

Source and field layouts identify the history branches owned by that session:

```text
SetupSession.events -> JsonArray -> ArrayList -> Object[] -> JsonObject
SetupSession.transcript -> MatchTranscript.records -> JsonArray -> ArrayList
SetupSession.state -> GameState -> GameLog
SetupSession.history -> LinkedHashMap
```

An exploratory reachable-graph walk found up to 6,065,134 objects reachable from
one session, excluding its server reference and reflection/classloader objects.
This is an inclusive reachable count: shared rule/catalog objects can appear in
more than one walk. It must not be added across sessions or represented as an
exclusive retained heap size. The histogram and ownership paths establish that
the decoded JSON histories are substantial resident graphs, not merely the
roughly 1 MiB compressed storage strings.

## Budget decision

Reserve `max(32 MiB, heap / 3)` for shared services and ordinary request work.
Use a conservative **12× decoded-byte allowance** for each admitted session,
covering its live graph and recovery/serialization copies. Choose:

```text
available = heap - max(32 MiB, heap / 3)
residentLimit = clamp(floor(available / (32 MiB * 12)), 1, 32)
decodedLimit = min(32 MiB, floor(available / residentLimit / 12))
appendThreshold = decodedLimit - 1 MiB
```

At `-Xmx768m`, this means **one resident session**, a **32 MiB decoded limit**,
and a **31 MiB append threshold**. Other matches remain durable and can activate
when capacity is available; concurrent activation at capacity returns
`ACTIVATION_LIMIT`. The former 32-session activation promise cannot safely be
kept with full histories at this heap size. Normal artifacts reported in #554
were 23–28 MB; the 46.8 MB looping artifact is rejected before decompression.

This is an admission policy, not a theorem about every possible JSON object
shape. The regression probe verifies the reported 45 MiB load at the actual
768 MiB heap, and a live soak checks the real engine path. Heap sizing and the
serialization/retention operating envelope remain tracked in #548 and #524.

## Snapshot decision and compatibility

Keep existing full snapshots and all recovery/transcript versions readable
within the admission budget. No format is retired or rewritten, and recovery
never reruns game commands. Removing full snapshots for ordinary actions is an
explicit handoff to [#548](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/548).
Staged setup/kick-off placements remain
[#556](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/556), following
the decision in #555. Neither is required for the immediate isolation guard.
