# Feature: Keep one oversized match from exhausting the heap and crash-looping the server

Local mirror of [#554](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/554).
Implementation evidence: [heap analysis](match-memory-isolation-heap.md) and
[outcome report](match-memory-isolation-outcome.md).
Implementation PR: [#559](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/559).

Part of #522. Found in the 2026-11-15 soak, recorded as finding 9 in `docs/specs/gameplay-soak-review.md`. Related: #524, #548.

## Abstract
A single match with a 46.8 MB decoded recovery artifact exhausted the 768 MiB heap. Because the match reloads on every restart, the server failed within seconds three times and then stayed down. Match the per-match size limit to the heap, and make loading an oversized match fail safely for that match alone.

## Objective
No single match, however large, can make the game server unavailable to other matches.

## Context / Existing Behavior
- **Size:** the looping match `ef487189` reached a 46.8 MB decoded artifact (1.0 MB stored): `eventsJson` 22.7 MB and `transcript` 21.6 MB, about 1,168 events. Every event stores a full state snapshot of about 16–20 KB. Normal completed matches of 320–500 revisions decode to about 23–28 MB.
- **Limit:** the per-match cap is `SetupSession.MAX_MATCH_ARTIFACT_BYTES = CompletedMatch.MAX_BYTES` = 64 MiB decoded. The server runs with `-Xmx768m` and up to 32 resident sessions (ADR 0006 single worker). Parsing, holding and re-serializing one match near the cap does not fit.
- **Restart behaviour:**
  - The first `OutOfMemoryError` came at 16:31:05.
  - After each restart the match was reloaded within 7–12 s (most likely by the computer coach reconnecting), and the server failed again.
  - `on-failure:3` (#540) then left it stopped.
  - Recovery needs someone to clear the match by hand.
- **Evidence:** four heap dumps of about 1.1 GB each are in `/data/heap-dumps` on the dev-local server volume.

## In Scope
- **Heap dumps:** analyse one, and report the class histogram and the retained path for the resident match (class names, counts and sizes only).
- **A budget that fits the heap:**
  - Derive the per-match decoded-artifact cap from the heap and the activation cap.
  - Enforce it at append time: when a match approaches the cap, end or suspend it with a clear coach-facing state and a `MATCH_SIZE_LIMIT` log line, rather than letting it grow.
- **Safe load:**
  - Check a match's stored `decodedBytes` before decoding or restoring it.
  - If it is over budget, mark the match unavailable or quarantined and refuse activation with a stable error code. Never let one match's load take down the process.
- **Restart loop:** after an out-of-memory failure, the next start must not immediately re-activate the match that was resident when it failed. For example, record the active match IDs and skip an automatic reload of a suspect match.
- **Per-event snapshots:** decide (here, or as an explicit hand-off to #548) whether events keep full state snapshots, or store deltas or a periodic snapshot.

## Out of Scope
- The Solid Defence loop itself (companion issue).
- Changing the 2,000 ms request budget or ADR 0006.

## Functional Requirements
- A match is stopped before its decoded artifact exceeds the derived budget, and the coaches see why.
- Loading an over-budget match fails for that match only, with an error code, and the server stays healthy.
- After an out-of-memory failure and restart, the server serves other matches.

## Acceptance Criteria
- **Heap-dump analysis:** recorded in `docs/specs/`, with no private data.
- **Append-time test:** a synthetic match driven to the budget is stopped with the expected state and log line.
- **Load-time test:** a stored artifact whose `decodedBytes` exceeds the budget is refused without decoding, and other sessions are unaffected.
- **Restart test:** the restart scenario (a failure with a suspect resident match) brings the server up without reloading that match.
- **Soak re-run:** no out-of-memory failure.

## Constraints
- **Stored formats:** preserve existing recovery and transcript format compatibility (architecture-map invariant). An ADR is required if a format retires.
- **ADR 0004:** recovery never reruns game commands.
- **Isolation:**
  - Create a new branch for this work.
  - Preserve unrelated working-tree changes.
  - Follow existing repository conventions.
  - Do not commit or push unless explicitly requested.
- **Dev-local stack:** do not modify it. Copy the heap dumps out, read-only.

## Implementation Guidance
- **Stored size:** `decodedBytes` is already in the stored envelope (`BoundedJsonStorageCodec`), so the load-time check is cheap.
- **Shared work:** coordinate with #548 (serialization budget) and #524 (retention), which can now use this real-play evidence.

## Validation
- Focused server tests and `mvn clean install`.
- An opt-in memory probe under `-Xmx768m` with a committed staged-runtime history and a warm engine.

## Completion Notes
- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.

## Review correction (PR #559)

The initial one-slot/32 MiB implementation was rejected in review and replaced.
The final policy preserves 32 slots, uses weighted LRU cache admission and a
44 MiB decoded / 40 MiB append limit at the deployed heap. Size termination
records the current score and leaves the active set. The OOM tracker is advisory,
uses a bounded maintenance-thread handoff, requires evidence from the prior
run's exact heap-dump file and delays automatic reloads for at most thirty
minutes. Ordinary exits and tracking-storage failures do not reject gameplay.
See the outcome and heap reports above for evidence and limitations.


### Follow-up review and merge order

[PR #559 follow-up](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/559#issuecomment-6906842421)
requires immediate safety-writer handoff; quarantine at every recovery entry
point, persisted across restarts until absolute expiry or selective admin clear;
one shared working allowance with idle/terminal eviction preference; and cached,
neutral system attribution for size stops.

#574, #558 and #575 have landed. After #559, #543 and #541 are integrated and
tested, combine their heads on a disposable branch based on main. Run the
three-hour soak there at `-Xmx768m` with several concurrent matches, including
computer matches. Record the exact head SHA of each PR and keep #554 open until
the acceptance evidence is recorded.
[November 20 integration instructions](https://github.com/the-grognard-codes/moles-under-the-pitch/pull/559#issuecomment-7031175823)
