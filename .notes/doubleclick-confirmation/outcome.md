# Doubleclick confirmation implementation report

Issue: [#409](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/409)
Branch: `feature/doubleclick-confirmation`
Base: `c487d06dc` (`origin/main` at branch creation)
Design: [spec.md](spec.md)

## Delivered behavior

- Move, block, blitz, foul, teammate pass and handoff can use two repeat clicks/taps on their already selected final destination or target to confirm. The selection click never counts, so a new target requires three clicks. Three rapid clicks work when confirmation is ready.
- Both repeats must arrive while Confirm is enabled, within 400 ms of one another. Early gestures are discarded; receiving a preview cannot execute them.
- A single repeat preserves the plan and its reviewed preview. Other targets and waypoints continue to edit the plan.
- Touch input shows Cancel plan beside Confirm, using the existing secondary-button styling. It clears the whole pending plan. Mouse/trackpad input hides it, including on hybrid devices. Right-click cancellation and waypoint undo remain available.
- Confirm and Space use the same readiness predicate and commit path as the gesture. The gesture resets on plan/revision changes, interruption, input changes and cancellation, and cannot submit repeatedly while pending.
- Empty-square passes, including Hail Mary targeting, remain outside gesture confirmation. Native pass confirmation derives its target from the offered action, preventing a previously selected teammate from confirming a different offer.

No game rules, server protocol, CSS, fonts, palette, dependencies, replay controls or deployment behavior changed.

## Implementation and acceptance evidence

| Area | Implementation / evidence |
| --- | --- |
| Gesture timing and lifecycle | `browser-client/src/doubleclick-confirmation.ts`; eight focused unit tests |
| Canonical player/square input | `browser-client/src/LivePitch.tsx` forwards pointer click timestamps; keyboard selection never contributes to a gesture |
| Shared confirmation and touch cancellation | `browser-client/src/SetupPanel.tsx` |
| Six actions and edge cases | New `doubleclick-confirmation-ui.mjs`: 20 browser journeys covering mouse/touch, rapid triple-click, cancellation, unready preview, pending submission, revision change, blur/visibility, hybrid/wheel input, excluded passes, disconnect and spectators |
| Existing behavior | Updated block and native-pass regressions preserve a repeated target and still cancel through right-click; native stationary passes also exercise doubleclick |
| CI registration | Added the browser suite to interaction shard 4 |
| Appearance | [Touch cancellation screenshot](evidence/touch-cancel.png), visually inspected at 1024 × 768; existing MUTP controls remain legible and unobstructed |

## Standards review

No hard documented-standard violations. One minor judgment suggestion was to replace canonical identity strings with a discriminated target type. The strings are intentionally retained as opaque equality keys with no parsing; adding a richer type would not improve the current gesture contract.

Standards findings: **0 hard violations; 1 minor design suggestion considered**.

## Spec review

Review identified and resolved three edge cases: native offers retaining an older teammate selection, gesture state surviving window interruption, and trackpad wheel input leaving the touch Cancel control visible. Regression coverage now exercises all three. Final review found no actionable requirements gaps or scope creep.

Spec findings: **0 outstanding**.

## Validation

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test browser-client/test/doubleclick-confirmation.test.ts` | PASS — 8 tests |
| `npm test` in `browser-client` | PASS — 457 tests, no failures/skips |
| `npm run build` in `browser-client` | PASS — TypeScript and Vite production build; existing bundle-size warning |
| `node --experimental-strip-types test/doubleclick-confirmation-ui.mjs` | PASS — 20 journeys |
| `node --experimental-strip-types test/movement-flow-ui.mjs` | PASS |
| `node --experimental-strip-types test/pass-workflow-ui.mjs` | PASS |
| `node --experimental-strip-types test/reconnect-ui.mjs` | PASS |
| `node --experimental-strip-types test/pending-recovery-ui.mjs` | PASS |
| `tools/target-build.ps1 install` | PASS — clean reactor build; 961 tests reported, 949 passed, 12 opt-in skips, no failures/errors |
| Pinned Maven/JDK `-f game-service/pom.xml clean verify` | PASS — 29 tests, shaded service artifact built |
| Full validation invoked by `node tools/dev-local.mjs --start` | PASS — 60 interaction suites across four shards and 11 hosted suites (31 hosted test cases); zero failures/skips |
| Dev-local startup | PASS — launcher exited 0 and reported ready; Firebase credential valid, database/game server healthy, hosting/proxy/computer service running |
| Live proxy browser check | PASS — assembled client reaches the real Java v2 authentication gate on initial connection and reconnect |
| HTTP smoke check | PASS — `/play` returns 200 with the Play page; `/assets/game/game.js` returns 200 and contains the new touch cancellation control |
| `git diff --check` | PASS |

Java validation uses Temurin **21.0.11+10** and Maven **3.9.9**. The ignored JDK selection initially pointed at Java 8; `tools/bootstrap.ps1 -JavaHome .tools/jdk-21.0.11+10 -Offline` refreshed it. Sandboxed Java compilation failed with dependency `AccessDeniedException`; approved host execution resolved the access boundary. Docker also requires host execution on this machine.

Reactor totals: `ffb-common` 19 tests; `ffb-tools` builds without test cases; `ffb-server` 651 tests (5 skips); `ffb-statetest` 291 tests (7 skips). Skipped checks require dedicated opt-in databases or retained artifacts: BrowserSchemaMariaDbTest, Marker6SchemaTest, SkillUsePreferenceSchemaIntegrationTest, RecoveryJournalMariaDbTest, V2PreparationJdbcTest, R5CompletedFixtureGeneratorTest, R5RestoredContinuationTest, RecoveryApplicationTest (2), RecoveryArtifactInspectionTest, and V2RuntimeIntegrationTest (2). These optional environments were not provisioned or exercised.

The first full browser run exposed a pre-existing asynchronous assertion in `coach-hud-ui.mjs`: it expected the new turn value immediately after calling React's state setter. The assertion now waits for the exact rendered value, without changing application behavior or relaxing its expectation. The focused HUD suite passed. The cadence suite's default evidence path resolved outside this checkout when launched from the repository root; the rerun supplies an absolute workspace-local `CADENCE_EVIDENCE`. A startup retry also waited for the focused browser process to release npm's native binding before reinstalling dependencies.

An additional startup rerun timed out before the existing teammate test mounted. That suite then passed in isolation with its same cache and no JavaScript/request errors; temporary diagnostics were removed. The final complete startup gate passed, including that suite. No application change was made for this intermittent loading timeout.

Final browser reports: `.tools/validation/local-browser-7DDOfL/{interaction-1,interaction-2,interaction-3,interaction-4,hosted-1}.json`. Build and diagnostic logs: `.tools/validation/doubleclick-confirmation/`; successful startup log: `dev-local-final.log` there. The browser runner records the branch's base commit; all checks ran against this uncommitted working tree. Final full browser validation completed in 383.8 seconds.

## Manual validation and limits

**Dev-local is running and ready at [http://localhost:5000/play](http://localhost:5000/play).** Google credential renewal is complete. Both the initial expiry and the callback mismatch from overlapping login attempts were resolved through one fresh sign-in. The renewed credential verified `OK`, and the standard review helper applied it to the local server and confirmed Firebase access.

`docker inspect` confirmed `ffb-match-review-server-1` and `ffb-match-review-database-1` are both **running / healthy**. The normal container build also passed its Linux server build/tests. Hosting serves the current Play page and feature bundle, nginx passed the real initial/reconnect v2 gate test, and the computer daemon reported ready with capacity four. Managed process state is retained in `.git/dev-local-state.json`. The services have been left running.

The computer daemon reports `RECOVERY_CORRUPT` while trying some retained matches. This is separate from the frontend feature; no server rules or persistence code changed, and stored match data was not removed or altered to suppress these warnings. Affected saved matches may not be usable for manual testing. The service itself remains ready and other match workers run. A new live match was not created automatically.

Automatic in-app tab opening could not be completed because the browser access host was unavailable. Use the URL above. HTTP and the launcher's real browser connection checks passed; the feature's visual check used the fixture screenshot linked above.

In a live match, select a player and destination/target, wait for Confirm to become enabled, then doubleclick the same final destination/target. A single repeat must leave the plan intact. For touch, verify Cancel plan appears and clears the plan; switch to mouse input and verify it hides.

Automated browser evidence uses Windows Chrome, including a mobile/touch-emulated viewport. Physical Android hardware and a Linux browser have not been tested. No new theme-specific styling was introduced.

## Workflow retrospective

The delivery workflow's retrospective found three environment preflight opportunities: verify the ignored JDK selection before a full reactor build, check Docker named-pipe access before starting the browser-validation-heavy dev-local launcher, and verify ADC renewal before invoking a launcher that may open its own login. Keep exactly one authentication flow active. No unrelated tooling or instruction-file changes were made.

The owner accepted the manual review and authorized commit, PR creation, CI-gated merge, branch removal, and the completed-features tracker update. Dev-local has now been stopped with `node tools/dev-local.mjs --stop`; database volumes were retained. The running-service details above record the successful manual-review handoff. No remote deployment is requested.
