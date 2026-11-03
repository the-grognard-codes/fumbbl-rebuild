# Feature: Retire the V1 browser runtime

## Abstract
Retire `/browser/v1` and consolidate required functionality on `/browser/v2`, preserving `/play/...` URLs.

## Objective
Remove the obsolete runtime and maintenance burden without losing useful diagnostics or V2 data compatibility.

## Context / Existing Behavior
V1 is a development-only runtime with synthetic fixtures, older team/match screens, local persistence profiles, and test callers. V2 is the product runtime. Some shared renderers, transport types, and version-1 data formats are still used by V2.

## In Scope
- Inventory each capability as covered by V2, migrate, or retire with rationale.
- Retire V1 server selection, endpoint, protocol dispatch, client, and dedicated tooling.
- Preserve useful automated rejection, stale-request, retry, reconnect, choice, renderer-failure, replay, and restart coverage through V2.
- Preserve shared code and historical V2 data/recovery formats.
- Remove active dependencies on V1 local persistence and document retained volumes.

## Out of Scope
- Rules, mechanics, sequencing, public URL redesign, and compatibility adapters.
- Importing or deleting existing V1 database/backup volumes.

## Functional Requirements
Maintained callers use V2. V1 rejects connections, cannot be selected, and has no maintained startup path. Shared components are extracted where necessary. Fault injection remains development/test-only. Old diagnostic UI is removed.

## Acceptance Criteria
- Inventory dispositions and replacement evidence are recorded.
- No maintained executable V1 caller remains except negative tests.
- V2 supports live play through completion, results, replay, reconnect, and process restart during pending action and completion.
- Retry deduplication, restored state, and persisted recovery integrity are checked.
- Existing V1 volumes are untouched and documented.

## Constraints
Work on `retire-browser-v1`, preserve unrelated changes, follow repository conventions, retain all supported themes and public UI behavior. No commit, push, remote deployment, or merge is authorized. Dev-local startup is authorized.

## Implementation Guidance
Three slices: server retirement/shared transport extraction; browser retirement/automated renderer diagnostics; tooling retirement/V2 recovery verification and local delivery. The final slice integrates the first two.

## Validation
Focused regression tests followed by Java reactor, standalone game-service, browser unit/build and full local browser validation. Exercise actual V2 play/replay/recovery. Report exact commands and gaps in `v1-retirement-outcome.md`.

## Completion Notes
Investigate test/startup failures; leave a healthy dev-local instance at http://localhost:5000/play for manual validation. Track slice issues and results below.

## Issue tracking
- [#429 Server runtime and shared transport](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/429)
- [#430 Browser client and renderer diagnostics](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/430)
- [#431 Tooling, recovery verification, and local delivery](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/431), integrates #429 and #430.
- [#435 Unavailable match view reconnect](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/435), a focused recovery-control defect found during live validation. Enable explicit reconnect without automatic mutation retry.
