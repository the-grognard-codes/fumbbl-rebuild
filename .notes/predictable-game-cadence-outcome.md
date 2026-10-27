# Predictable game presentation cadence: outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/371

Results recorded on [the issue](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/371#issuecomment-6453058225).

Branch: `feature/371-predictable-game-cadence`, created from clean current `main`
at `45c2209dbc730fd84ee8a569ae14794a9c0d62f6`.

Design: [approved scope and affected checks](predictable-game-cadence.md).

## Implemented behavior

Browser coaches and spectators share ordered presentation with one fixed live
cadence. Existing sprites translate between adjacent square centers over 200 ms,
including diagonals. Longer routes and newer queued revisions do not accelerate
steps. Safe provisional movement uses the same timing and confirmation consumes
its shown prefix without replaying it.

The first eligible logical dice roll appears immediately. Each logical roll has
a 500 ms presentation interval before the following event; simultaneous dice
stay together. Armor, injury and casualty are separate groups. Dice retain their
independent 1,200 ms visibility windows, and pending response results stay pinned.
Dependent decisions become available after their relevant presentation. Showing
the prompt does not tumble its already presented block or Pro dice again.

Ball steps use 250 ms travel intervals. Direction dice, arrival, catch rolls and
subsequent bounces stay in native order. When native scatter reports contain
several directions but only an endpoint, presentation expands the reported path
only if the complete in-bounds path reaches that endpoint. Incomplete or
inconsistent history uses actual native coordinates rather than inventing a path.
Repeated loose-ball coordinates remain observable; atomic carrier updates keep
the ball attached to each player step. A reported direction roll's 500 ms interval
can precede a 250 ms ball leg: these are ordered events, not concurrent timers.

Each browser presents independently. Server progression, native outcomes, turn
clock accounting and network processing are unchanged; no client acknowledgement
barrier is added. Presentation time consumes the existing running clock.

Reconnect, background recovery, backward/nonadjacent replay navigation and
explicit replay seeks restore snapshots and cancel stale timers. Explicit seeks
also jump directly when the selected event is adjacent. Normal replay Next/Play
retains animation; existing speed and skip controls work, with replay rates
scaling movement, ball steps, roll spacing and the existing 310 ms dice tumble.
Reduced motion minimizes translation and tumbling while retaining readable ball
and dice intervals and ordered discrete player squares.

No layout, control, theme, rules, clock-policy, desktop-client or new sprite-frame
work was introduced. The latest client change list includes the improvement.

## Self-review and fixes

- Reviewed queue eligibility, commit-before-timer scheduling, incoming revisions,
  provisional confirmation/divergence, native ordering and dependent input guards.
- Preserved result recovery when a numeric prompt arrives before its transcript:
  late history restores its dice once without an animation.
- Kept Multiple Block reveal tracking in presentation order, including background
  restoration, so later native selection reports cannot replay revealed dice.
- Distinguished explicit replay seeks from adjacent animated playback, and
  prevented block/Pro decision overlays from restarting completed rolls.
- Protected carrier coherence when a native sync includes several player and ball
  changes; splitting those ball coordinates ahead of the player would detach it.
- Updated tests that assumed decorative dice could outlive dependent input,
  350 ms roll spacing, 140 ms travel, accelerated catch-up or a fixed three-second
  Hail Mary completion time. Corrected harness selectors and added the actual
  production style wrapper before inspecting the full HUD screenshot.

No remaining blocking findings in the browser implementation.

## Validation

Commands ran from `browser-client` unless a different directory is named.

| Check | Result |
| --- | --- |
| `npm test` | 424 passed, 0 failures/skips after final production edit |
| `npm run build` | Passed TypeScript and diagnostic production bundle after final edit; existing chunk-size advisory |
| Site: `npm run build` | Passed production play bundle and static site after final edit |
| `node test/cadence-ui.mjs` | Passed exact live cadence for both coaches/spectator, diagonal/straight steps, growing queues, offered dice without reports, grouped damage rolls, prompt gating, native three-way scatter, ball/catch order, reduced motion, replay rates/seeks/skip, background and late-history recovery; mounts actual GameView and HostedResult controls |
| `node test/playback-motion-ui.mjs` | Passed real rAF geometry checks: 22 intermediate player frames and 29 intermediate ball frames in final run |
| `node test/playback-ui.mjs` | Passed ordered rolls/moves, retention, prompt gating, seek/reconnect, pending numeric result restoration, reduced motion and missing-transcript prompts; includes `verifyDiceStream` / D16 overflow checks |
| `node test/provisional-movement-ui.mjs` | Passed shown-prefix reconciliation, duplicate delivery, rejection/divergence/disconnect, synchronization timeout/full-time recovery, carried ball, ordered movement/rolls and snapshot results |
| `node test/multiple-block-dice-ui.mjs` | Passed both target orders, different choosers and background restoration without deferred roll echoes |
| `node test/block-visibility-ui.mjs` | Passed ordinary/blitz/uphill/Multiple Block, all roles/cameras, static/reduced motion, narrow view, native choices, replay seeks/reconnect and stale dice |
| `node test/reroll-readiness-ui.mjs` | Passed 2 native block-single cases with delayed state/art, both coaches, keyboard, cameras, narrow views, reconnect and exact retry |
| `node test/manual-reroll-ui.mjs` | Passed 4 native Pro phase journeys, original dice, separate Pro D6, reconnect and retained retry |
| `node test/pending-recovery-ui.mjs` | Passed mounted socket flow, ordinary pending action and uncertain exact retry |
| `node test/reconnect-ui.mjs` | Passed play/builder reconnect clearing stale authentication errors |
| `node test/ball-ui.mjs` | Passed 4 native pickup/drop journeys, carrier/loose sprite gating and reduced-motion rotation lifecycle |
| `node test/ball-zoom-ui.mjs` | Passed football/shadow scaling at .75x–3x, both ends and all camera angles |
| `node test/hail-mary-pass-ui.mjs` | Passed native ball/bomb controls, mode changes, movement, Blizzard, commitment and paced replay for both coaches; obsolete 3s completion assertion updated |
| `node test/movement-flow-ui.mjs` | Passed movement, Blitz/Foul, selection/ranges, undo/cancel, Space and duplicate confirmation guards |
| `node test/planned-transfers-ui.mjs` | Passed stationary/moving/pickup pass and handoff, recipient replacement/rejection and desktop/mobile editing |
| `node test/pass-workflow-ui.mjs` | Passed both coaches' Pass declaration, movement/pickup/reroll, recipient targeting and exact once-only confirmation |
| `node test/teammate-ui.mjs` | Passed both coaches' Throw/Kick Team Mate proposals, change/cancel, stale eligibility, confirmation and landing |
| `node test/roundup-dice-hover-ui.mjs` | Passed hover geometry, log dice scaling/centering, and native armor/injury pairs/rerolls/successive players after correcting its paused-clock completion assumption |
| Site: `node --test test/m5e-result-browser.test.mjs` | 6 passed, no failures/skips; completed replay asserts 500 ms roll spacing |
| Site: `node --test --test-name-pattern='completed replay' test/m5e-result-browser.test.mjs` | Passed again against final production bundle |
| Root: `node --test tools/test/validation.test.mjs` | 15 passed; cadence suite registered in the existing browser inventory |
| Root: `./tools/target-build.ps1 verify -JavaHome .tools/jdk-21.0.11+10` | BUILD SUCCESS across all eight reactor entries; 1,163 tests counted, 1,152 passed, 11 existing opt-in skips, no failures/errors |
| Root: project-local Maven `-f game-service/pom.xml clean verify`, workspace JDK 21, explicit workspace settings/repository | BUILD SUCCESS; 29 passed, no failures/errors/skips; shaded service built |
| Root: `git diff --check` | Passed |

The initial sandboxed native/service builds stopped while javac opened cached
ClassGraph/Netty dependency jars. Host-access reruns use the same project-local
toolchain and settings; this is the same environment limitation recorded in the
previous feature's outcome. Native verification retains Java 8 bytecode through
the existing target profile. Logs are `.tools/cadence-native-verify-host.log` and
`.tools/cadence-game-service-verify-host.log`; browser logs are
`.tools/cadence-unit.log`, `.tools/cadence-browser-build.log`,
`.tools/cadence-site-build.log` and `.tools/cadence-hosted-results.log`.

The 11 native skips are existing opt-in database/retained-fixture checks:
`Marker6SchemaTest` (1), `SkillUsePreferenceSchemaIntegrationTest` (1),
`RecoveryJournalMariaDbTest` (1), `V2PreparationJdbcTest` (1),
`R5CompletedFixtureGeneratorTest` (1), `R5RestoredContinuationTest` (1),
`RecoveryApplicationTest` isolated JDBC cases (2),
`RecoveryArtifactInspectionTest` (1), and `V2RuntimeIntegrationTest` (2).
Exact test identities/counts are in `.tools/cadence-native-summary.json`.

The standalone service command was:

```powershell
$env:JAVA_HOME = (Resolve-Path '.tools/jdk-21.0.11+10').Path
& ./.tools/apache-maven-3.9.9/bin/mvn.cmd --batch-mode --no-transfer-progress --settings .mvn/settings.xml --global-settings .mvn/settings.xml "-Dmaven.repo.local=$((Resolve-Path '.tools/repository').Path)" -f game-service/pom.xml clean verify
```

## Visual evidence and limits

Inspected at native screenshot size:

- `.tools/cadence-evidence/hosted-dependent-decision.png`: production HUD styling,
  separate native pickup result and circular response after playback.
- `.tools/smooth-gameplay/motion/pitch.png` and `loose-ball.png`: pitch presentation.
- `.tools/smooth-gameplay/motion/motion.json` and `ball-motion.json`: painted
  bounding rectangles sampled on browser animation frames.

The synthetic motion fixture uses labeled fallback player tokens; it verifies
the same marker interpolation used by existing sprites. Native fixture/socket
journeys and mounted production components cover live, spectator, replay and
recovery behavior. Background changes are browser-event simulations. Physical
Android/Linux devices, real network/hardware stalls and remote live matches were
not exercised. Timing values are nominal browser presentation intervals; actual
frames depend on browser scheduling. No remote deployment was performed.

## Dev-local review startup

The owner subsequently requested a single dev-local instance. The supported
`node tools/dev-local.mjs --start` workflow completed and served the current
working files at `http://localhost:5000/play`.

Its mandatory full browser gate first found a stale assertion in
`roundup-dice-hover-ui.mjs`: the test paused time and waited for a completed
revision before advancing the now-required roll presentation interval. A minimal
one-roll probe reproduced the timeout with the armor pair already visible;
advancing exactly 500 ms completed the revision. The test now checks each logical
roll's spacing and advances the final interval before asserting completion. No
production code changed in this follow-up. The full roundup test passes; the
temporary probe was removed. Diagnostic evidence is in
`.tools/cadence-roundup-red.log` and `.tools/cadence-roundup-green.log`.

The fresh full retry passed all 56 interaction suites and all 10 hosted suites
(30 hosted test cases), with no failures/skips, in 347.1 seconds using four
workers. Reports: `.tools/validation/local-browser-XVpWtI/`. Startup logs:
`.tools/cadence-dev-local-start.log` (initial gate) and
`.tools/cadence-dev-local-retry.log` (successful startup).

The Linux game-server image built successfully. The retained database and game
server are healthy, Firebase ADC checks pass, the real Java v2 proxy/reconnect
test passes, and the single computer-player daemon is ready. Final verification
returned HTTP 200 from `/play`, exactly one listener each on `127.0.0.1:5000`
and `127.0.0.1:22232`, and one review computer daemon. Shared ownership is recorded
in `.git/dev-local-state.json`. Database volumes were retained. Services were
left running for the owner's review.

## Workflow retrospective

Applied the repository `retro` and `writing-for-agents` guidance to this session.
The existing CI already builds/types-checks the browser and inventories its
interaction suites; the new cadence suite is registered there.

Two environment follow-ups would reduce repeated setup work: resolve a usable
workspace `rg` instead of the broken WinGet launcher, and document the known
javac dependency-cache sandbox failure beside the build launcher. A bounded
queue-draining helper would also make replay UI tests less dependent on obsolete
fixed catch-up delays. These are follow-ups, not changes to global policy or
unrelated tooling in this feature.

The owner approved the dev-local visual review and authorized staging all
changes, committing, pushing/opening a PR, waiting for validation CI, merging
into `main`, removing the local/remote working branch after merge, and stopping
dev-local. Integration and shutdown evidence will be recorded on issue #371
and its linked PR.
