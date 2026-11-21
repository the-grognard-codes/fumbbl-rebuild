# Feature: Restore headroom between real-play match size and the append limit

Issue: #596

## Abstract

The largest match in the integrated soak of 2026-11-20 reached 39.12 MiB decoded, against a 40 MiB append limit at `-Xmx768m`. That's about 2% headroom. The soak's computer-driven coaches made about 113 decisions per match, and human coaches are likely to make more. A long human match could stop with `MATCH_SIZE_LIMIT` before full time. Restore headroom, either by deriving the limit from retained size or by shrinking what each revision stores.

## Objective

A long human-played match reaches full time with room to spare under the size limit, at the default heap.

## Context / Existing Behavior

- **Limits (#543 branch, `MatchMemoryBudget.java`):** `decodedLimit` = min(44 MiB, (available − 32 MiB) / 11). `appendLimit` = `decodedLimit` minus a reserve of up to one journal entry. At `-Xmx768m` that's 44 MiB and 40 MiB. `admitDecoded` throws `MATCH_SIZE_LIMIT` above `decodedLimit`.
- **Artifact cap (`main`):** `SetupSession.MAX_MATCH_ARTIFACT_BYTES` = `CompletedMatch.MAX_BYTES` = 64 MiB (`SetupSession.java:73`, `CompletedMatch.java:16`).
- **What the soak showed:**
  - The largest full-time match had about 713 revisions and reached 39.12 MiB decoded, counting base plus journal.
  - That's about 56 KB decoded per revision.
  - No match stopped on size.
- **Why the decoded limit may be too strict:** with frozen history (#543), the retained heap for history is charged separately (`ResidentSize`). Decoded size no longer tracks retained heap one for one.
- **Earlier work:** #554 found that every event stores a full state snapshot. It left the choice between keeping full snapshots and storing deltas or periodic snapshots to this follow-up or #548.

## In Scope

- **Size model:** measure decoded and retained size against revision count, from the soak's stored matches or a focused probe. Project the size of a long human match, and state the method.
- **Choose a remedy and record it in an outcome note:**
  - re-derive the decoded or append limit from the retained charge now that history is frozen; or
  - shrink what each revision stores, for example deltas or periodic snapshots, keeping format compatibility; or both.
- **Implement it:** apply the chosen remedy, with tests at the new limit.

## Out of Scope

- Raising the deployed heap.
- Changing the coach-facing behaviour at `MATCH_SIZE_LIMIT`, which #554 and #559 already define.

## Functional Requirements

- Existing stored matches and transcripts still load and replay (architecture-map invariant).
- `MATCH_SIZE_LIMIT` still stops a match before it can exceed the memory budget.

## Acceptance Criteria

- [ ] An outcome note in `docs/specs/` gives the size model, the projected long-match size and the chosen remedy.
- [ ] At `-Xmx768m`, the projected long human match fits under the append limit with at least 25% headroom.
- [ ] Tests cover the new limit, or the new per-revision storage, including loading matches stored in the old format.

## Constraints

- Preserve stored recovery, transcript and completed-match format compatibility. An ADR is required if a format retires.
- ADR 0004: recovery never reruns game commands.
- Start after #559 and #543 merge.
- Create a new branch for this work.
- Preserve unrelated working-tree changes.
- Follow existing repository conventions.
- Do not commit or push unless explicitly requested.

## Implementation Guidance

- Coordinate with #548 (serialization budget) and with the cache-full completion probe (#594). A higher limit raises the temporary memory needed at completion.

## Validation

- Create new or update existing regression tests as required.
- Focused server tests and `mvn clean install`.

## Completion Notes

- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.
