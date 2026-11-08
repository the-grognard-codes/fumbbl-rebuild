# Feature: Responsive idle pitch panning

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/494
Working branch: `fix/idle-panning-latency`, isolated worktree from main `d430b9f36`. The scoped fix is also integrated into the original diagnostics working tree for combined validation and dev-local manual review.

## Abstract

Reproduce and reduce local camera input delay while no gameplay decision or server request is pending. Retain an executable panning regression and comparable before/after measurements.

## Objective

Keep the pitch close to the latest pointer position during drag/reversal, independently of action-response latency and nominal FPS.

## Context / Existing Behavior

The user's November 7 phone recording and Chrome trace demonstrate idle camera lag. Across four drags, original input to renderer-main dispatch was 21.96 ms median, 53.49 ms p95 and 137.35 ms maximum. Instrumented main-thread task occupancy was approximately 91.9%. Pointermove handlers were short; deferred React work, projection/DOM updates and HUD docking measurements are investigation leads, not established root causes. The startup profiler pause is excluded from application findings. Related #492 investigates response-associated stalls; this issue isolates idle panning.

## In Scope

- Repeatable network-independent panning through the real pitch renderer, including reversals, final position, projected geometry and HUD behavior.
- Baseline measurements of input receipt, camera DOM commit and rendering opportunities; geometry/render work and HUD measurement invalidation.
- Bounded, evidence-backed rendering or scheduling fixes, plus lifecycle, interaction and presentation regressions.
- Matched repeated diagnostics Off/Counters/Graph workloads and explicit tracing-overhead limits.
- Refresh the existing dev-local frontend artifact for manual validation after integration.

## Out of Scope

- Client/server action latency, authentication, persistence, gameplay rules and outcome prediction.
- A general renderer rewrite, new graphics dependencies, full-match recording, physical-display latency claims or remote deployment.

## Functional Requirements

- Use the latest drag position without replaying obsolete camera updates or leaving stale motion after release/cancel.
- Preserve perspective/top-down geometry, hit testing, camera bounds, zoom, both coach views, player selection and right-click behavior.
- Preserve live/replay/recovery movement, dice and required decisions, reduced motion and MUTP styling.
- HUD panel placement must still react to real bounds/content/viewport changes without unnecessary pan-driven measurement work.
- Player cards use team membership exclusively: home on the left, away on the right, in live play and replay. Camera/selection position never decides the card side (user clarification during implementation).
- Added measurement instrumentation stays in tests, or within existing bounded DEV-only diagnostics. PROD Debug remains hidden.

## Acceptance Criteria

- [x] A documented browser command goes red on the demonstrated local pan regression before the fix and green afterwards at the real call-site seam.
- [x] A controlled no-server workload repeatedly pans/reverses and verifies final camera/geometry alignment and absence of stale camera updates after release.
- [x] Measured before/after runs document artifact identity, fixture/viewport, browser/device, instrumentation, sample sizes, median/p95/max and frame gaps; changes are evaluated one variable at a time.
- [x] Relevant lifecycle, camera, projection, selection, live playback/replay/recovery and responsive-HUD checks pass.
- [x] The current dev-local client serves the validated frontend with the existing diagnostics work preserved; outcome and remaining physical-device/visual acceptance are reported.

## Blocked by

None. The current diagnostics work is a measurement dependency available in the working tree, not a requirement to close historical issues.

## Constraints

- Create an isolated working branch/worktree from current main and preserve unrelated working-tree changes.
- Preserve Android, Windows and Linux compatibility; do not claim physical-device performance from emulation or rAF alone.
- Keep existing rules, protocol, authorization, durability and replay compatibility unchanged.
- No commit, push, PR, merge or remote publication without separate authorization.

## Implementation Guidance

Follow the diagnosing-bugs loop: reproduce, minimize, rank falsifiable hypotheses, measure and change one variable, retain the correct regression seam. Reuse camera/HUD fixtures and the existing analyzer where appropriate. Avoid broad prefactoring before evidence supports it.

## Validation

- Focused panning/camera/HUD tests first, followed by browser unit/build and relevant interaction checks.
- Complete required repository preflight for the local frontend refresh; Java/server behavior is unchanged unless a later finding requires separate scope.
- Inspect desktop/touch-sized output and record remaining physical-device acceptance separately.

## Completion Notes

Record issue URL, branch/base, reproduction, diagnosis, scoped changes, review, exact checks, before/after evidence, served-artifact identity and remaining limits in the outcome report. Keep this issue open for user validation.
