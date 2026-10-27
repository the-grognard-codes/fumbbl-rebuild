# Cursor square marker: outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/369

Branch: `feature/369-cursor-square-marker`, created from clean local `main`.

Design: [approved scope and affected checks](cursor-square-marker.md).

## Implemented behavior

The browser pitch draws the existing cyan selected-player outline around the
canonical square under a mouse, trackpad or hovering pen. Empty and occupied
squares qualify. Selection remains unchanged, with one outline when hover and
selection coincide. Both coach views, waiting coaches, spectators and completed
match replays share the presentation.

Topmost-element hit testing hides the marker over panels, including chat, game
log, dugouts, action menus and overlays within the scene. DOM changes trigger a
coalesced hit test so opening/closing a panel beneath a stationary pointer also
updates the marker. Finite UI transitions/animations recheck while running, so
sliding panels hide the marker when they cover the pointer; infinite decorative
animations do not cause perpetual polling. Camera and mode changes reproject
the physical location.

Touch, pen contact, pointer cancellation, window blur and dragging clear hover.
Keyboard navigation retains its separate marker and clears physical hover until
pointer input resumes. Pending commands, recovery, suspended/disconnected live
matches and pending replay loads suppress the marker. Special targeting,
including kickoff placement, follow-up, push/Sidestep and reactive square choices,
keeps its existing guidance. Ending suppression restores a stationary pointer.

No game intents are sent by hover. Native rules, mechanics and sequencing are
unchanged. The latest client change list includes the improvement.

## Self-review

Reviewed input cleanup, stationary overlay/mode transitions, exact canonical
geometry, selection deduplication, all viewer modes and recovery gating. The
SVG marker cannot intercept pointer input and uses the existing selected-square
class and inset. Existing kickoff hover remains separate, and its state updates
now run only during kickoff placement to avoid duplicate renders during ordinary
pointer movement. No remaining blocking findings.

The first new browser regression failed because the test helper returns
scene-relative coordinates while `page.mouse` requires screen coordinates.
Adding the scene offset fixed the test; the original all-angle scenario passes.
All temporary debugging instrumentation was removed. A further sliding-overlay
regression exposed stale hit testing during CSS transitions. Tracking finite
transition/animation lifetimes fixed it; that stationary-pointer regression passes.

## Validation

Commands below ran from `browser-client` unless stated otherwise.

| Check | Result |
| --- | --- |
| `npm test` | 420 passed, 0 failed/skipped; rerun after final production edit |
| `npm run build` | Passed TypeScript and production Vite build after final edit; existing chunk-size advisory |
| `node test/cursor-square-ui.mjs` | Passed: empty/occupied squares, selection/coincident outline, 30/40/50/90-degree cameras, both coaches/waiting/spectator, real HUD overlays, stationary DOM changes, mode transitions, touch/pen/mouse, cancellation/blur, keyboard/panning, actual completed replay and pending history loads |
| `node test/projected-pitch-ui.mjs` | Passed canonical clicks, projection, both ends, kickoff targeting, camera, ball/dice and missing artwork; rerun after kickoff-hover optimization |
| `node test/pending-recovery-ui.mjs` | Passed real mounted match/socket flow, ordinary pending command and uncertain exact retry; marker hidden during pending work and restored without another move on accepted response |
| `node test/player-action-menu-ui.mjs` | Passed existing menu behavior with new marker exclusion assertions |
| `node test/follow-up-ui.mjs` | Passed both coach views, ordinary/chain follow-up, desktop/small viewport and panning |
| `node test/push-choice-ui.mjs` | Passed click and keyboard push/chain selection |
| `node test/setup-drag-ui.mjs` | Passed drag/drop, keyboard placement, Solid Defence and both views |
| `node test/playback-ui.mjs` | Passed ordered playback, seek/reconnect, reduced motion and required prompts |
| `node test/reconnect-ui.mjs` | Passed stale-auth-error clearing after reconnect |
| `node test/skill-prompts-ui.mjs` | Passed Sidestep activation/arrows/Back/decline/committed recovery, observers and desktop/phone prompt layout |
| Root: `node --test tools/test/validation.test.mjs` | 15 passed; the new UI suite is registered in the interaction inventory |
| Root: `./tools/target-build.ps1 verify -JavaHome .tools/jdk-21.0.11+10` | BUILD SUCCESS across all eight reactor entries; 1,163 tests counted, 1,152 passed, 11 skipped, 0 failures/errors |
| Root: project-local Maven `-f game-service/pom.xml clean verify` with workspace JDK 21, explicit `.mvn/settings.xml` for user/global settings and workspace Maven repository | Passed: 29 tests, 0 failures/errors/skips; shaded service built |
| Root: `git diff --check` | Passed |

The standalone service command used was:

