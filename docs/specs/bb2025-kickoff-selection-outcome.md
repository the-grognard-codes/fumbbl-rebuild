# BB2025 kickoff selection — implementation outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/420

Branch: `feature/bb2025-kickoff-selection`

Design: [approved requirements](bb2025-kickoff-selection.md)

## Manual validation instance

Dev-local is running at **http://localhost:5000/play** with the current feature
code. Final checks: HTTP 200, database and game-server Docker health `healthy`,
real Java V2 authentication gate reached through the local proxy on initial
connection and reconnect, and computer-player startup accepted.

The temporary startup wrapper and keep-awake helper were removed. Original
editor settings were restored; the running services remain available for review.

## Delivered behavior

High Kick, Charge, Solid Defence, Quick Snap and player-recipient touchbacks share
pitch selection, toggle-to-deselect, the existing selection-square highlight and
explicit confirmation. The counter remains below the turn counter. Draft choices
stay in the browser; reconnect/reload discards them. Group confirmation is one
validated request, with duplicate-request protection and durable confirmed state.

Quick Snap selects up to D3+3 Open players before movement. Native checks enforce
the acting coach, selected group, adjacent empty destination and one move per
player, including across halfway. High Kick confirmation moves the eligible player
to the landing square and advances the event. Touchback clears the recipient's
selection before normal play, retaining the no-recipient square fallback.

Solid Defence keeps participants on the pitch, permits swaps only between selected
players, and validates the final formation. Fixed players cannot be moved through
the final coordinate payload. Confirmed participants have cyan/blue number outlines
separate from the selected actor, including after spending their action.

Older Quick Snap and reserves-based Solid Defence checkpoints retain their former
movement flow for the event already in progress. New events use the revised flow.
Optional presentation fields and native flags remain compatible with older saves.

## Review

**Standards:** The review identified disappearing participant markings and the
missing Unreleased entry. Both were corrected.

**Specification:** The review identified native sender/destination/fixed-player
checks, Charge interruption and event-end markings, and older-checkpoint
compatibility. These were corrected; the final narrow recheck approved the fixes.
Unrelated turn-mode transitions retain their previous selection behavior.

The final browser preflight also exposed lost Charge threat inspection during
local selection. Inspection now follows the selected participant without sending
draft commands, and clears independently when inspecting an unoffered player.
The hosted kickoff regression now clicks pitch players and checks one atomic
confirmation followed by a valid, still-rendered regular match state.

## Validation

| Check | Result |
| --- | --- |
| `npm.cmd test` in `browser-client` | 466 passed |
| `npx.cmd tsc --noEmit` | Passed |
| `node --experimental-strip-types browser-client/test/setup-drag-ui.mjs` | All five flows passed with desktop keyboard and phone-sized touch input; pitch highlights and touchback cleanup checked |
| `node --experimental-strip-types browser-client/test/movement-flow-ui.mjs` | Passed focused rerun |
| `node --experimental-strip-types browser-client/test/threat-ui.mjs` | Passed both coach views after restoring Charge inspection and updating draft assertions |
| `node --experimental-strip-types --test --test-name-pattern='hosted kickoff' site/test/m5e-result-browser.test.mjs` | Passed; atomic confirmation leaves the regular match rendered |
| `MATCH_ADJUSTMENT_CASE=quick-snap` and `status`, `node --experimental-strip-types browser-client/test/match-adjustments-ui.mjs` | Both passed; movement highlights and counter position |
| `REROLL_MODES=block-multi-2`, `node --experimental-strip-types browser-client/test/reroll-choices-ui.mjs` | Both coaches passed after waiting for external SVG rendering |
| `node --experimental-strip-types browser-client/test/playback-ui.mjs` | Passed live/replay pacing, ordered movement, reconnect snapshots and required prompts after clock-readiness correction |
| `tools/target-build.ps1 install` | Full run: 19 common, 661 server, 293 native tests; 12 opt-in skips. Two outdated expectations required the focused corrections below |
| `tools/target-build.ps1 test -Module ffb-statetest -Test RecoveryScenariosTest` | All 7 passed after adding Quick Snap group confirmation |
| `tools/target-build.ps1 test -Module ffb-statetest -Test SetupSessionTest#selectedSolidDefencePlayerCanBeRedeployedAndConfirmed` | Passed after testing an actual invalid on-pitch wide-zone formation |
| Pinned Maven `install -DskipTests` | All five modules built and installed successfully after test verification |
| Required browser preflight, completed in groups with `tools/validation/browser-suites.mjs` | All 72 suites passed (61 interaction, 11 hosted); existing manifest/report validator accepted all five group reports |
| Docker Linux/JDK 21 `mvn -B -ntp -DargLine=-Xmx3g -pl ffb-server -am clean package` | Build passed; common 19 tests and server 661 tests, zero failures/errors, 5 opt-in server skips |
| `node --test deployment/game-service/proxy/live-local-test.mjs` during startup | Passed against the rebuilt real Java server, including reconnect |
| HTTP `/play`, Docker health, computer-player startup | 200; both containers healthy; service connected |
| `git diff --check` | Passed |

