# Negative condition markers: outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/360

Branch: `feature/negative-condition-markers`.

Design: [approved specification](negative-condition-markers.md).

## Final handoff

The owner approved the player-card Status messages, menu and borderless image
previews. Issue #360 tracks this as one complete vertical implementation slice.
The feature branch was created from `main`; its base still matches local `main`.
Production browser components and authoritative server projections are implemented,
alongside the approved artwork, tests, change-list entry and validation inventory.

Final self-review found no additional blocking issues. Rechecked condition sources,
strict protocol validation, optional legacy metadata, card posture preservation,
marker ordering/wrapping, independent preference storage, borderless fade and
scope. Validation artifacts postdate all affected source files. The full passing
module suites and builds below remain applicable; they were not repeated without
source changes. At this handoff, the following focused check passed all nine tests:

`node --experimental-strip-types --test browser-client/test/negative-condition-markers.test.ts browser-client/test/player-card-details.test.ts browser-client/test/limited-action-tags.test.ts`

`git diff --check` also passed. The owner-approved appearance was retained.

## Implemented behavior

All six conditions are projected from native player state or named active
enhancements. The server continues to own their lifetimes; no gameplay rules,
timers or earlier-ruleset implementations changed. The browser-only markers
and player card consume the same public condition array for both coaches and
spectators. Existing projections without that optional array still load.

Six scalable SVG symbols use borderless red silhouettes and the exact shared
limited-use radial fade and bounded pitch sizing. The original filled circles
and light-blue outlines were removed at the owner's visual-review request. Distracted
uses three differently sized question marks. The other symbols are jaws,
roots, bitten food, an oily boot and an injured eye; no stunned stars were added.

Conditions appear in the approved canonical order, followed by a visible
limited-use marker. Each row is centered on the player's head; three markers
fit per row and additional rows grow upward, clearing the displayed skill strip.
Single markers retain the existing limited-use anchor. The markers follow
movement, remain on prone/stunned players and do not intercept pointer input.
Off-pitch markers are hidden while active condition data remains available.

Game Menu > Interface has **Show negative condition markers**, default on,
saved per browser/viewer and independent of limited-use markers. Both settings
update the pitch immediately. Denied storage has the same session fallback as
the existing preference system.

The card retains **Status:** and displays the base state followed by every
active negative condition. Negative entries, including prone/stunned, are red;
normal base states retain the existing color. Card information remains when
pitch markers are disabled. No marker tooltips were introduced.

The top change list includes the user-facing feature entry. The new browser UI
suite is registered in the existing interaction validation inventory.

## Acceptance evidence

| Requirement | Evidence |
| --- | --- |
| Six active conditions, additive posture | Server projection tests; strict browser protocol and card tests; desktop screenshot |
| Application/removal follows the engine | Real Bone Head/Really Stupid activation failures; activation clearing of distracted/eye gouged; source enhancement removal; multiple chomper release |
| Persists beyond turns | Accepted native end-turn and limited-use cleanup tests retain negative conditions |
| Correct drive lifetime | Native new-drive test removes Dodgy Snack and retains BB2025 game-long Greasy Cleats |
| Both coaches and spectators | Native projection and browser role checks |
| Replay and recovery | Completed replay validation, recorded event checks, recovery with active effects, legacy checkpoints missing condition metadata, browser seeks and restored snapshots |
| Layout and input | Unit placement checks for 1–7 markers; browser centered 3/3/1 rows, movement and pointer behavior; existing pitch interaction regression suite |
| Independent saved toggle | Unit storage/denial checks; browser immediate update, reload persistence, and independent limited-use toggle |
| Status list in red, no tooltips | Browser card assertions with markers enabled/disabled; six symbols without title elements; visual inspection |

## Checks run

Tooling used: bundled Node 26.12.0, Maven 3.9.9, Java 21, and installed Chrome
through Playwright. Maven used `-Dmaven.repo.local=.tools/repository`; native
builds needed execution outside the sandbox because Java was denied access to
a cached Netty JAR inside the sandbox.

