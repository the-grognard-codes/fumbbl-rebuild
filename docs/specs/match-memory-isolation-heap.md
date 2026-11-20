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

## Why eight sessions were resident

A targeted field scan found eight entries in `SetupApplication.sessions`, eight
`lastAccess` entries and zero `pendingCompletions`. All eight native games had
`fFinished == null`; all eight sessions had `failed == false`. They were
unfinished cached engines, not completed engines. The anonymous `GameState`
outer-session reference is a cycle, not an independent root.

The existing cache retained unfinished sessions for thirty minutes and checked
idle expiry only when another client request arrived. Sequential abandoned games
could therefore accumulate alongside the growing match. The change runs idle
cleanup on maintenance ticks and evicts durably checkpointed cold engines under
memory pressure. Their checkpoints remain available for native restoration.

Separately, source review found that a definitive `MatchService.Failure` from
result recording retained a terminal engine without scheduling a retry. That
leak has a failing-before/passing-after regression and is fixed. It does not
explain the eight unfinished engines in this dump.

## Budget decision

Keep the documented **32-slot activation ceiling**. Charge the histories that
are actually resident, rather than reserving a worst-case history for all slots.
The same policy instance is injected into the application and both repositories.

```text
available = heap * 3/4                       # reserve 1/4 for shared services
baseline = 32 * 1 MiB
perMatchDecoded = min(44 MiB, (available - baseline) / 11)
appendThreshold = perMatchDecoded - min(4 MiB, perMatchDecoded / 8)
residentCharge(bytes) = max(1 MiB, 4 * bytes)
sharedWorkingAllowance = 7 * largest admitted decoded history
admit = sum(all resident charges, including incoming) + sharedWorkingAllowance <= available
```

At `-Xmx768m`, the post-placement policy allows **44 MiB decoded** and
**40 MiB at append**. The largest reported completed recovery envelope after
#574 was 32,550,261 bytes (31.04 MiB) with mocked communications. The 40 MiB
threshold leaves 8.96 MiB of observed headroom and reserves another 4 MiB for
terminal growth. The decoded limit applies both to the sum of the stored
checkpoint and journal and to the reconstructed envelope. If another journal
entry would exceed the decoded limit, the write compacts into a full checkpoint.
The bounded native-capture sample reached 16,187,741 bytes at full time. The
authenticated sample stopped before full time. These measurements guide the
limits pending the concurrent soak. See
[staged-placement measurements](staged-placements-outcome.md).
The serial worker reserves one shared workspace, rather than one per match or
checkpoint. Stable/shrinking checkpoints reuse admission; only growth or a cold
load needs readmission. Before decoding a stored record, durable terminal/idle
victims are preferred, then active LRU engines with committed checkpoints can be
released until admission fits. The current match is excluded from eviction.
Detached completion retries retain their slot and a baseline memory charge, so
eviction cannot create an unbounded retry queue. A 33rd occupied slot still
returns `ACTIVATION_LIMIT`.

The 4x retained and 11x working allowances are conservative policy factors,
calibrated with constrained native-history probes, not inferred from overlapping
reachable-graph counts. They are not a proof for every arbitrary JSON shape.
Both factors include native state and history; the working allowance additionally
covers parsing, serialization and storage buffers. Actual heap use remains
sensitive to history shape and other shared services.

Before staged placements, normal completed artifacts reported in #554 were
23-28 MB and the policy used 49.45 MiB decoded and 45.45 MiB at append.
Eleven-player out-and-back setup decisions produced the following historical probes under `-Xmx768m`:

| Final Unicode workload | Recovery bytes | Result |
| --- | ---: | --- |
| 1,552 revisions, plus a retained 13.9 MB native engine | 47,672,358 | Journal reconstruction, exact native restore, serialization, fingerprint, cursor and terminal result passed at 768 MiB |
| 1,652 revisions, no other resident | 50,735,758 | Same complete pipeline passed below the 51,856,849-byte decoded cap |

The initial ASCII-only probes passed at 49.1/64.4 MB but omitted the expensive
Unicode journal path. A subsequent live rework run produced a 924,268,866-byte
OOM dump at 21:09:44 UTC. Its worker stack was `String.getBytes` in
`RecoveryArtifactJson.encodeText`, called by `RecoveryJournal.restore` and
`JdbcRecoveryRepository.findJournal`, before native restoration. A targeted
scan found one unfinished resident, not eight: 21,995,818 decoded bytes,
8,179,148 replay bytes and 10,371,348 transcript bytes; no pending completions.

That evidence invalidated the 64 MiB proposal. The final code hashes in bounded
8 KiB encoder writes, avoids artifact-sized UTF-8 arrays in checksums and
fingerprints, drops consumed checkpoint references, and joins/counts embedded
replay arrays through streaming parser callbacks without constructing a second
replay graph. Unicode 60 MiB remained unsafe during native parsing, so the
working factor was raised to 11 and calibrated against the full Unicode
checkpoint-plus-journal pipeline. Larger warm engines are evicted before this
incoming allocation; admitted smaller warm engines remain usable.

Private transcript restore shares semantically equal immutable replay snapshots;
historic differing projections remain intact. Canonical serialization walks the
existing graph without deep-cloning it. Stored schema/encoding remain readable.
These are memory probes, not proof of the two-second live latency target: the
combined high-history restore/serialize/fingerprint/cursor/termination probe
still took about 9.8 seconds. Serialization latency remains #548.

## Snapshot decision and compatibility

Staged setup and kick-off placements (#574) require live checkpoint version 7.
The memory policy preserves that format and the completed result and transcript
formats. Recovery assembles the stored history without rerunning commands.
Removing full snapshots for ordinary actions remains
[#548](https://github.com/the-grognard-codes/moles-under-the-pitch/issues/548).
