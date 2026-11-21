# Feature: Close the integrated soak's measurement gaps

Issue: #597

## Abstract

The integrated soak of 2026-11-20 answered its main questions, but several gaps in its method left findings unattributed:

- heap censuses taken during temporary spikes;
- a histogram filtered down to two classes;
- an abandonment probe that never ran in the measured window;
- a driver that dropped two matches at the Hit and Run dialog;
- rate-limit responses with no request type.

Fix the method, and check the driver into the repository, so the next soak's evidence stands on its own.

## Objective

The next combined soak can attribute heap growth, rate limits and abandonment behaviour from its own artifacts, without inference.

## Context / Existing Behavior

- **The driver isn't in the repository:** the integrated driver and collector (`driver.mjs`, `collect.mjs`, `export-review*.mjs`) exist only in the off-GitHub soak archive. The checked-in soak is `browser-client/test/overnight-soak.mjs`.
- **Census timing:** each high census landed on a temporary spike.

  | Census | Live objects | What was running |
  | --- | ---: | --- |
  | post-abandonment | 180 MB | A completion 1 s earlier |
  | end-live | 193 MB | `setup/load` restores of 4.4 s and 2.2 s |
  | loaded-live | 171 MB | Restores at 908–914 s |

  The lowest heap after GC stayed between 33 and 81 MiB for the whole run.
- **Histogram filter:** `collect.mjs:68` keeps only the `SetupSession` and `MatchMemoryBudget$ResidentSize` rows and the total. No heap dump was taken, so the growing classes are unknown.
- **Abandonment probe:** `abandonment/events.jsonl` belongs to an earlier 17:56 UTC window. It stopped at revision 9 after repeated locator timeouts. The measured window had no abandonment probe, so the missing terminal reply isn't product evidence.
- **Hit and Run:**
  - Two matches were dropped at 19:24:19 and 20:10:40 UTC.
  - The driver looked for the move inside the decision dialog six times, then waited for an enabled `Confirmed!` button (`driver.mjs:293`).
  - The screenshots show the move choices as arrows on the pitch, with the dialog offering **Decline Hit and Run**.
- **Rate limits:**
  - There were 3,354 `RATE_LIMITED` responses.
  - 3,088 matched a diagnostics probe within 5 ms. The diagnostics probe limit is per connection (`BrowserV2Adapter.java:63`).
  - The worker's code log records no request type or ID, so 266 stay unclassified.
- Evidence: [the soak report](../reviews/2026-11-20-integrated-dev-soak.md) and the off-GitHub soak archive.

## In Scope

- **Check in the driver:** add the integrated driver, collector and export scripts to the repository, next to `overnight-soak.mjs`, without credentials or account identifiers.
- **Census:**
  - take each census only when no completion or restore has run in the previous 10 s, or record the requests in flight alongside it;
  - keep the top 50 histogram rows;
  - take one heap dump at the end of the run, kept off GitHub.
- **Abandonment probe:** run it inside the measured window. Fail the soak's preflight if it can't reach the abandonment step.
- **Hit and Run:** the driver picks the move on the pitch, or declines in the dialog, and has a regression fixture for that dialog.
- **Rate-limit attribution:**
  - the worker's code log records request type, operation and request ID;
  - the driver's diagnostics probe stays within the per-connection limit.

## Out of Scope

- Product changes to the Hit and Run dialog.
- Changing rate limits.

## Functional Requirements

- Soak artifacts contain no credentials, tokens, private account identifiers or private match data.
- The driver still passes the existing soak preflight.

## Acceptance Criteria

- [ ] The driver and collector are in the repository, with a `*.test.mjs` for any pure helpers.
- [ ] A census run records in-flight requests or skips spikes, keeps the top 50 rows, and saves an end-of-run heap dump locally.
- [ ] A short run shows the abandonment probe receiving its terminal reply inside the measured window.
- [ ] A fixture run gets through a Hit and Run decision without dropping the match.
- [ ] Every `RATE_LIMITED` entry in a short run carries a request type.

## Constraints

- Don't touch the shared soak stack while a soak runs.
- Create a new branch for this work.
- Preserve unrelated working-tree changes.
- Follow existing repository conventions.
- Do not commit or push unless explicitly requested.

## Implementation Guidance

- Reuse the `overnight-soak.mjs` helpers where they overlap, rather than duplicating them.

## Validation

- Create new or update existing regression tests as required.
- A short (15-minute) integrated run on a separate compose project.

## Completion Notes

- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.