- `mvn -pl ffb-server -am -Dtest=NegativeConditionMarkersTest,LimitedActionTagsTest,MatchServiceTest,PlayerActivationRecoveryTest -Dsurefire.failIfNoSpecifiedTests=false test`
  passed 39 tests before the two additional lifecycle tests were added.
- `mvn -pl ffb-server -am -Dtest=NegativeConditionMarkersTest -Dsurefire.failIfNoSpecifiedTests=false test`
  passed all seven final marker regression tests, including native activation and
  drive boundaries.
- `mvn -pl ffb-server,ffb-client-logic -am verify` passed the final affected
  reactor build and full module test suites: common 175 passed; server 658 passed,
  four skipped; client logic 23 passed. No failures or errors. Server and
  client-logic JAR packaging completed.
- From `browser-client`, `npm test` passed all 397 unit tests, no skips.
- From `browser-client`, `npm run build:play` passed asset synchronization,
  TypeScript checking and the final production build.
- From `browser-client`, `node test/negative-condition-markers-ui.mjs` passed
  the final implementation, including six symbols, red Status list, preference
  persistence/independence, viewer roles, replay seeks/recovery snapshots,
  prone/stunned, movement, off-pitch hiding, wrapping and desktop/mobile viewports.
- Existing browser regressions all passed:
  `node test/limited-action-tags-ui.mjs`, `node test/skill-markers-ui.mjs`,
  `node test/projected-pitch-ui.mjs`, `node test/dugout-ui.mjs`,
  `node test/game-menu-events-ui.mjs`.
- `loadBrowserManifest(process.cwd())` from `tools/validation/coverage.mjs`
  passed the complete browser validation inventory check.
- `git diff --check` passed. Self-review covered tracked and new source files,
  protocol validation, recovery normalization, ordering, appearance and scope.

Logs: `.tools/negative-condition-verify.log`,
`.tools/negative-condition-server-focused.log`,
`.tools/negative-condition-lifecycle.log`,
`.tools/negative-condition-browser-unit.log`,
`.tools/negative-condition-build.log`.

## Visual evidence

Inspected the actual rendered browser screenshots at 1440×1000 and 915×412:

- [All six symbols, crowded rows and Status list](../.tools/negative-condition-review/borderless/all-conditions-status.png)
- [Interface preference](../.tools/negative-condition-review/borderless/interface-setting.png)
- [Desktop pitch](../.tools/negative-condition-review/borderless/pitch-1440.png)
- [Mobile landscape pitch](../.tools/negative-condition-review/borderless/pitch-915.png)

These UI fixtures exercise rendering; native server tests provide lifecycle and
recovery evidence. No physical Android/tablet session was run.

### Borderless visual revision

After the owner requested removal of the borders, the two SVG backdrop circles
were removed while every symbol path, size and color was retained. Condition and
limited-use markers now share one CSS radial-fade rule. New previews are kept in
`borderless/` so the original review images remain available for comparison.

For this visual-only revision, `node test/negative-condition-markers-ui.mjs`,
`node test/limited-action-tags-ui.mjs`, `npm run build:play` and
`git diff --check` passed. The condition UI suite also checks that the computed
fade matches the limited-use marker and that no outer SVG circles remain.
Desktop and mobile screenshots were inspected again. No server code changed in
this revision; the earlier native verification remains applicable.

## Findings resolved and limits

The first server regression run exposed the separate completed-replay schema,
which initially rejected the added field. Its strict allowlist now accepts only
the six unique condition identifiers; tests reject malformed and duplicate values.
Recovery comparisons ignore the new optional field only when an older checkpoint
omits it. The activation test also established that action declaration precedes
actual activation; markers follow native clearing at the first committed move.
UI movement assertions account for both screen axes in angled camera views.

Four existing opt-in database tests were skipped because their database targets
were not configured: `Marker6SchemaTest`,
`SkillUsePreferenceSchemaIntegrationTest`, `RecoveryJournalMariaDbTest`,
`V2PreparationJdbcTest`. No database schema or persistence implementation changed.

Historical archived replays remain readable, but cannot show condition metadata
that was never recorded. They can still show the distraction information already
present in their old projection. Recovered live games derive all six conditions
from the retained native state.

