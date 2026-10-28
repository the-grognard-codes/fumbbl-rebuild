# Dice effects: implementation outcome

Date: 2026-10-28. Branch: `feature/dice-effects-preview`.
Base: main `0eabe30d2`. Parent: [#373](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/373).

## Delivery status

Round four was explicitly approved on 2026-10-28. The preview slice
[#374](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/374) and production
integration [#375](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/375) /
[#376](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/376) are implemented
locally. The user subsequently accepted the live-game result and authorized
commit, PR validation, merge into main, working-branch deletion and dev-local
shutdown. The pull request records the final CI and landing result.
Delivery evidence is recorded on [#375](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/375#issuecomment-6461158690),
[#376](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/376#issuecomment-6461158968)
and the [parent](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/373#issuecomment-6461159296).

## Production behavior and self-review

The actual coach/spectator pitch and completed replay now share the approved
round-four artwork and timing. The original PolygonDie geometry, tumble
keyframes, axes and easing are untouched. Its pitch duration is 620 ms, with an
outer 200 ms materialization and 200 ms evaporation. Each ordinary/important
group independently holds 2,400/4,800 ms, excluding fades, with 1,000 ms group
spacing. Replay rate scales every phase. Selectable dice persist until resolved;
their retiring visuals immediately lose input and accessibility exposure.

Native injury state, armorBroken and serious-injury names determine outcomes.
The injury stage shows the generic gurney; the determining casualty or serious
injury stage shows BH/MNG/NI/-1/skull. Modern stat-injury D16/D6 stages remain
ordered; legacy paired dice stay simultaneous. Decay and apothecary replacement
results use their own reported outcome. Skipped/outcome-only reports fabricate
neither rolls nor effects. Reduced motion, seek, skip and reconnect use static
symbols; snapshot inspection stays available until the next action.

Self-review caught and fixed the initial-board snapshot flag cancelling fresh
rolls, static replay reports bypassing outcome grouping, and a passive block
briefly duplicating when injury dice joined it. The retained block now keeps its
original DOM and tumble. Live screenshots at 1440/390 px were inspected; MUTP
font loading and centered casualty labels are verified. A user-facing Java
ChangeList improvement records the new browser presentation.

| Spec requirement | Acceptance evidence |
| --- | --- |
| 1: review before production | Four preserved preview rounds; explicit approval before integration |
| 2: native dice and selected motion | Source geometry/motion unchanged; live 200/620/200 ms assertions |
| 3: independent qualifying holds | Stream tests and ordered live expiration checks |
| 4: persistent choices | Choice remains after 10 seconds; removed choice becomes inert immediately |
| 5: adjacent, readable outcomes | Actual pitch screenshots and bounds at 1440/390 px |
| 6: correct outcome/stage | Native mapping, legacy pair and modern SI chronology tests |
| 7: separate replacement results | Apothecary/Decay tests and existing native decision browser suites |
| 8: approved animation and static accessibility | Exact round-four vector art, one-shot/loop CSS and all nine reduced-motion cases |
| 9: replay/recovery controls | Rate-4 phase assertions, static reconnect/seek plus cadence skip/background checks |
| 10: selected palette | All nine computed colors and actual font-bound text centering verified |

## Affected checks and evidence

| Area | Checks | Result |
| --- | --- | --- |
| Native outcome mapping/stage disclosure | `dice-outcomes.test.ts` | Passed |
| Independent hold/exit, pin/release, snapshots and rate | `dice-stream.test.ts` | Passed |
| Complete browser unit suite | `npm.cmd test` in `browser-client` | 433 passed, no skips |
| Production build/typecheck | `npm.cmd run build` in `browser-client` | Passed; existing chunk-size advisory |
| Live renderer, all nine symbols, label/color/layout, inert exits, replay/reconnect | `dice-ui.mjs`, including `dice-effects-checks.mjs` | Passed at 1440/390 px |
| Ordered playback, grouped numeric dice and retained choices | `playback-ui.mjs` | Passed |
| Cadence, prompt gating, native event order, replay/seek/skip/recovery | `cadence-ui.mjs` | Passed |
| Normal block and Blitz motion/choices | `movement-flow-ui.mjs` | Passed at the approved pitch duration |
| Provisional movement and native injury pair updates | `provisional-movement-ui.mjs`, `roundup-dice-hover-ui.mjs` | Passed |
| Built hosted replay, static inspection, log/chat and ordered groups | `node --test --test-name-pattern='completed replay keeps' site/test/m5e-result-browser.test.mjs` | Passed; verifies the explicit apothecary label and longer hold |
| Complete Java reactor | `tools/target-build.ps1 install -JavaHome .tools/jdk-21.0.11+10 -Offline` | Clean install passed: 1,152 passed, 11 configured skips |

Java checks use the repository's pinned runner. Native database/fixture-dependent
tests retain their configured skips; no failing tests were suppressed. Physical
Android/Linux execution was unavailable; responsive Chromium layouts and reduced
motion were exercised on Windows. Browser evidence is in
`.notes/dice-effects-live/`; command logs are `.notes/dice-effects-production-*.log`.
The test clock synchronizes real CSS animation age explicitly because fake
Date/timers do not advance the document animation timeline.

The required full browser gate passed via `node tools/dev-local.mjs --restart`:
all 66 registered suites (86 reported checks), zero failures or skips, in 359.5
seconds. Reports: `.tools/validation/local-browser-IPNhIw/`. The gate rebuilt the
current static site and play bundle, including TypeScript validation. The earlier
run caught old hosted replay label/hold assertions, which were corrected and
verified before this complete passing run.

## Manual-test handoff

At the implementation handoff, one managed dev-local instance was running at
**http://localhost:5000/play**.
`node tools/dev-local.mjs --restart` completed successfully. The game server and
database are healthy; Firebase ADC validation passed; the real Java V2 auth gate
was reached through nginx on initial connection and reconnect; the computer-player
service is ready. A final HTTP request to `/play` returned 200 with the client
root. The shared managed state is `.git/dev-local-state.json`.

The standalone preview process on 5182 was stopped. Final listener inspection
found no preview servers on 5173, 5174 or 5180-5189. Only this game's expected
Hosting/proxy/backend/database endpoints are listening (5000/22232/22234/23317).
The existing unrelated Kokoro container was preserved. All four preview source
rounds and their visual evidence remain available as files.

Manual game testing on `feature/dice-effects-preview` was accepted by the user.
The subsequent publication request includes stopping this dev-local instance
after merge. No remote deployment is requested. Physical Android/Linux testing
remains unverified as described above.

## Environment retrospective

Applied `.agents/skills/retro/SKILL.md` with the writing-for-agents guidance.
Two candidates would make future presentation work easier:

- Share a browser-test helper for fake timer and CSS timeline synchronization.
  This session initially sampled zero-opacity effects because only timers moved;
  the focused regression now explicitly seeks the actual CSS animations.
- Point Java build instructions at the pinned `target-build.ps1` runner. The
  top-level Java 8 note is easy to confuse with the locally required JDK 21
  build environment; the runner already documents and supplies the right path.

These are recommendations for later tooling/documentation work, outside this
feature. No agent policy or global environment files were changed.

## Preserved preview history

The stopped round-four review surface was
http://127.0.0.1:5182/pitch-preview?round=4.
Round three remains at `?round=3`.
Round two remains at `?round=2&variant=MUTP` (or `variant=RESULT`).
The original first round remains at `?round=1&variant=MUTP` (also the old URLs
without a `round` parameter).
Restart it with `npm.cmd run mockups:dice-effects` from `browser-client`.
Its README contains inspection instructions, palette sources and provenance.
All four source rounds and their evidence remain preserved. Historical pending
approval statements below describe those rounds at the time they were produced.

## Round-four revision

Retained the approved shoulder-pad design but restored the original narrower
split (+/-3 px, -5/+6 degrees). Restored the exact prior round-two wheeled gurney
geometry and kept the newer football player. The player now has upper/lower
body groups that hinge about the waist (14/-6 degrees at contact) and return
flat as the original placement/bounce settles. A Plop frame button exposes the
1,340 ms contact pose alongside the existing settled inspection view.

Entrance is 200 ms, another 75 ms above round three. Other selected timings
remain 620 ms tumble, 200 ms evaporation, 2,400/4,800 ms visibility and 1,000 ms
group spacing, with the same mixed palette and native source effects. Because
fade time is additional, ordinary removal spans 2,600-2,800 ms and emphasized
removal 5,000-5,200 ms. The full study loop is 8,900 ms.

Validation: strict prototype typecheck and
`node prototypes/dice-effects/round-four-checks.mjs` passed at 1440 and 390 px.
Checks cover fade progress/completion, restored split/wheels, hinged contact and
flat recovery, unchanged native keyframes at the selected pace, other phase/hold
timings, palette/centered labels, ordered reveal, looping/pause/static motion,
no overflow or page/asset errors, and all four route mappings. Ten earlier-round
source hashes match the pre-revision preservation manifest. `git diff --check`
passed; inspected pad and gurney contact/resting captures.

Evidence is in `.notes/art-preview/dice-effects-round-four/`: full sheets, native
pitch/case crops, contact/resting gurney poses, timing/sequence/static samples,
preservation manifest and `review-checks.json`. The dedicated review server was
restarted with all four rounds available. Production gameplay/build inputs remain
untouched; broader already-passing production checks were not repeated for this
isolated preview revision. Revised artwork/timing still await visual approval.

## Round-three revision

The user selected the native tumble, requested reference-inspired football
shoulder pads with a larger central split, a cloth-and-poles stretcher with no
wheels and a football-uniformed player, MUTP colors except specific casualty
types, and the earlier 0.5x pacing with another 25 ms entrance time.

Implemented in separate round-three files. The shoulder-pad silhouette has
curved shells, front lacing, straps and buckles; it references the supplied
photograph without reproducing branding. The split moves from +/-3 to +/-5 px.
The stretcher now has visibly sagging canvas between two carrying poles, no
wheels/legs, and a helmeted player with cleats. Centered result labels remain.

The new default is 125 ms entrance, 620 ms native tumble and 200 ms evaporation;
ordinary/emphasized visibility is 2,400/4,800 ms and groups arrive 1,000 ms apart.
Other outcome actions/pulses are doubled too. These wall-clock values reproduce
the selected 0.5x presentation, with the extra 25 ms applied only to entrance.
The review's 1x option now means this chosen baseline. Native source keyframes
and easing, and the approved evaporation geometry, remain unchanged.

MUTP blue/navy/yellow applies to armor, stun, KO and the generic stretcher.
Only BH/MNG/NI/stat/death use the prior result-specific palette. Palette/native
motion decisions are settled; the revised artwork and timing await approval.

Validation: dedicated strict prototype typechecking and
`node prototypes/dice-effects/round-three-checks.mjs` passed at 1440 and 390 px.
Checks cover 125/620/200 ms phases, normal/emphasized retention, 1,000 ms cadence,
exact native source effects driven at half speed, the selected color values,
increased pad separation, wheel-free stretcher/cleats, centered labels, result
reveal order, looping/pause, reduced motion, no overflow and no page/asset errors.
All seven earlier-round source files match their pre-revision SHA-256 hashes;
all three review routes respond correctly. `git diff --check` passed.

Evidence: `.notes/art-preview/dice-effects-round-three/`, including a full sheet,
native pitch captures, pad/stretcher/BH/death closeups, sequence/evaporation/static
samples, preservation manifest and `review-checks.json`. Inspected the pad,
canvas stretcher, centered label and mobile pitch captures. The manual review
server was restarted on port 5182 with all three rounds available. No production
source/build inputs changed, so the prior passing production suites were not
repeated. Physical Android/Linux verification remains outstanding.

## Round-two revision

The user approved evaporation and outcome placement/choreography. They requested
the original production polygon tumble with only the entrance fade applied,
fantasy-football equipment for the symbols, centered casualty labels, and the
first study's dice preserved as an alternative. Those revisions are implemented
in separate round-two source files; the original three source files and image
captures remain intact. Their pre-revision SHA-256 hashes were checked.

- Native dice: the unchanged real PolygonDie creates the body/lift effects. A
  review-only clock adapter copies those exact effects onto the same targets for
  scrubbing/looping. There is no added translation/rotation wrapper in native mode.
- Motion comparison: original without fade, original plus 50 ms fade, and the
  preserved first-study motion share the same inspection clock. Either dice
  motion is selectable for the revised pitch/catalogue.
- Art: sundering chainmail with linked-ring texture, helmeted gridiron players
  with face cages, studded shoulder pads and jersey laces, football kit on the
  stretcher, and a helmeted death skull. Existing action/pulse/star choreography
  and approved evaporation reuse the unchanged original CSS.
- Typography: BH/MNG/NI/-1 are centered from actual font bounds after loading.

Round-two checks passed at 1440 and 390 px in both palettes: native source effects
match the review effects exactly (64 captured body/lift effects per viewport),
faded/unfaded native poses match, result-label centers are within 0.4 px in both
axes at native/enlarged sizes, ordinary die shapes remain available, entrance and
exit timing/reveal order/one-shot holds/pulses/static motion/loop/keyboard/layout
checks pass, and page/asset errors are absent. Dedicated strict preview typecheck
and the preserved round-one browser checks passed again. Production source and
build inputs are unchanged, so the already passing production suites below were
not repeated for this isolated art revision.

Commands: `npm.cmd exec -- tsc --project prototypes/dice-effects/tsconfig.json`,
`node prototypes/dice-effects/round-two-checks.mjs`, and
`node prototypes/dice-effects/review-checks.mjs`, from `browser-client`.

Evidence: `.notes/art-preview/dice-effects-round-two/`, including both palette
sheets, native pitch crops, chainmail/helmet closeups, a 150 ms comparison,
evaporation/sequence/static captures, preservation hashes and `review-checks.json`.
Inspected desktop chainmail, helmet, comparison and narrow pitch captures. The
dedicated review server was restarted on port 5182 with both rounds available.
Production integration still waits for explicit revised-art/motion approval.

## Design-to-result review

| Requirement | Preview result / remaining production work |
| --- | --- |
| 50 ms directional arrival, existing die family | Existing PolygonDie geometry/art, alternating approach direction and two-axis tumble; entrance inspectable at 25 ms. Production lifecycle waits for approval. |
| 100 ms evaporative exit | Upward blur/dissolution and six small rising fragments, inspectable at midpoint; zero opacity after exit. |
| Nine outcome motifs | Armor breaking; swirling stun stars; bonk; player placed on stretcher; BH, MNG, NI, -1 and skull. |
| Two palette groups | MUTP light blue/navy/yellow with menu shading; result-specific accents. Same shape and typography; palette choice remains pending. |
| Actual and enlarged context | Projected approved turf, existing human/orc sprites, native 44 px die containers and 48 px outcome art; identical art at 2.7x inspection scale. |
| Extended visibility and ordered stages | Authored 1,200/2,400 ms examples, independent 500 ms offsets and additional fades; serious result withheld until its determining stage. Native report mapping is deferred. |
| Action motifs versus looping symbols | Armor/bonk/stretcher play once and hold; stars swirl and result text/skull pulse gently. Full study repeats every 4,400 ms. |
| Small-screen readability | 390 px layout has no page overflow; enlarged graphics wrap beneath dice without shrinking native artwork. |
| Accessibility | OS reduced motion forces a static inspection sheet with no CSS animations; keyboard palette switching preserves input navigation. |
| Live, replay and recovery | Existing production dice/playback browser checks pass. This prototype makes no gameplay changes; future production timing, result mapping, skip/seek/recovery behavior still requires its own integration and tests. |
| Release notes / final dev-local | Deferred to production changes. Temporary automated review servers were closed. A fresh dedicated preview server is available for animation approval; a new game dev-local stack will follow completed production coding. |

## Self-review

Reviewed the new files against #374, the agreed design and repository workflow.
No production source, authoritative result handling, game protocol, Java source,
existing art, dependencies or application route was changed. The only existing
file change is a package script for the isolated preview.

Fixed findings before handoff:

- Ignore transient zero-width ResizeObserver measurements before constructing
  a pitch camera; this avoids a loading-time viewport exception.
- Preserve native artwork dimensions in enlarged samples; wrap and reserve
  sufficient height instead of clipping the two-dice/outcome combination.
- Give the outcome selector an explicit accessible name for reliable inspection.
- Include prototype sources in a dedicated strict TypeScript check because the
  normal browser build intentionally excludes prototype directories.

No additional unresolved preview-code findings remain. Visual quality/palette
selection requires the user's review, rather than an automated acceptance claim.

## First-round base validation evidence

Commands below ran on Windows. Browser commands ran from `browser-client`.

| Command | Result |
| --- | --- |
| `npm.cmd exec -- tsc --project prototypes/dice-effects/tsconfig.json` | Passed, including preview TSX and imported production components. |
| `node prototypes/dice-effects/review-checks.mjs` | Passed both palettes at 1440x1000 and 390x1000: all nine motifs, entrance/exit opacity, post-settle reveal, one-shot final pose, gentle pulse, ordinary four-shape dice, serious-injury reveal order, no overflow, reduced motion, pause/restart/loop wrap, keyboard/URL persistence, no asset/page errors. |
| `npm.cmd test` | 424 passed; zero failures/skips. Includes dice-stream, pitch-playback and recovery unit coverage. |
| `npm.cmd run build` | Passed; existing large-chunk advisory only. No preview route/art included in production entry points. |
| `node test/dice-ui.mjs` | Passed native D6/D8/D16/block faces, landing orientations/motion/continuity, keyboard/focus/viewport, both coaches, spectator and replay. |
| `node test/playback-ui.mjs` | Passed independent armor/injury lifetimes, dependent input, ordered moves, stale-timer-safe seek, current reconnect snapshot, reduced motion and missing-transcript prompts. |
| `tools/target-build.ps1 test -JavaHome .tools/jdk-21.0.11+10 -Module ffb-server -Offline` | Passed outside the sandbox after directory-resolution restrictions were identified: 175 common tests passed; 674 server cases reported, 670 passed and four existing opt-in cases skipped. No failures/errors. |
| `git diff --check` | Passed. |

Browser suites used the installed Playwright Chromium and separate Vite caches.
All automated browser/server instances were closed after their runs. The final
manual animation review server is newly started on loopback port 5182.

Screenshots and machine-readable preview checks are under
`.notes/art-preview/dice-effects/`: the two desktop/mobile palette sheets,
native pitch crops, evaporation frames, ordered sequence and reduced-motion
samples, plus `review-checks.json`. Desktop and 390 px captures were inspected.
Ignored command logs are `.notes/dice-effects-{unit,build,dice-ui,playback-ui,server-target}.log`.

Initial Java invocations exposed environment issues, not preview behavior: the
default Maven cache was unwritable; Java 8 could not load cached Java 21 tests;
the sandbox then prevented ClassGraph from resolving the server directory.
The repository's pinned target runner and an authorized outside-sandbox rerun
resolved these and produced the passing result above.

Not verified: physical Android or Linux browsers; a full clean multi-module
install; production integration and new gameplay behavior (not implemented yet).
The four server skips are Marker6SchemaTest, SkillUsePreferenceSchemaIntegrationTest,
RecoveryJournalMariaDbTest and V2PreparationJdbcTest opt-in database cases.

## Workflow retrospective

The delivery workflow requests a short environment retrospective. The applicable
retro and writing-for-agents guidance was reviewed; no instruction files were
changed. Two concrete follow-ups would reduce repeated environment failures:

- Point the Java build guidance to `tools/target-build.ps1`: the root Java-8
  instructions do not describe the pinned Java-21 validation toolchain or its
  workspace Maven cache.
- Repair the host WinGet `rg.exe` shim separately. It cannot launch in this
  session; `git grep`/`git ls-files` supplied the needed repository searches.

## Next decision

Review the fourth-round artwork and selected timing (or request revisions)
and explicitly approve them. Native tumble and the mixed palette are selected.
Then start #375 and #376,
including the release-note entry, production regressions and fresh dev-local
handoff. No staging, commit, push, PR, merge or deployment was performed.