The Java run therefore covers 961 passing test cases after the two corrected
regressions were rerun. The final packaging command does not rerun those tests.
The native recovery stress test completed and restored 34 full matches.

The 12 opt-in skips are in `BrowserSchemaMariaDbTest`, `Marker6SchemaTest`,
`SkillUsePreferenceSchemaIntegrationTest`, `RecoveryJournalMariaDbTest`,
`V2PreparationJdbcTest`, `R5CompletedFixtureGeneratorTest`,
`R5RestoredContinuationTest`, `RecoveryApplicationTest` (two database cases),
`RecoveryArtifactInspectionTest`, and `V2RuntimeIntegrationTest` (two cases).

Focused checks include browser draft/cap/toggle tests, both coach orientations for
Solid Defence swaps and invalid final formations, confirmed-group recovery before
and after a Quick Snap move, duplicate requests, and optional-field compatibility.
The browser interaction suite exercises all five selection flows and touchback
cleanup. A screenshot is retained at `.notes/kickoff-review/selection.png`.

## Execution notes and retrospective

- Windows sandbox identity could not write Git refs or access GitHub credentials;
  narrowly approved execution completed the authorized branch and issue creation.
- Java validation and hosted-browser preflight must run sequentially because both
  use Maven output directories. Concurrent attempts produced missing class files.
- VS Code Java auto-build recreated class files during Maven clean. Its workspace
  setting was temporarily disabled for validation and restored to its original contents.
- The initial four-worker browser preflight timed out in the general movement
  suite. Its focused rerun passed. Subsequent runs used one or two workers.
- Later preflight retries encountered a system execution stall and an external
  SVG readiness race. The reroll test now waits for nonzero SVG geometry, as its
  adjacent image check already waits for loading; it still fails for missing art.
- Playback's fake-clock pause formerly targeted only 100 ms in the future, which
  could pass before the command arrived. It now fast-forwards to a larger margin
  before publishing the scenario; all playback assertions remain intact.

Long execution stalls repeatedly interrupted whole preflight runs. Completed groups
1-3 were retained from `.tools/validation/local-browser-klgVON`; product code was
unchanged afterward. Group 4 and the hosted group were rerun into that directory.
A temporary startup wrapper uses the existing manifest and `validateReports` to
require all suites before running the unchanged dev-local build/startup steps.
This consolidates completed checks rather than claiming an uninterrupted full run.

No commits, pushes, PRs, merges or remote deployments are part of this handoff.
Physical Android and native Linux validation are not available in this Windows
session; automated touch/responsive browser checks are reported separately.

## Visual-review follow-up: standard confirmation

Removed the kickoff instruction panel and routed selection through the existing
centered Confirmed! control, including Space. Optional Skip event uses the existing
secondary-button style. The counter below the turns remains unchanged.

After this refinement: 466 browser unit tests, TypeScript, all five kickoff flows
with desktop Space/phone touch, and the hosted kickoff test passed. Rebuilt and
assembled local Hosting assets; `/play` returns HTTP 200. The full 72-suite run and
Java results above precede this browser-only refinement; Java code was unchanged.

The existing confirmation-position suite also passed for both coaches at five
viewport sizes. The updated screenshot shows the normal standalone control.

## Publication handoff

The owner approved publication and CI-gated merge. Dev-local has been stopped;
database volumes were retained. The earlier no-publication handoff boundary is
superseded by this authorization. PR validation and tracker completion follow.


Initial PR CI caught an omitted native shard registration for the new
KickoffSelectionMovementTest. Added it to shard 3 alongside kickoff/recovery
coverage; the CI manifest guard remains unchanged.