The owner authorized staging all changes, committing, publishing a PR and merging
after successful CI, followed by local/remote branch cleanup and review-stack
shutdown. Final CI and merge evidence is recorded on issue #360 and its linked
PR. Remote deployment is outside this request.

## Dev-local startup follow-up

The owner's request to start one dev-local instance triggered the launcher's
complete browser validation gate. It found three additional test-only failures:

- The hosted completed-replay card assertion still expected `StatusStunned`.
  Updated it to `Status:Stunned`, matching the approved retained heading.
- The bribe fixture assigned React state and asserted the absence of the old
  dialog before the update committed. Its `showView` helper now uses `flushSync`,
  matching the synchronous snapshot harness used elsewhere. Assertions and
  production behavior are unchanged.
- The dice geometry check measured immediately after changing log text size,
  before the die's ResizeObserver recentered the glyph. An isolated measurement
  probe showed nonzero immediate offsets and exact zero offsets after layout.
  The check now waits for layout before retaining its existing centering and
  containment assertions; no dice rendering code changed.

All three failures reproduced individually and passed after these corrections:
`node --test --test-name-pattern="hosted final decision" site/test/m5e-result-browser.test.mjs`
and `node browser-client/test/foul-bribe-ui.mjs`, plus
`node browser-client/test/roundup-dice-hover-ui.mjs`. No debugging instrumentation
or production logic changes were needed. The managed startup was then retried
through its full browser gate.

The final managed startup passed all 53 interaction suites and 10 hosted suites
(83 recorded checks, no failures/errors). Reports are in
`.tools/validation/local-browser-oEeqLO/`; the successful startup log is
`.tools/negative-condition-dev-local-start-final.log`. The Docker game-server
build and native tests passed, the retained database and game server became
healthy, and the real proxy connection/reconnect check passed. Firebase Hosting
and the computer-player service started successfully at `http://localhost:5000/play`.

Final inspection found one managed review stack, listeners on 5000/22232/22234/23317,
and no Vite/preview listeners on 5173/5174/4173/4174. The Play page returned HTTP
200. The served production bundle at `/assets/game/game.js` contains the condition
setting and symbols. Existing database volumes and unrelated services were retained.

## Process retrospective

### CI snapshot follow-up

PR #362's Java state-test shards found eight golden projection snapshots and
the explicit recipient-player field contract that predated `conditions` metadata.
Regenerated the snapshots with the native test generators and compared parsed
JSON before replacing them: removing only the newly added `conditions` arrays
made every generated snapshot exactly equal to its existing fixture. All arrays
in these scenarios are empty; gameplay values and ordering are unchanged.
The recipient contract now explicitly includes the public field and asserts its
empty value for an unaffected player. The native snapshot assertions remain strict.

The focused native selector covers `PushbackArtworkTest`, `PassRangeProjectionTest`,
`DiceProjectionTest`, `CoreTurnActionsTest`, `RerollChoicesTest`,
`RerollAccountingTest`, `PassWorkflowTest` and `RecipientProjectionTest` under
Java 21 with the `mockito5` profile. Browser unit and consuming interaction suites
validate the refreshed fixtures. Final results and fresh CI evidence are recorded
on PR #362 and issue #360.

### Environment findings

Candidates for future environment improvement, in priority order:

1. Add a navigation pointer for public player projection changes to cover all
   three contracts together: `SetupSession`, `MatchJson` replay validation and
   `setup-protocol.ts`, plus recovery comparisons. The existing server regression
   suite caught the missing replay allowlist; that check is already present and
   should remain in the affected-test manifest.
2. Start Windows validation from the repository's existing build tooling and
   inspect available executables before invoking Maven/npm directly. This session
   spent extra calls discovering bundled Maven/Node, the npm PowerShell execution
   policy and sandbox JAR access. No new replacement build tool is needed.
3. Filter GitHub issue results to the fields needed before returning them to the
   agent. The initial full issue listing was unnecessarily large; the later
   installed-tool calls already use concise projections.

Existing CI runs Maven verification and the browser interaction inventory; the
new marker UI suite is wired into that inventory. No agent policy, global
instructions, skills or build-tool configuration were changed by this retrospective.
