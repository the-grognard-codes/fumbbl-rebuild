# PR #501 review follow-up

Review: [independent comments](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/501#issuecomment-6726596809), against `4d437d2ba`.
Scope: evidence quality and collection overhead; no gameplay performance fix is claimed.

This first-pass record is followed by the [second review corrections](#second-review-corrections)
below. The second pass supersedes the first pass's client-inferred error eligibility.

## Changes by finding

1. **Basic timing loss in detail mode:** reply-time `diagnosticsTiming` is now
   sent independently of the later trace. Embedded trace timing remains a
   fallback, with per-request deduplication in either arrival order. Basic timing
   remains active during detail renegotiation on an already-enabled connection.
   A detail can queue behind an in-flight basic frame; both remain best effort,
   with one queued optional frame and the existing gameplay capacity/priority.
2. **Revision source:** checkpoint context reads the session's actual revision
   through a package-private accessor, instead of inferring it from event count.
   Native journal/fallback tests compare the trace value with the response revision.
3. **Server log transport truncation:** the log is emitted from the bounded
   collected trace before any 8 KiB wire reduction. Wire trimming uses a copy;
   log-only capture does no transport framing/trimming.
4. **Outer phase loss:** once the 48-span cap fills, a new phase replaces a
   repeated phase interval. A same-phase outer interval can replace an inner one.
   Collection and wire reduction protect the earliest, widest retained interval
   for each phase ahead of repeated inner intervals. Totals and truncation counts
   remain explicit; retained intervals are not synthetic combinations of gaps.
5. **Late/ineligible detail classified as missing:** a 2,000 ms capture-end
   grace interval separates pending detail from older unobserved responses.
   Authorization failures excluded by the server carry a safe boolean eligibility
   flag. Old unflagged error samples have unknown eligibility and are reported
   separately. Unobserved after grace is not a claim of loss; later arrival is
   still possible. Paused captures use their frozen end time.
6. **Invalid detail export omitted silently:** export sets
   `capture.detailsInvalid=true` when validation rejects its detail snapshot,
   omits the unsafe block and preserves the remaining safe capture. The analyzer
   reports `invalid`, distinct from `unavailable`, and rejects inconsistent flags.
7. **Repeated full-frame serialization:** over-budget framing measures each
   span's encoded size once, selects removals without serializing the envelope
   in that loop, then serializes the final copy. There are at most two full wire
   serializations, rather than one per omitted span. The normal fitting path
   serializes once; log-only mode never constructs a wire frame.

The [collection guide](collection.md) and [feature request](feature.md) now describe
these contracts. The [original implementation outcome](outcome.md) remains the
record of the earlier validation and investigation limits.

## Validation

New focused regressions first reproduced absent basic timing, missing outer
intervals, rejected detail admission after basic timing, duplicate timing samples,
misclassified response coverage and silent invalid export. These checks pass with
the corrections. Additional cases exercise trace-first fallback, transport-only
trimming across counter-width changes, actual WebSocket delivery and native
revision agreement. No checks were disabled or loosened to hide malformed gameplay.

| Check | Result |
|---|---|
| Browser unit suite | 530 passed, no failures/skips; final trace-first fallback assertions also passed in the focused 7-test collector suite |
| Browser TypeScript/production build | Passed |
| Focused native diagnostics, protocol, socket and journal suite | 80 passed; final full build additionally covers the subsequently added write-completion ordering case |
| Final tested common/server Docker build | 19 common + 700 server cases: 710 passed, 9 existing gated skips, no failures/errors |
| Offline analyzer / affected CI tooling command | 19 analyzer cases included in 49 passing tooling tests |
| Chrome diagnostics/export journey | Passed, including detail opt-in, commit span, privacy, Off/reset and capability fallbacks |
| Diff / cleanup | `git diff --check` passed; managed containers stopped and loopback 5000/22232/22234/23317 closed |

Local evidence: ignored `.tools/observability-review-*.log`. The final local image
is `fumbbl-observability-review:local`, image ID
`sha256:0ec12ce7833712bef9ab2f76937cacea31829b3310c0181ccd177b720ce68403`.
The original reviewed PR head's CI had passed before publication of these fixes;
checks on the follow-up commit must run again.

The existing real MariaDB evidence is in the original outcome; recovery SQL and
transaction code were not changed in this review pass. Actual early/late match
captures, profiler attribution and observer-overhead comparisons remain follow-up
measurement work. Dev-local stays stopped. This handoff authorizes recommitting
and updating the existing PR, not merging or deploying it.

## Second review corrections

Re-review: [comments against `f63b34758`](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/501#issuecomment-6727033568).
It accepted the seven earlier corrections and raised four additional findings.

1. **An older writing trace blocked newer basic timing.** Basic timing now
   discounts that in-flight detail for admission policy and can queue behind the
   newer mandatory reply. A queued detail also yields directly to basic timing.
   Actual queue count/byte limits, mandatory ordering, optional eviction and
   best-effort failure behavior remain enforced. Regressions reproduce the exact
   `[writing trace, next reply, basic timing]` case and cover insufficient physical
   capacity without disconnecting gameplay.
2. **Client eligibility inference missed server paths.** The client no longer
   maintains an error-code exclusion list or emits inferred eligibility flags.
   Unobserved error-category responses remain unknown. The analyzer accepts
   legacy negative flags but does not trust an old positive flag for an error;
   observing the actual correlated server trace resolves eligibility. This covers
   malformed/unsupported input and expired principals without duplicating server
   selection rules or exporting error codes.
3. **The wider-interval rule was duplicated.** One `wider` predicate now defines
   earlier start, then longer duration for ties, for collection and wire retention.
   A dense tie-case regression verifies that both retain the same outer intervals.
4. **Capped spans repeatedly scanned JSON and allocated maps.** A fixed per-phase
   side index tracks the outer retained slot. Repeated capped phases now take O(1)
   lookup/comparison and discarded intervals allocate no JSON. Only the first
   appearance of a new phase after saturation performs a bounded 48-slot scan to
   choose a duplicate for replacement; it does not build a map on the worker.
   Over-budget wire trimming builds its own index once and selects removals in
   two linear passes instead of rebuilding a map for every removed span.

The new delivery and client/analyzer regressions failed against `f63b34758`
before the corrections. Final validation:

| Check | Result |
|---|---|
| Focused native delivery/timing/protocol/journal/WebSocket suite | 84 passed |
| Final tested common/server Docker build | 19 common + 703 server cases: 713 passed, 9 existing gated skips, no failures/errors |
| Browser unit suite / TypeScript production build | 530 passed; build passed |
| Analyzer / affected CI tooling command | 20 analyzer cases included in 50 passing tooling tests |
| Chrome diagnostics/export journey | Passed |
| Diff / service state | `git diff --check` passed; managed containers stopped and all four managed loopback ports closed |

Evidence logs: ignored `.tools/observability-rereview-*.log`. Final image ID:
`sha256:40bb1b946f808ef556aae891f36095271449b3d4d5ebe6a5561829bc854e4bc2`.
CI on `f63b34758` passed (the workflow's full-browser job was skipped); checks
on this follow-up commit must run again. No live performance improvement,
additional SQL integration run, physical-device acceptance, merge or deployment
is claimed by this review pass.
