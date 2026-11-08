# Collecting a complete game-latency investigation

Tracking: [#499](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/499).
Use the same source artifact, ruleset, roster, devices and database configuration
across comparisons. These additions collect evidence; they do not fix slowness.

## Measurements now available

| Boundary | Observation | Interpretation |
|---|---|---|
| Browser input → feedback / authoritative presentation | Existing pending, provisional, RTT, transcript and presentation samples | Includes scheduling and intentional playback; presentation ends at a browser rAF opportunity, not physical display |
| Engine admission → worker start | Server `queueMs` | Engine queue wait, separate from execution |
| Worker start → worker exit | Detail `handlingMs` | Includes later publication; legacy `timing.handlingMs` ends at response enqueue |
| Authorization | `AUTHORIZATION`, `LOCAL_AUTHORIZATION`, `FIREBASE_LOOKUP`, `FIREBASE_REUSE` totals/counts | Local rechecks and provider lookups/reuse stay distinct |
| Recovery preparation | `RECOVERY_SERIALIZE`, `RECOVERY_CURSOR`, `RECOVERY_FINGERPRINT`, `CHECKPOINT`, `CHECKPOINT_STORE` | Separates growing-history work from persistence |
| Recovery connection acquisition | `DB_CONNECT` | Includes connection creation/acquisition; does not identify database-internal waits |
| Recovery queries / mutations / transaction completion | `DB_READ`, `DB_WRITE`, `DB_COMMIT`, `DB_ROLLBACK` | Driver round trips and possible lock/durability waits. Read spans include row consumption and nested decoding; statement prepare/bind and connection close are outside these fine spans |
| Storage | `STORAGE_ENCODE`, `STORAGE_DECODE`, `STORAGE_COMPRESSION`, `STORAGE_DECOMPRESSION` | Compression is nested within encode, decompression within decode; byte counters allow size comparisons |
| Response creation / transport | `RESPONSE_SERIALIZE`; `write.queueMs`, `write.durationMs`, `write.completedMs`, status | Serialization covers JSON text creation. Queue includes any admitted transcript predecessor. Write ends at Jetty's async completion callback, not browser receipt or TCP acknowledgement |
| Browser main-thread receive | `parse`, `validate`, `notify`, `transcript`, enclosing `receive` | Parse is the V2 envelope parser, including existing payload-byte accounting; validation includes strict projection/typed decoders. Notify/transcript measure synchronous application callbacks, not deferred React work |
| Response → first matching React layout effect | `responseToCommit` | Includes scheduling/render/commit through the hook; not isolated React CPU, animation completion, paint or GPU time |

All spans use monotonic duration clocks. Nested phases overlap: do not add them
to manufacture a total or subtract server totals from RTT to name a network cost.
`PUBLICATION` and storage/authorization totals are allowed to overlap their parents.
Fine database spans currently cover the recovery repository, not every application
repository; local authorization retains its separate whole-operation span.
Unsolicited transcript/notification spans can have no request trace and must remain
uncorrelated. Optional diagnostic frames do not measure their own receive processing.

## Live capture procedure

1. Start the normal dev-local instance through `node tools/dev-local.mjs start`
   when ready to collect. DEV remote capture requires a separately authorized
   deployment of the instrumented artifact. Do not collect from an older bundle
   and assume it has these additions.
2. Open a synthetic acceptance match with its real recovery database. In Debug →
   Performance & Network, select Counters and check **Detailed phase traces**.
   Confirm server timing and detailed phases both show **enabled**. A lightweight
   or older server can show detail **unavailable** while ordinary play continues.
3. Select a 30- or 60-second history. Clear at each planned observation window,
   reproduce a small batch, mark the incident promptly, pause and export JSON.
   Capture early, middle and late in each half, plus a known compaction window.
   Export before the rolling window or rings replace the relevant observations.
   For a long session, save several independent windows rather than one huge file.
4. Cover player selection, ordinary move, dodge/rush, block/dice choice, pass and
   end-turn separately. Include reads/previews and idle probes as separate groups.
   Record reconnect/recovery and cold first use separately from warmed resident play.
   Keep playback speed, reduced motion, device foreground state and camera stable.
5. Retain matching server logs. With `DEV_LOCAL_GAMEPLAY_TIMING=true` at server
   startup, negotiated detailed requests also log `FFB_BROWSER_TRACE` beside
   `FFB_BROWSER_TIMING`. The detail's opaque `correlation` token appears in both
   exported JSON and server trace. Capture-local numeric `trace` joins the browser
   spans and response samples; it is not globally unique across captures.
6. Repeat independent runs with the same synthetic starting artifact. Aim for
   at least three runs and enough actions in each category for meaningful tails;
   report n, p50, p95, max and the underlying individual outliers. Do not pool
   append and compaction, early/late windows, devices or cold/warm samples.
7. Compare Off, lightweight Counters, detailed Counters and Graph cohorts without
   other builds/tests running. Use profilers in a separate attribution run.
   Quantify collection overhead before using the detailed timings as acceptance
   thresholds. Stop the dev-local instance afterwards with `node tools/dev-local.mjs stop`.

Server-side fine logging without browser negotiation is also available through
the JVM property `-Dffb.browser.trace=true`. It is intentionally explicit and must
be removed after a bounded diagnostic session. Ordinary startup does not enable it.
Enabling server logs alone does not populate browser capture details; negotiate
the browser capability to export the joined evidence.

The bounded export is format 2, with `capture.details.version=1`. Format-1 captures
remain readable by the offline analyzer. Detailed collection is separately opt-in;
collection still starts Off on every page session. Preferences do not turn it on.

## History and storage context

Each eligible checkpoint records numeric revision, half, turn, retained request,
event, native command and transcript counts; current journal entry/byte counts;
storage input/output/read/decoded bytes and response bytes, where available.
Counts describe the resident lifetime, not a promise of literal turn-7 gameplay.
Storage byte counters sum codec calls in the request, not database disk usage.
Journal counts describe the cursor before the mutation. Response bytes cover the
correlated mandatory response; predecessor bytes/drop flag describe its optional
transcript predecessor. Other published frames remain in capture traffic totals.

`checkpointPath`: 0 unchanged/no write, 1 journal append, 2 actual journal
compaction, 3 full-checkpoint fallback. An absent path means it was not observed.
`actionKind`: 0 other, 1 move/selection, 2 pass, 3 blitz, 4 foul, 5 handoff,
6 block, 7 end-turn. It is a coarse request classification, not the dice outcome;
use operation and private workload notes for ambiguous choice requests.
`responseAccepted`, `duplicate` and `predecessorDropped` are numeric 0/1 flags
when observed. No action ID, player ID, SQL text or game document is exported.

Keep a private manifest beside the capture: exact commit plus dirty-source or
patch hash; browser JS/CSS hashes; server image digest; fixture/checkpoint hash;
JDK/heap/JVM flags; database/version/configuration and table sizes; host CPU,
memory/load; browser/version/viewport/DPR; device/OS/network route; capture mode,
window, action categories and whether a profiler was active. Record synthetic
match setup and actual turn progression privately. Do not commit tokens, raw
checkpoints or account/match identifiers to the public issue.

## Offline review and limits

Run with repository Node 26 from the root:

```powershell
node tools/diagnostics/analyze-capture.mjs early.json late.json --output comparison.md --json comparison.json
```

The analyzer accepts at most 16 inputs, each at most 2 MiB. It preserves separate
capture clocks and reports detailed phase percentiles, coverage, drops and
individual evidence. JSON retains the eight slowest detailed server records per
capture and at most 16 matching browser spans per selected record. Full original
exports remain the source for other records. JSON/Markdown output caps are
128 KiB/32 KiB, with explicit omissions.

Collection caps: maximum 60-second window; 64 server traces, 512 browser spans,
48 spans per server trace; existing lightweight caps remain unchanged. Dense
server traces trim span tails to fit an 8 KiB optional frame, retaining phase
totals and recording `droppedSpans`. The optional frame can still be dropped under
delivery pressure; gameplay keeps priority. Missing-response counts concern
eligible correlated responses in the retained window, not all requests or packet
loss. Ring-drop counters are cumulative since reset, not window-only loss counts.
Older-server fallback, optional-frame loss, window boundaries and correlation
eviction all leave unavailable evidence rather than zero-duration claims.

Browser clock anchors map collector time to the browser's performance timeline:
`performance.now ≈ collectorOriginMs + captureTimeMs`. The browser UTC anchor is
`browserTimeOriginUtcMs`. Server `originUtcMs` is only a coarse wall-clock anchor;
clock skew prevents one-way transport attribution. `write.completedMs` and phase
start offsets are relative to the server worker start. Outbound queue/write
durations use millisecond-resolution transport clocks; they do not provide
nanosecond write boundaries.

## Supplementary evidence still required for a full plan

Use these alongside application traces, on the same artifact and representative
early/late workloads:

- **Database internals:** capture bounded Performance Schema statement/digest,
  transaction and lock-wait evidence plus connection/storage I/O counters during
  the marked batch. Verify enabled instruments and record their availability.
  Use a dedicated synthetic workload and UTC interval; application timers cannot
  identify a lock holder or separate database CPU from network/driver wait. Keep
  raw statement text and credentials private. Compare EXPLAIN/query plans only
  for statements implicated by observed read/write delays.
- **JVM CPU/allocation/GC:** take a bounded JFR around an early and late batch
  under the normal heap limit. Record CPU stacks, allocation and GC pauses. The
  existing [native profiling guidance](../performance-capture-followup/workloads.md)
  covers bounded startup JFR without granting container attach privileges.
  Correlate by interval and server traces; JFR is required to distinguish copying,
  serialization, compression, cursor reconstruction and GC inside broad phases.
- **Browser CPU/rendering:** take Chrome Performance timeline and CPU profiles
  around an outlier, preserving parse/validate/callback/commit spans and revision.
  Inspect JavaScript, React scheduling, style/layout, paint and renderer work;
  use a React profiling build separately when isolated React CPU is needed.
  A commit/rAF timer cannot measure physical display latency.
- **Transport:** retain application payload sizes, socket-write outcomes,
  buffering and a browser network/WebSocket timeline. Compare loopback and a
  representative network, including RTT under the same load. HAR alone may omit
  WebSocket detail. Use targeted packet evidence only if residual transport delay
  is demonstrated; never call RTT-minus-server a measured one-way network delay.
- **Devices:** repeat foreground captures on the actual slow device/network,
  especially physical Android acceptance under #330. Headless desktop browser
  checks establish instrumentation behavior, not physical-device performance.

Existing bounded native browser automation can now opt into detailed assertions:

```powershell
$env:COACH_ACCEPTANCE_DETAILS='1'
$env:COACH_ACCEPTANCE_CPU_PROFILE='1'
node browser-client/test/performance-diagnostics-native.mjs
```

It additionally requires `COACH_ACCEPTANCE_TOKENS_FILE`,
`COACH_ACCEPTANCE_RESUME_FROM` and `COACH_ACCEPTANCE_EVIDENCE` as described in
the [existing workload guide](../performance-capture-followup/workloads.md).
Use only authorized synthetic participants and an ACTIVE retained PLAY match;
it performs a real end-turn action. The optional timeline is capped at 20,000
events with an explicit truncation flag. Run without CPU profiling for baseline
timings. This smoke is one action, not a replacement for the early/mid/late matrix.

The [controlled response workload](../performance-capture-followup/workloads.md)
and [history-scaling experiment](../performance-capture-followup/history-scaling-outcome.md)
remain useful separate seams. Neither substitutes for actual match progression
with SQL, transport and browser rendering. A remediation plan should identify
which retained-history dimensions grow, which measured phases track that growth,
the frequency of append/compaction outliers, and the percentage of perceived delay
left unattributed. Propose changes only after that evidence is available, then
repeat matched correctness and performance cohorts on the proposed artifact.
