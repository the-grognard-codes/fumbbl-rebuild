# Feature: Integrate dice event icons, concise captions, and visibility preferences

Part of #448. Blocked by: #449 (inventory approval), #450 (sample-art approval and final assets).

## Abstract
Apply the approved icon/text design consistently to on-pitch non-block dice.
## Objective
Improve quick readability while preserving dice behavior.
## Context / Existing Behavior
Live/replay share dice parsing; recovery restores results without playing old animations. Existing Interface preferences provide the persistence pattern.
## In Scope
Approved roll metadata/labels, static event icons, existing animated outcome visibility, two Interface toggles, tests and dev-local readiness.
## Out of Scope
Block dice, mechanics, logs, compact replay summaries, tooltips, unapproved additions to roll rendering.
## Functional Requirements
Default both toggles on; support neither; persist per browser. One identity per logical roll. Event-only text while rolling; authoritative outcome after resolution; mark rerolls. No target/modifier text except reviewed exceptions. Unknown outcome omitted; unknown event retains existing text and no new icon. Accessible names, no tooltip. Preserve timing/grouping, existing injury animations, recovery and native-report compatibility.
## Acceptance Criteria
All four modes behave correctly in live/replay/recovery; approved events and outcomes display correctly; unrelated dice behavior preserved. Self-review complete; validation evidence recorded; dev-local starts successfully and is left ready for manual validation.
## Constraints
Preserve MUTP themes, unrelated working-tree changes, and repository conventions. No commit/push/deploy remotely.
## Implementation Guidance
Follow agreed spec.md and the approved inventory; add only presentation metadata when necessary without changing game rules. Update CHANGELOG.md Unreleased for user-visible changes.
## Validation
Focused behavior/regression tests; unit tests; browser required suites; game-server build/tests. Validate timing, groups, rerolls, live/replay/recovery and visibility persistence. Run supported dev-local startup and verify readiness, debugging failures. Record exact commands and outcomes.
## Completion Notes
Produce outcome report comparing final behavior to #448, report remaining uncertainty, branch and local validation URL. Preserve approval gates.
