# Revised skill prompts: implementation outcome

Completed locally on 2026-10-26 for [#361](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/361),
following the selected design in [#359](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/359).
Branch: `prototype/skill-decision-prompts`. [Approved specification](revised-skill-prompts.md).
The owner subsequently authorized staging all changes, committing, opening a PR,
waiting for CI, merging to main, removing the working branches, and stopping
review services. The local startup and subsequent delivery evidence are recorded
below. Remote deployment was not requested.

## Delivered behavior

- Skill-use and non-block reroll decisions use Orbit circles with the original
  cyan/blue palette and a separate Crest navy/gold source picker, high contrast,
  faded black outline, central question, Yes above and No
  below when a native decline exists. Player names are omitted.
- Numeric seconds sit in the depleting perimeter ribbon. Red begins at 20% of the
  original server allowance. Untimed decisions have a static border. The browser
  retains deadlines across remount/reconnect and awaits the server at zero.
- Placement protects the actual skill owner, including painted sprite bounds,
  dice, ball and major HUD obstacles. A pointer identifies the owner. Controls
  remain visible across the tested desktop, portrait and landscape viewports;
  pending and expired status lines have reserved space.
- Physical dice remain in the existing board overlay, including original roll
  context and separate Pro test dice. Multiple native choices use an adjacent
  chooser followed by confirmation; Back sends no command. Modifying skills and
  preference choices remain available. Pending submission disables controls.
- The explicitly approved non-block reroll policy offers an available Pass,
  Catch, Sure Hands, Dodge or Sure Feet first, honoring Always Use. Declining
  accepts the original roll without a Pro/team follow-up. Other native sources
  remain available when the built-in skill is unavailable, including Dodge/Sure
  Feet spent on an earlier distinct roll. A roll still cannot be rerolled twice.
- Native result resolution is preserved: an inaccurate pass may still be caught;
  ordinary failed pickup retains turnover/bounce sequencing. The policy is
  restricted to the existing browser-owned BB2025 optional-skill service.
- Block-dice reroll/selection controls retain their existing interface. Block
  skill-use decisions remain included. Native Juggernaut/Wrestle sequencing was
  inspected and left unchanged. Observer and replay views receive no actionable
  circular controls.
- Added user-facing change-list entries, protocol documentation and regression
  coverage. The three [interactive design mockups](../../browser-client/prototypes/skill-prompts/README.md)
  remain available separately from production routes.

## Validation performed

Commands below ran from `browser-client` unless a different root is named.
Browser journeys used separate `FFB_BROWSER_TEST_CACHE_DIR` paths.

| Check | Result |
| --- | --- |
| `npm.cmd test` | 400 tests passed, zero failures/skips. |
| `npm.cmd run build` | Passed, including production typecheck and asset sync. Existing large-chunk warning. |
| `npm.cmd run build:play` | Passed, including production play typecheck/bundle. |
| `node --experimental-strip-types test/skill-prompts-ui.mjs` | Passed actual GameView controls: skill-owner artwork bounds, native IDs, 60-second allowance, red 20% threshold, retained countdown, no invented expiry command, pending disablement, five built-in skills first, modifying skill availability, source/Back confirmation, portrait/landscape status visibility, block exclusion and observer isolation. |
| `node --experimental-strip-types test/reroll-choices-ui.mjs` | 56 native fixture cases passed: both coaches, non-actor/observer isolation, dice/cameras, keyboard, narrow layouts, reconnect and exact retry. |
| `node --experimental-strip-types test/reroll-accounting-ui.mjs` | 22 native resource-accounting fixture cases passed. |
| `node --experimental-strip-types test/manual-reroll-ui.mjs` | Four native Pro phase journeys passed, including original dice, separate D6, reconnect and retained retry. |
| `node --experimental-strip-types test/reactive-decisions-ui.mjs` | Passed skill/square/movement routing, native roll timing, monotonic expiry/remount, observer/replay isolation, both themes, desktop and Android viewport/touch profiles. |
| `node --experimental-strip-types test/dice-ui.mjs` | Passed native D6/D8/D16/block faces, landing orientations, motion continuity, keyboard/focus, viewports, both coaches, spectators and replay. |
| `node --experimental-strip-types test/pending-recovery-ui.mjs` | Passed ordinary pending presentation and uncertain-outcome exact retry. |
| `npx.cmd tsc --noEmit -p prototypes/skill-prompts/tsconfig.json` | Passed. |
| `node prototypes/skill-prompts/capture.mjs` | 188 prototype checks, zero browser/font/image/HTTP errors. |
| Native full common/server suite, command and isolation below | Common: 175 passed. Server: 657 discovered, 653 passed, four existing database opt-in skips; zero failures/errors. |
| Final native focused suite plus package, command below | 22 tests passed: optional reroll use, optional reaction use and allowance checkpoint compatibility. Server JAR and ZIP built successfully. |
| Browser validation manifest load | Passed; 53 interaction suites registered, including the new circular prompt journey. |
| `git diff --check` from repository root | Passed. |

Native validation used installed JDK 21 via
`JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`.
The shared workspace `target` classes were being replaced with incompatible
compiler output. Builds therefore used an isolated source snapshot under
`.tools/skill-prompt-native-validation`, with required browser fixtures and
`server.ini` copied in. Hashes of every changed native production/test file match
the validated snapshot. No credentials or configuration contents are included in
this report.

From repository root, the full suite ran with:

```powershell
mvn.cmd -B -f .tools/skill-prompt-native-validation/pom.xml -pl ffb-server -am package
```

Its tests passed; packaging initially failed because the validation snapshot
lacked `server.ini`. After copying that required input and adding the two new
allowance tests, the final successful suite/package command was:

```powershell
mvn.cmd -B -f .tools/skill-prompt-native-validation/pom.xml -pl ffb-server -am '-Dtest=ReactiveDecisionAllowanceTest,OptionalRerollSkillUseTest,OptionalReactionSkillUseTest' '-Dsurefire.failIfNoSpecifiedTests=false' package
```

The four skipped database checks were `Marker6SchemaTest`,
`SkillUsePreferenceSchemaIntegrationTest`, `RecoveryJournalMariaDbTest`, and
`V2PreparationJdbcTest`. Their isolated database environment was not supplied.
An initial accounting journey hit Windows `EBUSY` while a parallel build wrote
`dist-play`; rerunning after the build passed. No unresolved failing check remains.
Logs are local ignored artifacts under `browser-client/test-output/skill-prompts-*.log`.

## Visual review and remaining gaps

Inspected production screenshots with player artwork:
[desktop](../../browser-client/test-output/skill-prompts-live/desktop.png),
[portrait](../../browser-client/test-output/skill-prompts-live/portrait.png), and
[landscape](../../browser-client/test-output/skill-prompts-live/landscape.png).
Self-review found and fixed first-mount placement, painted sprite protection,
late dice protection, built-in priority with an available modifier, and clipped
landscape expiry text. Regression assertions cover these cases.

Authenticated live-server play and replay cutover were not run. Browser journeys
use native fixtures; native tests exercise server behavior, timeout and recovery.
Android coverage is Chromium viewport/touch emulation; native Android, Windows
and Linux app runtimes were not all exercised. Existing portrait perspective
scenery absence appears in both themes while reaction controls pass; that camera
issue is outside this feature. The isolated prototype uses different portrait
framing and must not be mistaken for a production camera fix.

The optional `allowanceMs` metadata preserves old checkpoints and new-reader
compatibility with old server messages. Older strict browser decoders reject
the added field, so server/browser release must be coordinated as documented in
`public-api-v2.md`. No remote deployment was performed.

Process findings: isolate compiler outputs when another build tool shares the
workspace, and do not write Vite output directories while browser watchers scan
them. The workflow references `/retro`, but no matching local command or available
skill was found; these findings are recorded here without changing agent policy.

## Requested dev-local startup — 2026-10-26

The owner requested stopping review servers and starting one dev-local instance.
No preview servers or running review containers remained at initial inspection.
The managed startup retained database volumes and rebuilt the current working
files without changing branches or committing them.

The complete preflight exposed three outdated assertions in `round-four-ui.mjs`,
`playback-ui.mjs` and hosted `m5d-blitz-browser.test.mjs`. They now verify the
selected circular surface and exact native action ID, separate retained dice,
and Dodge-first availability respectively. Existing block-dice assertions remain
intact. Each corrected suite passed individually and in the final full gate.

A real-time animation check observed only one intermediate frame during a
four-worker run. It passed unchanged with 21 frames individually. The final
complete run used the documented two-worker setting and passed with 19 frames:

```powershell
$env:FFB_BROWSER_TEST_WORKERS = '2'
node tools/deploy.mjs --environment dev-local
```

Final results:

- All 53 interaction suites and all 10 hosted suites passed. No suites were
  excluded. Browser gate: 808.2 seconds, reports in the local ignored directory
  `.tools/validation/local-browser-ovu4kk/`.
- Docker rebuilt and packaged the common/server sources: common 175 passed;
  server 659 discovered, 655 passed and the same four opt-in database skips;
  zero failures/errors. This full run includes the two new allowance tests.
- Game server and database health checks passed. The assembled client's proxy
  integration test passed against the real native authentication gate on initial
  connection and reconnect. This does not constitute authenticated match review.
- Hosting and the computer-player service started successfully. One dev-local
  stack serves `http://localhost:5000/play`. The older review containers remain
  stopped, and no separate prototype/preview server was started.

Startup/build log: `.tools/dev-local-skill-prompts-final.log`. No remote
environment was changed. Commits and pushes remain unauthorized.

## Owner visual correction and Catch follow-up — 2026-10-26

The owner clarified that Orbit's original cyan/blue palette belongs on the main
circle; Crest's navy/gold belongs only on the adjacent source picker. Production
and prototype styles now reflect that distinction.

A failed Catch after Pass previously pointed to the thrower because native
`ActionSource` defaulted generic rerolls to the active player. Reroll and Pro-test
ownership now comes from the native reroll dialog, retaining the existing team
validation. This also handles an opposing receiver. No command, action ID, roll,
resource choice or result resolution changed.

Recovery comparison accepts only the historical active-player source for these
reroll dialogs, then publishes the corrected receiver source. The new accurate-
pass regression retains choices and deadline without rolling again, and rejects
unrelated source metadata. This avoids invalidating a saved Catch decision when
its presentation metadata changes.

The duplicate name appeared because the circle is mounted outside the ancestors
that defined `.sr-only`. Its own scoped visually-hidden rule now keeps the name
available to assistive technology without painting a marker. Button shadows from
the hosting page are reset, answers are inset farther, and standard phone widths
keep enough circle space for the question. Browser assertions measure the painted
button/focus outline against the ribbon and check question clearance and 44px
touch targets at desktop, portrait and 320px widths.

Focused checks passed: 400 browser units and the production browser build; the
updated circular prompt journey with receiver pointer, palette split and hidden
name; 26 native ownership/optional-skill tests plus server package; the accurate-
pass recovery case after its final fixture refinement; and 188 regenerated
prototype checks. Native tests first reproduced both the wrong player and the
saved-checkpoint incompatibility before their respective fixes.

Visual evidence: [Catch receiver](../../browser-client/test-output/skill-prompts-live/catch-receiver.png),
[portrait](../../browser-client/test-output/skill-prompts-live/catch-receiver-portrait.png),
[320px view](../../browser-client/test-output/skill-prompts-live/catch-receiver-narrow.png).
The prototype capture server was stopped after capture.

Final follow-up results:

- Full browser gate passed all 53 interaction and 10 hosted suites in 729.8
  seconds with two workers. Reports: `.tools/validation/local-browser-AY3DO3/`;
  log: `.tools/dev-local-prompt-refinement-validation.log`.
- After the final code changes, `npm.cmd test` passed 400 tests and
  `npm.cmd run build` passed again. The gate and Hosting assembly also ran
  `npm.cmd run build:play` successfully. Logs:
  `browser-client/test-output/skill-prompts-refinement-{unit,build}.log`.
- Full Docker game-server test/package build passed: common 175 passed; server
  663 discovered, 659 passed and the same four database opt-in skips. The total
  includes a concurrent kickoff test outside this prompt change. Unrelated
  kickoff/redeployment edits appeared during the run and were left untouched.
- The current working files were assembled for local-dev. Only the review game
  server and AI worker were restarted. The 2 GiB heap, one AI worker, managed
  state, database and match records were preserved. Hosting/proxy remained a
  single instance. No prototype server remains listening.
- The real proxy initial/reconnect test and mounted ADC check passed. HTTP
  inspection confirmed the served stylesheet contains Orbit's cyan circle and
  Crest's gold source-picker variables. Both review containers are healthy.

Refresh log: `.tools/dev-local-prompt-refinement-refresh.log`.
The updated instance is available at `http://localhost:5000/play`. The receiver
scenario was verified using native catch/recovery tests and actual GameView
fixtures; no pass/reroll was submitted in the owner's match as a test. No commits,
pushes or remote deployment were performed.


## Compact circle and dice-side placement ? 2026-10-26

After the owner approved the functional flows, the circle diameter was reduced
by 25%: normally 196px to 147px, and 172px to 129px in the narrow fallback.
Yes/No boxes now use tighter proportional dimensions and padding. Dedicated
layout rows keep both divider lines between the question and answers, including
keyboard focus outlines. The numeric timer remains in the perimeter ribbon;
Orbit/Crest colors and native decision behavior are retained.

Placement prefers the related dice's horizontal half of the visible pitch and
nearby clear space. Player, dice and HUD protection take priority when that half
is crowded. This preference also updates when the separate dice portal arrives
after the prompt. No camera movement or dice repositioning was introduced.

Focused validation passed: 403 browser unit tests, the production browser build,
and the circular prompt browser journey. New placement cases cover both dice
sides with a player on the opposite half and a crowded-side fallback. Browser
geometry checks cover compact answers, both visible dividers, keyboard focus,
longer text, desktop/portrait/320px viewports, and the actual failed-pickup die
arriving after its prompt. Visual captures were inspected at native size.

Evidence: [compact prompt with dice](../../browser-client/test-output/skill-prompts-live/dice-affinity.png),
[Catch receiver](../../browser-client/test-output/skill-prompts-live/catch-receiver.png),
[320px view](../../browser-client/test-output/skill-prompts-live/catch-receiver-narrow.png).

The smaller visible answer buttons supersede the earlier 44px button-height
check; their geometry now follows the owner's explicit size/padding revision.
The separate source picker retains its 44px controls.

Final checks and local refresh:

- `npm.cmd test` passed all 403 browser unit tests; `npm.cmd run build` passed.
  Logs: `browser-client/test-output/skill-prompts-compact-{unit,build}.log`.
- `node test/skill-prompts-ui.mjs` passed the focused UI journey. The full
  `validateLocalBrowser` gate with `FFB_BROWSER_TEST_WORKERS=2` passed all 53
  interaction and 10 hosted suites with zero skips in 654.0 seconds. This includes
  live decisions, playback/replay, provisional disconnect/recovery, pending
  commands, and browser reroll flows. Reports:
  `.tools/validation/local-browser-tEfXwE/`; log:
  `.tools/dev-local-prompt-compact-validation.log`.
- An isolated, uncached Docker build stage ran
  `mvn -B -ntp -DargLine=-Xmx3g -pl ffb-server -am package` successfully:
  common 175 passed; server 663 discovered, 659 passed, four database opt-in skips
  (`SkillUsePreferenceSchemaIntegrationTest`, `Marker6SchemaTest`,
  `RecoveryJournalMariaDbTest`, `V2PreparationJdbcTest`). Native recovery cases
  ran as part of this suite. Log: `.tools/skill-prompts-compact-server-build.log`.
- `node deployment/firebase/scripts/assemble.mjs --environment local-dev` passed
  the site and browser play build and refreshed the served local files. The
  existing game server, AI worker, proxy, Hosting process, database and saved
  games were preserved, including the 2 GiB / one AI mitigation. Log:
  `.tools/dev-local-prompt-compact-assemble.log`.
- `node --test deployment/game-service/proxy/live-local-test.mjs` passed initial
  connection and reconnect through the real native authentication gate without
  submitting credentials. HTTP inspection confirmed the served circle sizing,
  compact controls and divider rows. `git diff --check` passed.
- Self-review found no changes to native action selection, deadlines, reroll
  accounting or dice rendering in this refinement. Unrelated kickoff work was
  preserved. No commits, pushes or remote deployment were performed.

The single local instance is available at `http://localhost:5000/play`.



## Timeout-answer outline and background-only hover ? 2026-10-26

The pale-gold outline now identifies the native timeout answer, rather than
keyboard focus. For timed optional circular skill/reroll prompts, the recognized
native decline (`skill:false`, `reroll:none`, or `reaction-decline`) is marked on
No. Untimed prompts and unrecognized continuations have no implied timeout
answer. This follows `ReactiveDecision.decline` without changing that method,
projecting new fields, or sending a client action when the timer reaches zero.

Yes/No hover and keyboard focus change only the background. Text and border
colors remain unchanged on hover, and the timeout outline remains on No while
focus moves. Source-picker controls retain their existing focus styling. The
marked answer exposes an accessible description and a tooltip explaining that
it is chosen if the timer expires. Existing keyboard activation is preserved.

Focused checks passed: 404 browser unit tests, the production browser build, and
`node test/skill-prompts-ui.mjs`. The UI test verifies initial keyboard access
without a focus outline, a persistent No timeout marker during focus/hover and
expiry, background-only hover on both answers, no marker for untimed prompts,
receiver ownership, compact layout/divider/ribbon clearance and native command
identity. Unit coverage rejects unknown label-only defaults and covers native
skill, reroll and reaction decline IDs. Desktop and narrow screenshots were
inspected. The full browser gate and isolated game-server test/package run are
recorded below when complete.


The first full browser gate stopped at the legacy dice journey's assertion that
all focused choices have an outline. Its non-block circular case now checks the
requested background focus state; block-dice choices retain the existing outline
assertion. `node test/dice-ui.mjs` passes after this assertion update, including
keyboard command identity, both coach roles, spectators and replay. The initial
attempt's log is `.tools/dev-local-prompt-default-validation.log`; it is not
reported as a passing full gate. No production code changed during this repair.


Final timeout-marker validation and local refresh:

- `npm.cmd test`: 404 passed. `npm.cmd run build`: passed.
  Logs: `browser-client/test-output/skill-prompts-default-{unit,build}.log`.
- `node test/skill-prompts-ui.mjs` and the repaired `node test/dice-ui.mjs` passed.
  The latter includes both coaches, exact keyboard commands, observers and replay.
- Fresh complete `validateLocalBrowser` run, two workers: all 53 interaction and
  10 hosted suites passed with zero skips in 518.6 seconds. This covers live
  prompts, pending/retry, replay, disconnect/recovery, and manual reroll reconnect.
  Reports: `.tools/validation/local-browser-L2VHNd/`; log:
  `.tools/dev-local-prompt-default-final-validation.log`.
- Isolated uncached game-server build stage ran
  `mvn -B -ntp -DargLine=-Xmx3g -pl ffb-server -am package` successfully:
  common 175 passed; server 663 discovered, 659 passed, four database opt-in skips
  (`SkillUsePreferenceSchemaIntegrationTest`, `Marker6SchemaTest`,
  `RecoveryJournalMariaDbTest`, `V2PreparationJdbcTest`). Native optional-skill
  and recovery tests passed. Log: `.tools/skill-prompts-default-server-build.log`.
- `node deployment/firebase/scripts/assemble.mjs --environment local-dev`
  refreshed the local files after successful site and browser play builds.
  HTTP inspection verified the served timeout marker and focus styling.
  Log: `.tools/dev-local-prompt-default-assemble.log`.
- `node --test deployment/game-service/proxy/live-local-test.mjs`: initial
  connection and reconnect reached the real native authentication gate; no
  credentials submitted. Log: `.tools/dev-local-prompt-default-reconnect.log`.
  `git diff --check` passed.
- Single Hosting listener on port 5000; no listeners on prototype ports
  5173/5174/5183. Both existing containers are healthy. The game server, AI
  worker, proxy, Hosting process, database, saved games and 2 GiB / one AI
  mitigation were preserved. No commits, pushes or remote deployment.

Self-review confirmed that outline classification follows the existing native
decline contract, unknown/untimed cases have no invented default, actual answer
commands and server expiry are unchanged, and hover does not alter answer text
or borders. The single local instance is ready at `http://localhost:5000/play`.


## Sidestep circular prompt and shared pitch arrows ? 2026-10-26

The owner identified that the combined Sidestep skill/destination path still
used the rectangular reaction dialog and approved converting it to the new
circle with the existing push/Hit and Run/follow-up style arrows.

Sidestep now shows the compact Orbit circle pointing to the native skill owner.
Yes stages destination selection locally; it sends no command. The circle then
asks for a Sidestep arrow, with local Back and the original No/default decline.
An arrow sends the exact existing atomic use-plus-destination action. The shared
arrow renderer supplies the visuals, direction, pointer/keyboard activation and
pending disablement. The circle protects the arrow footprints as well as its
owner, dice and HUD. No target-square boxes or source picker are shown for this
path, and no automatic camera change is introduced.

Committed recovered Sidestep destinations use the circle and arrows immediately,
without offering an invalid decline or reusing the skill. Unknown/older action
formats retain their exact fallback controls. Observers and replay have no live
Sidestep activation controls. Local staging and remounts retain the authoritative
deadline; the browser still sends nothing at zero.

Native source metadata for optional Sidestep square/decline actions now uses the
skill dialog's player. Team validation is retained. Recovery comparison accepts
only the historical active-player/null source mapping for these native choices;
newly published choices identify the correct owner. Native action identities,
legal destinations, sequence, resource accounting and timeout behavior are
unchanged. Focused native tests cover both coaches, recovery, exact destination
application, deadline preservation, invalid source rejection and timeout decline.

The browser fixture now uses the real game-page framing/styles and checks the
current published owner rather than the original fixture's owner. Test data uses
adjacent attacker/defender positions and progressing native revisions. This
caught the existing portrait perspective lens fallback: extremely narrow/tall
surfaces reduce pitch scale to about one pixel per square. Phone destination
clicks are therefore verified through the existing public top-down camera;
landscape and desktop use perspective. That existing camera limitation is not
changed by this feature; no automatic camera switching is added.

Focused checks: 405 browser units, production browser build, expanded circular
Sidestep journey, general reactive-decision journey, and 20 native ownership/
reactive tests with server package. Sidestep UI scenarios cover both coaches,
desktop, phone top-down, landscape, local Yes/Back, exact native arrow commands,
duplicate prevention, decline/default/expiry, observer suppression, remount,
committed recovery, arrow/owner visibility and unchanged camera during staging.
The native snapshot Maven invocation initially hit a sandbox JAR AccessDenied
error; the same focused command passed outside the sandbox. No product fix was
needed for that environment restriction.

Visual evidence: [Sidestep desktop](../../browser-client/test-output/skill-prompts-live/sidestep-away-1440.png),
[phone top-down](../../browser-client/test-output/skill-prompts-live/sidestep-home-390.png).
Full validation and dev-local refresh results are recorded below when complete.


Final Sidestep results:

- `npm.cmd test`: 405 browser units passed. `npm.cmd run build`: passed.
  Logs: `browser-client/test-output/skill-prompts-sidestep-{unit,build}.log`.
- Focused `skill-prompts-ui.mjs`, `reactive-decisions-ui.mjs`,
  `push-choice-ui.mjs`, `follow-up-ui.mjs` and `round-four-ui.mjs` passed.
  The expanded Sidestep journey covers six coach/viewport combinations.
- Focused native `ActionSourceTest,ReactiveSkillDecisionTest` plus server package:
  20 passed, no skips. Log: `.tools/skill-prompts-sidestep-native-focused.log`.
- Fresh full browser gate with two workers: 53 interaction + 10 hosted suites
  passed, zero skips, 612.3 seconds. Reports:
  `.tools/validation/local-browser-5a3puR/`; log:
  `.tools/dev-local-sidestep-validation.log`. Replay, retained retry,
  disconnect/recovery and existing shared-arrow paths passed. The initial
  dependency-install preflight hit an EBUSY file lock because the last focused
  test server was still closing. That server closed and a fresh complete gate
  passed; the failed preflight is retained separately in
  `.tools/dev-local-sidestep-preflight-failed.log`.
- Uncached Docker game-server test/package build passed: common 175 passed;
  server 665 discovered, 661 passed, four database opt-in skips
  (`SkillUsePreferenceSchemaIntegrationTest`, `Marker6SchemaTest`,
  `RecoveryJournalMariaDbTest`, `V2PreparationJdbcTest`). Log:
  `.tools/skill-prompts-sidestep-server-build.log`.
- The local refresh script rebuilt/packaged the native image again, assembled
  the site/browser play bundle, and restarted only the game server and its
  single AI worker. Both containers are healthy, mounted ADC verification
  passed, and the real proxy initial/reconnect test reached the native
  authentication gate without submitting credentials. The running container
  image matches the rebuilt image. Log: `.tools/dev-local-sidestep-refresh.log`.
- HTTP inspection confirms the served bundle contains Sidestep staging and
  shared arrows. Single Hosting listener remains on port 5000; no prototype
  listeners on 5173/5174/5183. The database, saved matches, Hosting/proxy
  processes and 2 GiB / one AI mitigation were preserved.
- `git diff --check` passed. Self-review confirmed exact native IDs/destinations,
  correct owner metadata, narrow recovery compatibility, no invented client
  timeout actions or camera movement, and unchanged general push/follow-up
  behavior. Unrelated edits were preserved. No commits or pushes.

Ready for visual review at `http://localhost:5000/play`. Existing very narrow
portrait perspective scaling remains a camera limitation; phone arrow clicks
were verified in top-down view, and landscape/desktop in perspective.

## Remote-main condition-marker review and legacy Status correction

Reviewed incoming `a02d4ece8` (PR #362, issue #360) against branch base
`c666d4b14`. No actionable standards findings. The spec review found that
historical projections without `conditions` still hid Prone/Stunned posture
behind the single Distracted status. The owner approved correcting that gap.

The branch fallback now combines recognized posture with legacy distraction,
deduplicates the condition label, and preserves unknown-status fallbacks.
Regression tests cover standing/prone/stunned cards without condition metadata,
aliases, ordinary statuses, and replay/restored-live card rendering. A latest
change-list bugfix entry records the visible correction.

The isolated combined preview at `.tools/worktrees/status-markers-review/`
contains incoming marker code plus the existing branch changes and the corrected
modern `playerCardStatuses` implementation. Its explicit condition arrays remain
authoritative, including empty arrays; inferred legacy distraction is additive.
The modern fix is also captured in ignored
`.tools/status-marker-legacy-main-fix.patch` for subsequent integration.

The earlier `git apply --3way --check` result was insufficient to establish a
conflict-free merge: actual application in the isolated preview exposed a
changelog-only conflict. Both sets of entries were retained. The active branch
has not been merged, reset, committed, pushed, or published; its HEAD remains
`c666d4b14`. Dev-local was not refreshed for this correction.

Fresh checks after the correction:

- Current branch: 413 browser unit tests, browser production build/TypeScript,
  and `skill-markers-ui.mjs` passed, including the added legacy replay/recovery
  Status cases.
- Combined preview: 418 browser unit tests and browser production build passed.
- Combined preview browser suites passed: `negative-condition-markers-ui.mjs`,
  `skill-markers-ui.mjs`, `skill-prompts-ui.mjs`, `reactive-decisions-ui.mjs`,
  and `playback-ui.mjs`.
- Combined preview Maven test/build passed 45 focused tests across
  `NegativeConditionMarkersTest`, `LimitedActionTagsTest`, `ActionSourceTest`,
  `ReactiveDecisionAllowanceTest`, `ReactiveSkillDecisionTest`, and
  `OptionalRerollSkillUseTest` using the common/server reactor.
- The first current-branch browser attempt assumed the incoming `Status:`
  heading; the existing branch uses `Status`. The selector now accepts both
  headings and the regression passed again in both checkouts.
- `git diff --check` passed. Logs use the ignored `.tools/legacy-status-*`
  paths. The complete browser gate was not rerun for this bounded card fix;
  no local publication was performed.

## Combined dev-local refresh

The owner subsequently requested restarting services to incorporate the changes.
Dev-local now runs the combined preview, including PR #362 condition markers,
this branch's prompt changes, and the corrected legacy Status fallback.
The active branch remains at `c666d4b14`; no Git merge, commit, push, or remote
deployment was performed.

- Fresh complete browser gate passed all 64 suites (54 interaction, 10 hosted)
  in 616.0 seconds with two workers. Evidence:
  `.tools/worktrees/status-markers-review/.tools/validation/local-browser-YtBbF7/`.
- Fresh Docker native package/build passed 175 common and 670 server tests;
  four existing opt-in database checks were skipped. Image:
  `ffb-server:combined-dev-local`. Build log:
  `.tools/combined-dev-local-server-build.log`.
- Restarted only verified managed Hosting/proxy/AI processes and recreated the
  game-server container from the combined image. The database stayed running;
  its volumes, saved teams, and matches were retained. The 2 GiB heap and one-AI
  limit remain applied.
- Runtime ownership in shared `.git/dev-local-state.json` now points to the
  registered combined worktree `.tools/worktrees/status-markers-review/`.
  Hosting and the AI daemon use that source so browser, server, and computer
  clients agree on condition metadata. The preview remains an active runtime
  input, separate from the unmerged working branch. The image override and
  source/report provenance are recorded in the managed state.
- Hosting exceeded the first 20-second readiness window, then became healthy.
  Startup resumed from the remaining steps without another server/database
  restart. Local Hosting answered HTTP 200, mounted ADC validation passed, and
  real proxy authentication-gate checks passed on initial connection/reconnect.
- Served `game.js` matches the combined artifact by SHA-256 and contains the
  condition-marker setting. Two read-only authenticated loads of the previously
  affected match returned `ACCEPTED` at its current saved revision, including
  condition metadata on every projected player. No gameplay commands or manual
  database repairs were issued.
- One listener owner each on 5000 and 22232, no prototype listeners on
  5173/5174/5183, and the managed AI one-worker command were verified.
- Operational/verification logs use `.tools/combined-dev-local-*`. The initial
  Windows dependency binding lock cleared before the successful full gate.

Ready at `http://localhost:5000/play`; hard refresh to load the new browser bundle.

## Dev-local coach authentication recovery

The subsequently reported `AUTHENTICATION FAILED` was caused by an expired
mounted server ADC credential (`SESSION_EXPIRED`). The standard host ADC was
already valid. The existing `tools/match-review-start.mjs` recovery helper
copied that valid credential into the mount and restarted only the game server.
No interactive credential renewal or code change was required.

- Mounted Firebase ADC validation changed from `SESSION_EXPIRED` to `OK`.
- Reconnected the existing signed-in browser tab: the authentication error
  disappeared, saved teams loaded, and Create game / Refresh games became
  enabled. No game was created and no gameplay decision was submitted.
- Runtime verification passed for the combined served bundle, managed source
  ownership, expected server image, 2 GiB heap, and one AI worker.
- Recovery regression tests passed: `node --test
  tools/test/match-review-adc-check.test.mjs
  tools/test/match-review-start.test.mjs` (11 tests).
- Evidence remains in ignored `.tools/combined-dev-local-auth-recovery.log`
  and `.tools/dev-local-auth-recovered.png`.
