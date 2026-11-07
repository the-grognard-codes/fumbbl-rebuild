# Automated pitch drag capture

- Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/481
- Branch: `fix/prod-camera-drag-capture`
- Base reviewed: `6196ea5de` (`main`)
- Scope: automated browser helpers and regression coverage only.

## Decision and implementation

Retain the initial movement of up to eight client pixels in `squarePosition`.
Current `LivePitch` records right-button down but captures the pointer only once
movement exceeds six pixels in Manhattan distance. Five coarse browser-test
movement samples can all land on a floating panel before capture begins.
The initial short movement triggers the existing handler while still on the
pitch. Both movements use the original endpoint, so camera displacement and
expected focus remain unchanged. `travelToFocus` already uses this approach.

Add a scenario to the existing `projected-pitch-ui.mjs` suite. A floating panel
covers the later drag path while leaving the drag start clear. The helper must
reveal square `(0, 7)`; clicking it after removing the panel must emit exactly
that canonical intent. This exercises production handlers without changing them.

No changelog entry is needed because there is no user-visible runtime change.

## Acceptance evidence

- The existing coach-HUD, projected-pitch and camera-perspective suites passed
  both with and without the helper change before adding the regression. The
  normal paths alone therefore did not establish necessity.
- A deliberate floating-panel probe timed out without the capture movement and
  passed with it. Pointer-event traces confirmed that the original movement
  samples reached the panel; the corrected drag reached the captured viewport.
- The added projected-pitch regression fails on the original helper with
  `page.waitForFunction: Timeout 3000ms exceeded` at its `squarePosition(0, 7)` call.
- Camera projection unit tests: 14 passed, zero failures or skips.
- Independent Standards review: zero findings, including the added regression.
- Independent Spec review: zero findings, including canonical-targeting and
  unintended-gameplay-action assertions.

The final corrected regression run and GitHub PR checks are recorded on the
linked issue and PR before merge. Local diagnostic scripts and raw logs remain
under ignored `.tools/camera-drag-review/`.

## Exclusions

Production camera logic, UI, assets, deployment and release publication are
outside this change. The PR contains only the helper, its browser regression and
this acceptance record.
