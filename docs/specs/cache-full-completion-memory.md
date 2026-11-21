# Feature: Prove a near-limit completion fits in memory with the match cache full

Issue: #594

## Abstract

The integrated soak of 2026-11-20 showed that finishing a large match takes about 400 MiB of temporary heap. That fits the #543 memory budget at `-Xmx768m`, with little slack, but only one or two matches were resident at the time. Run a completion at the size limit with the cache filled to its admitted budget, before the server claims 32 concurrent matches at `-Xmx768m`.

## Objective

Evidence that the admitted worst case (a full cache plus one completion at the append limit) runs without an out-of-memory failure, and a recorded margin.

## Context / Existing Behavior

- **Budget (#543 branch, `MatchMemoryBudget.java`):**
  - `ACTIVATION_LIMIT` = 32, `RETAINED_FACTOR` = 4, `WORKING_FACTOR` = 11, `STAGED_DECODED_LIMIT` = 44 MiB.
  - At `-Xmx768m`: 576 MiB available, a 44 MiB decoded limit and a 40 MiB append limit.
  - `sharedWorkingBytes` reserves the largest single workspace, `decoded × 11 − retained`, across residents and the candidate.
- **What the soak showed:**
  - There were 46 G1 compaction full GCs, all from allocation failures. They came in bursts of 1–3, nearly all within seconds of a full-time result.
  - The heap reached 750–767 MiB before each burst. Live data after compaction reached 422–458 MiB, with about 2 residents.
  - Finishing a match of about 38 MiB decoded therefore needs roughly 400 MiB of temporary memory. That's consistent with the 11× factor.
  - Pauses stayed short: p99 38.3 ms, max 215.5 ms. There was no to-space exhaustion and no out-of-memory failure.
- **What isn't covered:** the 32-resident preflight used short histories, and concurrent play held 1–2 residents. Completion with a full cache never ran.
- Evidence: [the soak report](../reviews/2026-11-20-integrated-dev-soak.md) and its GC log in the off-GitHub soak archive.

## In Scope

- **An opt-in memory probe at `-Xmx768m`** that:
  - fills residents up to the admitted budget, with histories shaped like real play (frozen, mid-match and late-match sizes);
  - completes the largest match the budget admits, at the append limit;
  - then serves `matchTranscript/read` for that match to both coaches.
- **GC logging:** record peak heap, live data after each full GC, full-GC count, the longest pause and any to-space exhaustion.
- **Outcome note:** record the measured margin. If the probe fails, or the margin is under 10% of the heap, propose a budget change (factor, limit or reserve) here, with its evidence.

## Out of Scope

- Reducing completion's temporary memory (#593 and #548).
- Changing the heap size of deployed servers.

## Functional Requirements

- The probe runs the real admission path (`MatchMemoryBudget`), not sessions placed by reflection.
- Evidence files contain no credentials, account identifiers or private match data.

## Acceptance Criteria

- [ ] The probe runs at `-Xmx768m` without an out-of-memory failure or to-space exhaustion.
- [ ] An outcome note in `docs/specs/` records the resident set, the completed match's decoded size, peak heap, live data after compaction, full-GC count and the longest pause.
- [ ] Any budget change the result needs has a regression test.

## Constraints

- Start after #559 and #543 merge.
- Don't touch the shared soak stack while a soak runs. Use a separate compose project or a local JVM.
- Create a new branch for this work.
- Preserve unrelated working-tree changes.
- Follow existing repository conventions.
- Do not commit or push unless explicitly requested.

## Implementation Guidance

- `MatchMemoryWorkloadTest` and the #543 capacity preflight are the starting point. Extend them with late-match histories rather than building a new harness.
- Keep large raw evidence local, and commit a summary.

## Validation

- Create new or update existing regression tests as required.
- Run the opt-in probe and `mvn clean install`.

## Completion Notes

- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.