```powershell
$env:JAVA_HOME = (Resolve-Path '.tools/jdk-21.0.11+10').Path
& ./.tools/apache-maven-3.9.9/bin/mvn.cmd --batch-mode --no-transfer-progress --settings .mvn/settings.xml --global-settings .mvn/settings.xml "-Dmaven.repo.local=$((Resolve-Path '.tools/repository').Path)" -f game-service/pom.xml clean verify
```

Maven initially failed inside the filesystem sandbox while javac accessed cached
ClassGraph/Netty jars. The same authorized builds were rerun outside the sandbox;
both game-service and full native verification passed.
The target launcher also needed the explicit installed workspace JDK path because
its default Program Files path is absent on this machine.

Visual evidence was generated and inspected at native screenshot size:

- `.tools/cursor-square-evidence/cursor-live-pitch.png`: full production HUD,
  default 40-degree perspective and cyan hover square.
- `.tools/cursor-square-evidence/cursor-square-selection.png`: selected/hover
  outlines and independent keyboard cursor in top-down view.

Validation uses local Chrome/Playwright and sanitized fixtures/socket simulation.
Pen/contact and hybrid input are browser-event simulations; physical stylus,
Android/tablet hardware and Linux browsers were not exercised. No remote match
or deployment validation was performed. The 11 native skips were pre-existing
opt-in database/retained-fixture checks: `Marker6SchemaTest` (1),
`SkillUsePreferenceSchemaIntegrationTest` (1), `RecoveryJournalMariaDbTest` (1),
`V2PreparationJdbcTest` (1), `R5CompletedFixtureGeneratorTest` (1),
`R5RestoredContinuationTest` (1), `RecoveryApplicationTest` isolated JDBC cases (2),
`RecoveryArtifactInspectionTest` (1), and `V2RuntimeIntegrationTest` (2).
Exact test names and module counts are in
`.tools/cursor-square-native-summary.json`; full logs are in
`.tools/cursor-square-native-verify-host.log` and
`.tools/cursor-square-game-service-verify-host.log`.

## Workflow retrospective

Following `retro` and `writing-for-agents`, two tooling follow-ups would reduce
future setup work: resolve the workspace JDK before the missing default host path,
and provide an explicit screen-coordinate wrapper around `squarePosition` (whose
existing return is scene-relative). The WinGet `rg.exe` launcher also failed in
this session; bounded PowerShell searches supplied the fallback. These are
environment/helper follow-ups, outside this feature's scope; no global policy,
skills or unrelated tooling was modified.

## Dev-local startup follow-up

The owner subsequently requested one dev-local instance. The launcher's complete
browser gate found a stale pass-workflow assertion that treated every cyan outline
as the selected player. Updated selection-specific assertions in pass, movement,
teammate, projection, route, adjustments and miscellaneous UI tests to require
`data-selection`; the independent hover/deduplication assertions remain intact.
The focused pass-workflow and match-adjustments checks pass.

The retry of `node tools/dev-local.mjs --start` passed the complete browser gate:
all 55 interaction suites and all 10 hosted suites (30 hosted test cases), without
failures or skips. Per-shard evidence is in
`.tools/validation/local-browser-htjJ2w/` and the subsequent all-green run
`.tools/validation/local-browser-PgNJlJ/`; startup output is in
`.tools/cursor-square-dev-local-final.log`. This supplements the focused checks
above. No production behavior was changed by this follow-up.

The Linux Docker build then exposed randomness in the existing chomp-condition
test: `advanceToTurn()` can grant Dodgy Snack during kickoff, but the test assumed
an otherwise empty condition list. Explicitly adding that effect reproduced the
same failure deterministically. The test now pins Dodgy Snack and checks that it
survives both chomp releases while chomp disappears only after the final release.
All seven `NegativeConditionMarkersTest` tests pass using
`./tools/target-build.ps1 test -JavaHome .tools/jdk-21.0.11+10 -Module ffb-server -Test NegativeConditionMarkersTest`.
This is a fixture/assertion correction; engine behavior is unchanged. Red/green
evidence is in `.tools/cursor-square-chomp-red.log` and
`.tools/cursor-square-chomp-green.log`. The full Linux server image subsequently
built successfully with all seven condition tests passing; evidence is in
`.tools/cursor-square-docker-build-final.log`.

Dev-local startup completed successfully. `http://localhost:5000/play` returns
HTTP 200; ports 5000 and 22232 each have one managed listener. The review server
and database report healthy, Firebase ADC checks pass, the real v2 proxy/reconnect
test passes, and the single computer-player process reports ready. Shared instance
ownership is recorded in `.git/dev-local-state.json`; no retained database volumes
were removed. The services were left running at the owner's request.

## Handoff

Implementation, self-review and required local validation are complete. The owner
approved the dev-local visual review, then authorized staging all changes,
committing, pushing, opening a PR, waiting for validation CI, merging to `main`,
deleting local/remote working branches and stopping dev-local. Final PR/CI/merge
and shutdown evidence is recorded on issue #369. No deployment was requested.
