# BB2025 Hail Mary Pass implementation outcome

Date: 2026-10-21. Branch: `feature/bb2025-hail-mary-pass`.

Design: [approved specification](hail-mary-pass-revision.md).
Tracking: [rules #325](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/325),
[browser/integration #329](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/329).

## Result

Implemented browser HMP pass/bomb modes and shared BB2025 engine corrections.
The user accepted the HMP changes after local visual review and authorized
staging, committing, a PR, merging after CI, and branch cleanup. Remote
deployment remains outside this authorization.
Results are recorded on [#325](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/325#issuecomment-6308588971)
and [#329](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/329#issuecomment-6308590766).

| Requirement | Implementation and acceptance evidence |
| --- | --- |
| BB2025 scope | Ruleset-specific resolution, range override, and independent passing initializer; BB2016/BB2020 range regressions preserve their behavior. |
| Eligible controls | Server-issued HMP declarations require the skill; bomb declarations also require Throw Bomb eligibility. Unskilled players have no HMP companion control. |
| Mode timing | Draft selection precedes declaration; an active passer can move and switch modes until target commitment. A synchronized, serialized intent flag preserves HMP during `PASS_MOVE`. |
| Action limits | Ball modes reserve the same pass allowance; bomb modes reserve the same bomb allowance. Native All You Can Eat tests cover a second normal/HMP bomb, skill consumption, and rejection of a third throw. |
| Range/weather | HMP targets every on-pitch square normally. Blizzard uses ordinary Quick/Short geometry while PA difficulty remains Long Bomb. Projection and native initial/repeated target validation use the same ruleset range service. |
| Resolution | PA-based minimum, ordinary Long Bomb modifiers, underlying-test reroll eligibility, inaccurate final flight, fumbles, Safe Pass, Cannoneer, and Strong Passing Game paths have regression coverage. HMP interceptions remain excluded. |
| Icons/overlay | Two distinct HMP glyphs reuse the existing MUTP ball/bomb artwork with an arc mark. Companion buttons reuse Jump sizing/highlights, including touch targets. Legal HMP cells use Long Bomb guidance; illegal cells are shaded. |
| Replay/logging | Captured native ball/bomb journeys decode in the browser; log facts retain PA, target and modifiers. Browser replay checks native dice and ball scattering. |
| Recovery | Native snapshots and a complete durable `SetupSession` checkpoint restore the mode and targets and permit continued mode switching. Browser reload restores authoritative mode without issuing a new action. |
| Cancellation | Rejected native HMP targets do not consume dice or record an illegal target. Legal retargeting and ending the action/turn remain available. |
| Older saves | No migration added, as agreed. The agent did not remove existing games. |

## Self-review

Corrected interactions found during review:

- Jump commands during a pass now retain HMP intent and apply the jump change.
- Skill-permitted second bombs retain mode controls and overlays even though the
  acting player's `hasPassed` flag is already set.
- Initial native throw dispatch now validates HMP before target mutation, closing
  the route that bypassed the existing subsequent-command range check.
- Rejected-target cancellation handles an absent thrower safely.
- Empty and occupied HMP targets are reviewed as throws; explicit Move selection
  retains movement during the declared Pass Action.
- Mode changes retain uncommitted movement routes and request a fresh preview
  against the accepted revision; stale or unrelated updates clear the draft.
- Strong Passing Game HMP reports and public logs retain the effective PA target
  and the positive strength modifier without changing the recorded die.

The new BB2025 initializer duplicates the shared initializer to satisfy the
repository's ruleset-isolation requirement. Other rulesets retain the original
class and behavior.

## Validation manifest and results

Commands run from the repository root unless otherwise noted. The pinned
toolchain uses `.tools/jdk-21.0.11+10`. Windows sandbox restrictions prevented
javac from closing a cached Netty ZIP resource; the same Maven commands ran
successfully outside the sandbox. No dependency or system-policy change was made.

| Check | Exact command | Result |
| --- | --- | --- |
| Initial focused rules | `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 test -JavaHome '.tools/jdk-21.0.11+10' -Module ffb-statetest -Test HailMaryPassTest,HailMaryPassRangeTest,SafePassTest,HailMaryWorkflowTest` | Passed; 24 tests at that stage. |
| Existing pass/log/recovery integration | `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 test -JavaHome '.tools/jdk-21.0.11+10' -Module ffb-statetest -Test HailMaryWorkflowTest,PassWorkflowTest,PassRangeProjectionTest,MatchLogPresentationTest,CoreTurnActionsTest,RecoveryScenariosTest` | Existing suites passed; new Jump test initially needed a fixture correction and subsequently passed. |
| Double-bomb exception | `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 test -JavaHome '.tools/jdk-21.0.11+10' -Module ffb-statetest -Test HailMaryBombAllowanceTest` | Passed, including four coach/second-throw combinations. |
| Complete HMP checkpoint | `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 test -JavaHome '.tools/jdk-21.0.11+10' -Module ffb-statetest -Test HailMaryWorkflowTest#fullCheckpointRestoresSelectedHmpModeAndAllowsContinuation` | Passed. |
| Full clean install | `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 install -JavaHome '.tools/jdk-21.0.11+10'` | Passed: 1,013 tests, zero failures/errors, 10 existing opt-in skips. This broad run preceded the final native admission hardening; the final clean verification below covers the final sources. |
| Final native admission tests | `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 test -JavaHome '.tools/jdk-21.0.11+10' -Module ffb-statetest -Test HailMaryTargetValidationTest,HailMaryWorkflowTest,HailMaryBombAllowanceTest` | Passed: 9 tests, no failures/errors/skips, including rejected-target cancellation and legal retargeting. |
| Final HMP report/log correction | `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 test -JavaHome '.tools/jdk-21.0.11+10' -Module ffb-statetest -Test HailMaryPassTest,NativeRollPresentationTest` | Passed: 17 tests, no failures/errors/skips. |
| Final clean verification | `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 verify -JavaHome '.tools/jdk-21.0.11+10' -NativeIncludesFile '.tools/hmp-final-includes.txt'` | Passed: 826 tests, zero failures/errors, 3 existing opt-in skips. Includes 94 affected native integration tests; all Java modules compiled and packaged. |
| Browser units, in `browser-client` | `npm.cmd test` | Passed: 360 tests, no skips. |
| HMP browser interaction/replay, in `browser-client` | `node test/hail-mary-pass-ui.mjs` | Passed: eight native coach/throw/weather journeys, draft and active mode switching, committed movement and retained draft routes, range shading, exact target commitment, reload and replay. Desktop 1440×900 and touch 768×900. |
| Existing browser ranges, in `browser-client` | `node test/pass-ranges-ui.mjs` | Passed; all weather states, both coach ends and cameras. |
| Existing browser pass workflow, in `browser-client` | `node test/pass-workflow-ui.mjs` | Passed; declaration, movement, pickup, reroll, recipient selection and confirmation. |
| Existing Jump UI, in `browser-client` | `node test/jump-planning-ui.mjs` | Passed, including touch controls. |
| Existing playback UI, in `browser-client` | `node test/playback-ui.mjs` | Passed; ordered playback, reconnect/seek safety, reduced motion and mandatory responses. |
| Browser production build, in `browser-client` | `npm.cmd run build` | Passed; existing chunk-size advisory only. |
| Validation tooling | `node --test tools/test/validation.test.mjs` | Passed: 15 tests. New browser/native tests are assigned to CI shards. |
| Whitespace | `git diff --check` | Passed. |
| Complete dev-local startup validation | `node tools/deploy.mjs --environment dev-local` | Passed: all four browser interaction shards and the hosted shard (405.5 seconds), current-source container build, healthy database/server, proxy authentication/reconnect smoke test, and computer-player startup. User subsequently accepted the HMP behavior. |

The final native include file selects `HailMaryPassTest`, `HailMaryPassRangeTest`,
`HailMaryTargetValidationTest`, `HailMaryWorkflowTest`, `HailMaryBombAllowanceTest`,
`PassRangeProjectionTest`, `PassWorkflowTest`, `MatchLogPresentationTest`,
`CoreTurnActionsTest`, `BallAndFoulActionsTest`, `SafePassTest`,
`RecoveryScenariosTest`, `RecoverySessionTest`, and `NativeRollPresentationTest`. Other Maven modules retain
their complete default test suites in that clean verification.

Local logs and full-run test totals are under `.tools/hmp-*.log` and
`.tools/hmp-full-install-summary.json` and `.tools/hmp-final-verify-summary.json`. Database/deployment fixture opt-in checks
were not enabled. The isolated dev-local stack was rebuilt for user review and
then stopped at the user's request. No remote deployment was performed.

## Visual evidence

Inspected these running-browser captures:

- [Desktop HMP pass](../../.notes/verification/hail-mary-pass/home-ball-NICE.png).
- [Touch HMP bomb in Blizzard](../../.notes/verification/hail-mary-pass/away-bomb-BLIZZARD.png).

The captures use synthetic players and engine-generated views. They verify the
menu, glyphs, selected states and overlays; they do not represent a deployed match.

## Workflow retrospective

Two environment improvements would reduce future setup and verification work:

- Let the pinned build wrapper discover the workspace JDK when the configured
  Program Files installation has moved. This run needed an explicit `-JavaHome`.
- Add a reusable durable-session fixture alongside the lightweight native
  `GameStateBuilder`. The lightweight builder omits rosters, which are required
  by full checkpoint normalization.

These are follow-up recommendations; agent policies and global tools were not changed.
