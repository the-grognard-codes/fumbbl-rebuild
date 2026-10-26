# Camera perspective controls

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/357

Branch: `feature/357-camera-perspective-controls`, based on current main
`046b1565b5fdcc12b760685cdf3ff70190cea7a7`. One vertical slice covers the
camera controls, HUD placement, match recovery, replay and regression coverage.

## Approved behavior

Two always-available square buttons replace the Debug angle/end selectors.
Flip changes Home (looking from home toward away) to Away and back, preserving
angle and canonical focus. Angle cycles 30, 40, 50, overhead, then 30. Defaults
remain 40 degrees and the caller's own end, or home for spectators. All viewers
can change the viewing end without changing gameplay ownership or permissions.

The flip icon reverses on every press. Angle displays 30/40/50/90 with the degree
symbol. Brief nonblocking, accessible messages announce Home/Away perspective,
the current camera angle, or "Overhead view". Flipping overhead changes the
remembered end and icon, but leaves overhead rendering unchanged; its message
explains that the perspective applies in angled view. Leaving overhead applies
the remembered end. Choices survive same-match reload/reconnect/recovery through
tab-scoped session storage, isolated by match and caller role. Another match
starts with defaults. Blocked storage falls back to in-memory control state.

Live buttons sit beside the existing Game Menu on the right, with even gaps.
Debug moves beneath home inducements on the left, opposite Game Menu beneath
away inducements. Both sides remain on the same row beneath the resources.
Camera flips leave all HUD positions fixed. Replay uses the same two buttons in
its existing camera toolbar and retains its existing Game Menu location.
Unrelated Debug navigation/zoom controls remain available.

Visual review refinement: both camera buttons match the Game Menu button's
rendered height and remain square, including responsive and replay layouts.
This supersedes the initial 44-pixel size used during implementation review.

## Constraints and exclusions

Keep MUTP typography, colors and themes, with Android touch targets and responsive
Windows/Linux browser layouts. Preserve unrelated changes. No new projection
options, gameplay sequencing, cross-match preferences, hiding Debug, or future
relocation of Game Menu to its owning coach's side. The initial implementation
handoff excluded publishing; subsequent user approval authorizes commit, PR,
CI validation, merge into main, working-branch cleanup and stopping the local
review stack. Remote deployment remains outside scope.

## Validation manifest

- Camera preference units: cycle, overhead rendering invariance, persistence,
  invalid/blocked storage and match/role isolation.
- Dedicated browser acceptance: both coaches, spectator, replay toolbar,
  canonical input after flipping, overhead invariance, icon/messages, reload and
  match replacement, narrow/touch layouts and screenshot inspection.
- Existing affected browser journeys: projection, gameplay overlays, movement,
  passing, setup, dice, HUD/Debug, replay and pending/reconnect recovery. Update
  old camera selectors through a helper that exercises the real cycle button.
- Complete browser units, browser builds and native game-server build/tests.
- Self-review, exact results, visual evidence and gaps recorded in the adjacent
  outcome report and on the issue before handoff.

## Delivery status

Implemented and self-reviewed on the working branch. Browser units (393), all
52 interaction suites, all 10 hosted suites, production browser/site builds,
recovery checks and the pinned Linux server build/tests passed. Four existing
native opt-in integration cases were skipped. See
[the outcome report](camera-perspective-controls-outcome.md) for exact commands,
visual evidence, review fixes and platform/artwork limitations. The user approved
the behavior and final button sizes. Publishing and CI results are recorded on
issue #357 and its linked PR.
