# Limited-use action tags: outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/342
Branch: `feature/limited-action-tags`
Worktree: `.tools/worktrees/limited-action-tags` under the original repository.
Validation handoff: implemented locally and reviewed at http://localhost:5000/play. The user accepted validation and authorized commit, PR publication, CI-gated merge, feature-branch deletion and final dev-local shutdown. This report records the checks completed before publication; no remote application deployment was requested.

## Delivered behavior

- Approved gold action-menu artwork appears above players over the selected black circular fade. No border, tile or pointer; placement follows each player's projected sprite and accommodates skill markers.
- All nine allowances have canonical tags: Blitz, Pass, Hand Off, Foul, Throw Bomb, Throw Team-mate, Kick Team-mate, Punt and Secure the Ball. Hail Mary and movement variants use the same family. Standing-up Blitz normalization is included.
- Confirmed explicit declarations and planned routes record player ownership at the existing browser allowance-consumption boundary. Previews do not record tags. Failed Bone Head, Really Stupid and Bloodlust rolls retain the declared allowance, including pending rerolls. Continuations cannot replace the original tag; additional allowance consumers can acquire their own tags even after the normal team flag was spent.
- TurnData copies and native JSON retain independent per-player metadata for recovery. Coach/spectator projections and recorded replay frames carry the same public action kind. Both server and browser validate the new field.
- On-pitch statuses retain tags, and movement/push coordinate updates move them with the player. Off-pitch players are omitted. Turn resets, kickoff-window endings, setup/touchdown transitions, between-turn phases and full time clear all records without looking up departed players. Administrative retained concessions also scrub terminal public tags.
- Show limited action tags defaults on and persists locally in Game Menu > Interface > Pitch and interface. It updates live play and replay immediately and uses existing MUTP checkbox styling.
- Included the previously approved AI queue scheduling fix, browser test stability repairs and prototype artwork. The user also explicitly requested publication of the original checkout's stadium brainstorming notes. No game mechanics, action sequencing or action eligibility was changed.

## Validation completed

| Check | Result |
| --- | --- |
| `npm.cmd --prefix browser-client test` after final UI changes | 378 passed, zero skipped |
| Browser TypeScript/Vite build, including `npm.cmd --prefix site run build` through dev-local preflight | Passed |
| `node browser-client/test/limited-action-tags-ui.mjs` | Passed: nine glyphs, default/persistence, both coaches/spectators, replay seeks, recovered snapshots, statuses, off-pitch removal and mobile viewport |
| `node browser-client/test/skill-markers-ui.mjs` | Passed: existing skills, settings, cards, zoom, replay/recovery and Android touch profile |
| `node browser-client/test/game-menu-events-ui.mjs` | Passed across six tabs and four viewport sizes, including the corrected Interface checkbox layout |
| Focused Linux Maven package selectors: `LimitedActionTagsTest,PlayerActivationAllowanceTest,PlayerActivationRecoveryTest` | Nine test methods passed; loops cover declaration variants, trait failures, planned handoff, replay retention, recovery, concession, copying and turn/window cleanup |
| Full Linux server package: `docker build --progress plain -f containers/local/Dockerfile -t ffb-limited-action-tags-check .` | BUILD SUCCESS: 175 common cases and 627 server cases, zero failures/errors; four opt-in database cases skipped |
| Supported rebuild: `FFB_BROWSER_TEST_WORKERS=2 node tools/deploy.mjs --environment dev-local` | Passed all 48 interaction suites and 10 hosted suites (78 reported browser cases, zero skips) in 587.3 seconds, then rebuilt/tested the server again and started dev-local |
| `npm.cmd --prefix computer-player test` with required Windows process-inspection access | All 41 passed, including idle-lease queue/recovery regressions |
| Direct `javac --release 8 -encoding UTF-8` for StringTool, VersionChangeList and ChangeList | Passed |
| Built-in local proxy live browser test | Passed: real Java authentication gate reached on initial connection and reconnect |
| Served production asset smoke | `/play`, `/assets/game/game.js`, `/assets/game/game.css` and approved action atlas returned HTTP 200; actual toggle/renderer/fade found |
| Deployed JAR inspection with `javap` | Confirmed getLimitedAction, recordLimitedAction, clearLimitedActions and action-window tracking in the running container's JAR |
| Stack inventory | One Hosting listener on 5000, one proxy on 22232, one backend on 22234, one computer daemon; server/database healthy; no review listeners on 5173, 5174, 5181 or 5182 |
| `git diff --check` | Passed |

Browser reports: `.tools/validation/local-browser-fKbSOS/` in this worktree. Visual evidence: `.tools/limited-action-review/gold-tags-pitch.png` and `interface-toggle.png`. Hosted smoke evidence: `.tools/deployed-tag-check/hosted-result.json`. Server/rebuild logs: `.tools-limited-action-server-final.log` and `.tools-limited-action-dev-local-2.log`.

The four skipped opt-in cases belong to SkillUsePreferenceSchemaIntegrationTest, Marker6SchemaTest, RecoveryJournalMariaDbTest and V2PreparationJdbcTest. Windows Maven could not resolve compiled common classes in this checkout; the supported Linux server builds and complete common/server suites passed instead. The changelog was also compiled directly for Java 8.

## Self-review findings resolved

The feature had never been integrated beyond its approved mockup. Added native ownership, the public field, real pitch rendering and the missing toggle. Regression runs found a standing-up Blitz normalization omission and an Interface label overflow; both were corrected. The native failed-trait fixture initially stopped at an optional Pro reroll and now explicitly declines it before asserting the failed trait and recovery. No temporary diagnostic instrumentation remains in product code.

## Manual review and remaining limits

Refresh http://localhost:5000/play and use a fresh turn or new match. Existing actions performed before the feature was installed have no ownership metadata and do not gain retroactive tags. Old-game compatibility/migration was intentionally not implemented, and no user games or database volumes were deleted.

Manual review on physical Android and Linux desktop browsers remains available to the user; automated browser runs used Windows Chrome, mobile viewport checks and the existing Android touch profile. The server build/tests ran in Linux containers. An authenticated manual game with the new feature has not been played on the user's behalf.

## PR validation follow-up

PR #343's first CI run caught five native golden fixtures that still expected player snapshots without tags. Regenerated adr0003-dice, adr0003-pass-ranges, adr0003-pass-workflow, adr0003-reroll-accounting and adr0003-reroll-choices from the real Linux engine. A recursive comparison proved the only changes were 222 expected limitedAction additions; dice, choices, sequencing, turn data and recovery content were unchanged.

Strict rerun of DiceProjectionTest, RerollAccountingTest, RerollChoicesTest, PassRangeProjectionTest and PassWorkflowTest passed all eight methods. Browser units passed all 378 tests again. The eight affected browser journeys also passed: apothecary-decision-ui, dice-ui, pass-ranges-ui, pass-workflow-ui, playback-ui, provisional-movement-ui, reroll-accounting-ui and reroll-choices-ui. Product code was unchanged by this follow-up.
