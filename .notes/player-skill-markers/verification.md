# Player skill marker manifest verification

Date: 2026-10-17. Branch: `feature/player-skill-markers`. Checkpoint: full 108-marker text-pack review following approval of round 2. Changes include review documents, sample and complete text assets, separate local browser previews, shared menu/preferences for the requested trait filter, tests, a change-list entry, and [GitHub issue #293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293). Production pitch marker integration is pending; game mechanics are unchanged. No commit or push was made.

## Checks performed

| Check | Result | Evidence |
| --- | --- | --- |
| Initial working tree | Clean | `git status --short` returned no entries before branch creation or edits. |
| Local branch | Passed | `git switch -c feature/player-skill-markers`, then `git branch --show-current`. Branch creation required sandbox escalation for the Git ref write. |
| Common-module classes at initial gathering | Passed; reused | `mvn -o -pl ffb-common -am -DskipTests compile` with the installed Temurin 21 JDK. Maven reported BUILD SUCCESS and classes up to date. This was a compile check, not a test run. No application source changed during the scope revision, so it was not repeated. |
| Runtime BB2025 selection at initial gathering | Passed; reused | A temporary Java extractor called `new Scanner<Skill>(Skill.class).getSubclassInstances(options)` with `GameOptionId.RULESVERSION` set to `BB2025`, using the compiled common-module classes. All 108 core identities resolve in this wider native catalog. |
| Core catalog coverage | Passed | All 108 definitions in `SkillDefinitions.java` matched a selected native name and category: 12 per each of six skill categories and 36 traits. |
| Exact core allowlist | Passed | Revised manifest IDs, names, categories, and Elite flags match `SkillDefinitions.java` exactly. All entries have section `core`; no star-ability, stat-change, or named-effect marker remains. |
| Core-trait parameter examples | Reused | Previously inspected official supplementary star-player cards corroborate Loner thresholds and Bloodlust. Star-specific abilities are excluded from both marker packs; their roster eligibility is no longer a manifest review dependency. |
| Proposed marker inventory | Passed | `manifest.json` has 108 unique IDs: 72 category skills and 36 traits. It has seven palette categories, covering those six skill categories and black core traits. |
| Abbreviation format | Passed | Every proposed label matches `[A-Z]{1,3}` and has no number. |
| Abbreviation collisions | Passed | All 108 labels are distinct, including case-insensitive comparison. There are no shared-label exceptions. |
| Source links | Passed | Every manifest entry resolves to an existing native source file. Local Markdown links were checked after all review documents were written. |
| Proposed palette contrast | Passed for solid fills | Calculated sRGB relative-luminance ratios shown below. Actual pitch appearance awaits artwork samples. |
| Documentation consistency | Passed | Read back the generated tables and specification; checked counts, agreed defaults, letter-only labels, review gates, and exclusions. |
| Whitespace | Passed | `git diff --no-index --check -- NUL <path>` for each new review document/data file, plus `git diff --check`. |
| GitHub authentication and duplicate lookup | Passed | Desktop-keyring access succeeded outside the sandbox. `gh auth status --hostname github.com`, `gh issue list --state all --search '"skill markers"' --limit 30 --json number,title,state,url`, and `gh label list --limit 100 --json name` succeeded; the issue search returned no existing match. |
| GitHub feature issue | Passed | Created #293 with `gh issue create --title 'Player skill markers for the 108 core BB2025 skills and traits' --body-file '.notes/player-skill-markers/feature-spec.md' --label enhancement --label needs-triage`. Updated its body from the mirrored spec after recording the issue URL; read back the open issue and labels. |

## Palette calculations

Ratios compare the proposed text ink against a solid card fill. They do not validate antialiasing, final lettering, icon legibility, or pitch overlap.

| Category | Text contrast |
| --- | --- |
| General | 11.43:1 |
| Agility | 14.03:1 |
| Strength | 6.23:1 |
| Mutation | 7.23:1 |
| Passing | 8.86:1 |
| Devious | 8.91:1 |
| Core traits | 14.91:1 |

## Native extraction method

The temporary extractor used the same rules-aware `Scanner` path as `SkillFactory.initialize`. It collected name, category, selected class, negative-trait flag, default value, value evaluator type, and usage type. The revised [manifest.json](manifest.json) retains these fields only for identities in the curated 108-entry core allowlist. It did not use a directory listing as a proxy for ruleset selection, modify a live game, or invoke skill behavior.

The extractor was compiled and run with Temurin 21 against `ffb-common/target/classes`, `classgraph-4.8.98.jar`, and `minimal-json-0.9.5.jar`. Execution succeeded after sandbox read restrictions on Java classpath traversal were handled. The source and intermediate downloaded references remained in the task's temporary directory.

The revised document validation used Python's standard library to compare the manifest directly against all 108 core definitions, verify selected native metadata and source-file existence, check exact counts and label uniqueness, confirm excluded marker sections were removed, and check Markdown table rows and local links. Solid-fill text contrast was recalculated for the seven retained categories.

## Deferred implementation validation

Feature-specific engine tests, game-server builds, native platform/theme checks, and live-play/replay/recovery regression runs are required after the corresponding feature implementation. This isolated artwork preview passed the existing browser unit suite, was typechecked, and was exercised by the browser capture driver described below; it does not replace those implementation checks.

Source inspection established that the current browser player payload exposes skill names without the structured metadata required by the agreed filters. Temporary core-skill provenance and unique star-ability identities must be preserved for the appropriate pitch/profile presentation. The implementation checks must confirm that unique star abilities remain visible on profile-card click/hover while the pitch marker list is restricted to the 108 core identities, including after reconnect and replay.

## Text sample round

The owner authorized a first text-only batch and in-game mockups. The [sample review](text-round-1/README.md) contains 14 core identities across all seven colors, outlined MUTP lettering, transparent SVG/PNG assets, and nine final images showing three sizes, open/crowded spacing, a hover list, and touch interaction.

Commands run after the final preview changes:

- `python .notes/player-skill-markers/text-round-1/generate-samples.py` generated 14 SVGs from the existing font and manifest.
- `node node_modules/typescript/bin/tsc --noEmit` in `browser-client` passed.
- `npm.cmd test` in `browser-client` passed all 301 existing browser unit tests; [output](text-round-1/browser-unit-test.log).
- `node browser-client/test/skill-marker-text-review.mjs` passed: 56 PNG dimensions/alpha checks, 12 real player sprites, three-badge overflow, complete hover list, Android landscape touch layout and player-card opening, no browser runtime errors, and no failed asset responses.
- SVG/sample inventory, current manifest coverage, local links, and whitespace checks passed. The nine final captures were visually inspected.

[capture-report.json](text-round-1/capture-report.json) records the successful capture run and its limits. Windows Chrome was used; Android was emulated, and native Android/Linux have not been run. Three-letter Small labels are harder to read, and the crowded capture exposes badge/sprite overlap requiring later placement work. The fixture's Mutation and Animosity specimens use Orc art as a typography stand-in, not a legality assertion.

The first round remains archived for comparison. The owner subsequently requested a Big Guy filter and readability improvements; those are covered by round 2 below.

## Second text sample and trait filter

[Round 2](text-round-2/README.md) contains 19 core sample identities, 76 transparent PNGs, 12 review images, taller three-letter lettering, wider three-letter portrait frames, and projected scaling with a 14 px/20 px readability floor. All first-round images and preview sources remain intact.

The shared Game Menu has a Skills & Traits tab with Show traits and Show Big Guy negatraits and Secret Weapon. The additional toggle uses exactly the six requested IDs, preserves Loner and unrelated traits, and persists independently of the master switch. The second preview consumes this same preference/filter implementation. Other production marker controls and pitch integration remain pending visual approval.

Checks performed after this change:

- Seven focused Node tests passed for the exact filter, Loner exception, master switch, independent persistence, migration/defaults, denied storage, zoom geometry, and three-letter readability floor.
- `npm.cmd test` passed all **308** browser unit tests: [log](text-round-2/browser-unit-test.log).
- `npm.cmd run build` passed TypeScript and production bundling, with Vite's bundle-size warning: [log](text-round-2/browser-build.log).
- `node browser-client/test/skill-marker-text-review-v2.mjs` passed: exact six-trait suppression, Loner and player-card preservation, reload persistence, master-switch independence, measurable zoom growth, PNG dimensions/alpha, touch cards, and zero runtime/asset errors: [report](text-round-2/capture-report.json).
- `node browser-client/test/game-menu-events-ui.mjs` passed the six-tab/four-viewport menu checks, including the new tab: [log](text-round-2/menu-ui.log).
- `node browser-client/test/reconnect-ui.mjs`, `pending-recovery-ui.mjs`, and `playback-ui.mjs` passed reconnect, uncertain-action retry, and live/replay playback checks: [reconnect](text-round-2/reconnect-ui.log), [pending recovery](text-round-2/pending-recovery-ui.log), [playback](text-round-2/playback-ui.log).
- `mvn -o -pl 'ffb-server,ffb-client-logic' -am test` passed: common 175 tests, server 416 with two opt-in MariaDB tests skipped, client logic 23; zero failures/errors. [Successful log](text-round-2/maven-test-unsandboxed.log). The initial sandboxed run failed with ClassGraph filesystem access denial; the identical rerun outside the sandbox passed.

The two skipped database cases are `Marker6SchemaTest.verifiesOptInMarkerSixMariaDbTargetReadOnly` and `V2PreparationJdbcTest.createsJoinsRetriesReleasesAndExpiresInvitationsOnIsolatedMarker6Target`. Native Android/Linux and end-to-end retained-match validation are not claimed. Source/inventory/link checks and visual inspection are recorded with the round 2 artifacts.

The owner approved round 2 and authorized all remaining text markers. The next checkpoint is review of the complete text pack below.

## Complete text pack

The [complete text pack](text-full/README.md) extends the approved design to all 108 core identities. All 19 round-2 sample SVGs match byte for byte; 89 additional markers complete the pack. The archived sample assets, app rendering, settings, mechanics, live-play, replay, and recovery code were not changed in this artwork step.

Commands and checks:

- `python .notes/player-skill-markers/text-full/generate-pack.py` generated 108 self-contained SVGs, the asset-path inventory, and searchable HTML gallery from the exact manifest and existing MUTP font.
- `node browser-client/test/skill-marker-text-pack-review.mjs` passed: exact identity/name/category/shorthand agreement with all 108 manifest entries, 108 unique letter-only labels, seven category counts, 19 unchanged approved samples, 432 nonblank transparent PNGs at the expected dimensions, self-contained SVG paths, search/category filtering, and responsive layouts at 1600, 915, and 390 px. No browser runtime errors or failed asset requests occurred. See [report](text-full/validation-report.json) and [per-file dimensions/checksums](text-full/export-index.json).
- Generated eight sheets (full inventory and seven categories); all seven category sheets were visually inspected for label clipping, frame consistency, colors, and native-size specimens.
- The first capture attempt using a repository-root Vite server stalled before loading the gallery. The static artwork gallery now uses a small loopback-only file server restricted to the review directory and its existing MUTP font. The completed capture run passed without Vite or application changes.
- The downloadable ZIP was checked for exact inclusion of all SVG and PNG exports, metadata, and README. Local links and `git diff --check` passed.

This was an artwork-only change, so the already-passing 308 browser unit tests, browser build, menu/playback/recovery checks, and Maven suite above were not rerun. No game behavior or application source changed. Windows Chrome rendered the exports and responsive gallery; native Android/Linux remain later integration checks. The owner subsequently authorized illustrated candidates, recorded below. No commit or push was made.

## Debug shutdown and first illustrated candidates

The owner requested stopping the debug environment before their redeployment. The three review-server sessions on 5177/5178/5179 were interrupted. `node tools/dev-local.mjs --stop` stopped managed hosting, computer-player processes, proxy, and the review server/database containers, retaining database volumes. Readback confirmed both containers were `exited` and the relevant service ports were free. No redeployment or debug restart was performed.

The [first illustrated round](illustrated-round-1/README.md) contains nine original candidates spanning all seven colors. Generation and targeted cleanup used the built-in image_gen tool; prompt sets and chosen source paths are saved alongside the images. Secret Weapon uses a concealed weapon rather than a chainsaw to reserve the latter for the separate Chainsaw identity. Numeric illustrated variants remain pending art review.

`node browser-client/test/skill-marker-illustrated-review.mjs` passed after the final symbol selection: nine exact core identities, 36 normalized PNGs with expected dimensions and transparent corners, no substantial interior alpha holes, eleven review images, twelve player sprites, overflow, complete player card, zoom growth, Big Guy filtering retaining Loner, Android touch layout/card, and a narrow standalone gallery. No browser runtime errors or failed asset requests. See [report](illustrated-round-1/capture-report.json).

The early generated backgrounds contained alpha artifacts, caught by the panel check and corrected with opaque generation masters and standard frame-clipped exports. Export validation accepts near-opaque generated alpha (250–255); interior-hole checks reject alpha below 240. The final source selection passed. Candidate board, specimen sheet, Small/Medium/crowded pitch, and touch images were visually inspected. `node --check browser-client/test/skill-marker-illustrated-review.mjs`, document links, and `git diff --check` passed.

The isolated preview reuses existing game rendering and sprites without changing production application, server, live-play, replay, or recovery source. Prior unit/build/recovery/playback/Maven checks above were not repeated. Windows Chrome and emulated Android were checked; native Android/Linux and production marker integration remain future work. Capture servers close after the checks, leaving the requested debug environment stopped. Owner review is the next illustrated-art checkpoint.

## Illustrated readability revision

The owner approved a 20px illustrated minimum, deeper category panels, and simpler symbols. [Illustrated round 2](illustrated-round-2/README.md) revises the same nine identities, preserving the original illustrated and complete text assets. The six colored categories have deeper hue-matched targets; traits remain black. Rivets, small motion lines, lace detail, teammates, facemask bars, and cloth creases were reduced. The before/after gallery compares each round at equal large size and at 20px.

The shared sizing helper now accepts `style: 'text' | 'illustrated'`, defaulting to text for existing callers. Illustrated markers retain a 20px minimum and 72:96 frame ratio at every size/zoom; text sizing remains unchanged. The second isolated preview uses the illustrated path. Production pitch marker integration is still pending.

Checks run after the final source selection:

- `node --experimental-strip-types --test browser-client/test/skill-marker-presentation.test.ts`: five focused tests passed, including all sizes/zooms at the illustrated floor, proportional growth, existing text geometry, and the Loner filter exception.
- `node browser-client/test/skill-marker-illustrated-review.mjs --round=2`: passed nine core identities, seven categories, 36 PNG dimensions/alpha/panel checks, eleven screenshots, all visible illustrated markers at least 20px at each settled pitch view, overflow, full player card, zoom growth, the six-trait filter preserving Loner, touch card, and 390px gallery layout. Zero browser runtime or missing-asset errors. [Report](illustrated-round-2/capture-report.json).
- `npm.cmd test`: **309 passed**, zero failures/skips. [Log](illustrated-round-2/browser-unit-test.log).
- `npm.cmd run build`: TypeScript and production build passed with the existing Vite bundle-size warning. [Log](illustrated-round-2/browser-build.log).
- `node browser-client/test/reconnect-ui.mjs`: reconnect clears stale authentication errors. [Log](illustrated-round-2/reconnect-ui.log).
- `node browser-client/test/pending-recovery-ui.mjs`: ordinary actions avoid recovery popups; uncertain outcomes retain exact retry. [Log](illustrated-round-2/pending-recovery-ui.log).
- `node browser-client/test/playback-ui.mjs`: authoritative dice, nonblocking animation, ordered moves, seek timer safety, reconnect snapshots, reduced motion, and required prompts passed. [Log](illustrated-round-2/playback-ui.log).
- `mvn -o -pl 'ffb-server,ffb-client-logic' -am test`: **BUILD SUCCESS** with installed Temurin 21 and filesystem access for ClassGraph. Common 175, server 416 (two opt-in MariaDB tests skipped), client logic 23: **614 discovered**, zero failures/errors. [Log](illustrated-round-2/maven-test.log).

Mighty Blow's first edited source had an interior alpha artifact, caught by the panel check; an opaque generation master repaired it before the final capture run. Built-in image_gen prompts and source selection are saved with the round. Candidate board, overview and Android-emulation images were visually inspected. Text-pack export checksums, review links, script syntax and whitespace were checked. Native Android/Linux were not run. Temporary capture/validation servers close after completion; the managed debug stack was not restarted or stopped again. Unrelated playback and other working-tree edits were preserved. Owner review of the revised batch is the next checkpoint; no commit or push was made.

## Complete illustrated pack and directed revisions

The owner accepted the revised size/colors, directed Secret Weapon toward wild machinery, removed Dodge's incoming shin/ankle arrow, requested some gore on Claws, retained Dirty Player subject to a distinct Put the Boot In, and authorized the full illustrated batch. [The completed pack](illustrated-full/README.md) covers the same 108-core manifest: six approved source reuses, three revised identities, and 99 newly illustrated identities. Built-in image_gen was used for each new subject or revision; source images and individual prompt records are saved. Dodge's removed-arrow area required one opaque-master repair to avoid an interior alpha artifact.

Secret Weapon is a spiked steam roller, distinct from Shadowing footprints, Stab's dagger, hand-held Chainsaw, and Bombardier's tossed bomb. Claws has crimson on the tips and a drop. Put the Boot In has two converging boots, distinct from Dirty Player's single stomp over a prone helmet. No star ability, stat change, named effect or numeric variant was added.

Commands/checks run for this step:

- `python .notes/player-skill-markers/illustrated-full/build-review.py`: exact 108-entry identity/name/category/shorthand inventory, searchable gallery, requested-art comparison, and isolated pitch preview generated.
- `node browser-client/test/skill-marker-illustrated-review.mjs --full`: passed all 108 identities, category counts of 12 per skill category and 36 traits, six approved source hashes, 432 PNG dimension/alpha/panel checks, gallery search/category filters, 390/915px layouts, and 19 screenshots. Every settled pitch view retains the 20px illustrated minimum; Medium measured 20px in overview and 28.125px in detail. Overflow, complete player cards, Big Guy filtering retaining Loner, and touch cards passed. Browser runtime errors and failed asset responses: zero. [Report](illustrated-full/capture-report.json).
- All seven category sheets were visually inspected, along with the directed-art comparison, Medium pitch and Android-emulation images.
- `python .notes/player-skill-markers/illustrated-full/package.py`: ZIP verified with 437 entries, including all 432 PNGs and metadata; every image matches its SHA-256 index. All 540 approved text exports still match their stored hashes. [Export index](illustrated-full/export-index.json).
- `node --experimental-strip-types --test browser-client/test/skill-marker-presentation.test.ts`: five focused tests passed for sizing/text preservation, trait controls and the illustrated floor.
- Script syntax, local review-document links, and `git diff --check` passed.

No production application, server, replay or recovery code changed in this artwork-only step. The prior 309 browser tests, production build, reconnect/recovery/playback checks and Maven results above were retained rather than repeated. Windows Chrome and Android emulation were used; native Android/Linux are not claimed. Temporary capture servers close on completion. The managed debug stack was not restarted or stopped again, and unrelated working-tree edits were preserved. Full illustrated-pack visual review is the next checkpoint before production integration. No commit or push was made.

## Eye Gouge correction

The owner accepted the illustrated art except Eye Gouge and requested removing its ambiguous detached-fingertip appearance. The built-in image_gen tool revised it into a single connected gauntlet with a visible palm, thumb, and angular segmented fingers targeting an eye. [Prompt](illustrated-full/prompts/eye-gouge-v2.json). The original source remains archived, and the inventory selects the new opaque master.

`python .notes/player-skill-markers/illustrated-full/build-review.py` and `node browser-client/test/skill-marker-illustrated-review.mjs --full` passed, refreshing all 19 review images and checking coverage, all 432 dimensions/alpha/panels, 20px floor, zoom, filters/Loner, overflow, player-card information, gallery layout and touch interaction. Runtime/missing-asset errors: zero. The revised 216x288 master was visually inspected.

The prior export index was retained and compared with the new index: exactly Eye Gouge's four PNG exports changed; the other **428 illustrated exports are byte-for-byte unchanged**. `python .notes/player-skill-markers/illustrated-full/package.py` rebuilt and verified the 437-file ZIP and all 432 image checksums; all 540 text exports remain unchanged. Broad application/server suites were not repeated for this single artwork correction. No production code, debug environment, commit or push changed.

## Production implementation — 2026-10-17

The owner accepted the corrected artwork and authorized the remaining implementation. All settings and both packs now feed the real pitch. Server metadata adds authoritative BB2025 core identity/category/origin and full parameterized card descriptions. New replays persist these facts; older projections remain readable, and older recoverable checkpoints are accepted without requiring the added field. The renderer uses the same preferences in live play, replay and recovered snapshots. Crowded strips reduce capacity from a maximum of three, preserving minimum readable size and exact overflow counts. Native mechanics and action sequencing were not changed.

Affected-test manifest: preference defaults/migration/storage denial; 108-core allowlist and 216 approved image checksums; strict public projection decoding/recipient fields; native base/acquired origin and numeric values; temporary gain/expiration/deduplication; spent-skill persistence; negative-trait ordering; six-trait filtering preserving Loner; coach versus neutral team gates; readable scaling and crowded overflow; complete profile cards; touch inspection; live/replay/recovery snapshots and stale-timer safety; existing setup drag/ground intents and ball scaling.

Commands run from the repository root unless the browser-client working directory is specified:

| Check | Result / evidence |
| --- | --- |
| `npm.cmd test` in `browser-client` | **316 passed**, no failures/skips. [Log](implementation-unit.log). |
| `npm.cmd run assets:check` in `browser-client` | **30 passed**; integrity, geometry, repeat-build repair and sync checks passed. The initial run checked 429 delivered files. [Log](implementation-assets-check.log). |
| `node assets/game/scripts/sync-browser-assets.mjs --check` | Final **430 delivered files** checked after adding the canonical approved SHA-256 inventory. |
| `node --experimental-strip-types --test browser-client/test/skill-marker-assets.test.ts` | Approved canonical/public bytes and exact 108 identity coverage passed after moving checksum expectations out of the review directory. |
| `npm.cmd run build` in `browser-client` | TypeScript + production build passed. Existing large-chunk warning only. [Log](implementation-browser-build.log). |
| `npm.cmd run build:play` in `browser-client` | TypeScript + deployed game entry build passed. [Log](implementation-play-build.log). |
| `npx.cmd --no-install tsc --noEmit` in `browser-client` | Final local-compiler type check passed. |
| `node browser-client/test/skill-markers-ui.mjs` | All controls/defaults/persistence, dense pitch, responsive menu, illustrated 20px floor, zoom, full star card, backward/forward replay seeks, restored live snapshot, no gameplay submissions, zero missing marker images/runtime errors, Android emulation touch card passed. [Log](implementation-marker-ui.log), [captures](implementation-review). |
| `node browser-client/test/game-menu-events-ui.mjs` | Six tabs at four viewports, MUTP colors/fonts, scrolling, focus containment/restoration, log settings and independent game decisions passed. [Log](implementation-game-menu-events-ui.log). |
| `node browser-client/test/projected-pitch-ui.mjs` | Both coach ends, 48 stadium/camera cases, canonical ground/player intents, anchors, pan/zoom, ball/kickoff and missing-art fallback passed. [Log](implementation-projected-pitch-ui.log). |
| `node browser-client/test/setup-drag-ui.mjs` | Setup drag/drop, both coaches, keyboard placement, responsive fit, required choices and Solid Defence passed. [Log](implementation-setup-drag-ui.log). |
| `node browser-client/test/ball-zoom-ui.mjs` | Football/shadow scaling at .75×–3×, both ends and four angles passed. [Log](implementation-ball-zoom-ui.log). |
| `node browser-client/test/playback-ui.mjs` | Authoritative dice, nonblocking animation, ordered moves, safe seeks, reconnect snapshots, reduced motion and missing-transcript prompts passed. Existing unrelated playback edits were preserved. [Log](implementation-playback-ui.log). |
| `node browser-client/test/pending-recovery-ui.mjs` | Actual socket snapshots now include marker metadata: accepted changes remove expired markers, exact uncertain-outcome retries restore the current markers, and ordinary requests retain their original behavior. [Log](implementation-pending-recovery.log). |
| `node browser-client/test/reconnect-ui.mjs` | Play/builder authentication error recovery passed. [Log](implementation-reconnect-ui.log). |
| `mvn -o -pl ffb-server,ffb-statetest -am test -Dtest=SkillMarkerProjectionTest,RecipientProjectionTest -Dsurefire.failIfNoSpecifiedTests=false` | **4 marker tests + 1 native recipient contract passed**. Covers all 108 identities, unique star detail-only behavior, base/acquired classification, Loner numeric detail, temporary gains/removal, spent skills, new/legacy recovery, and the changed public field allowlist. [Log](implementation-focused-maven.log). |
| `mvn -o -pl ffb-server,ffb-client-logic -am package` | **BUILD SUCCESS**. Common 175, server 420 (2 existing opt-in MariaDB skips), client logic 23: **618 discovered, 616 executed and passed**, no failures/errors. Server and client-logic artifacts packaged. [Log](implementation-maven-package.log). |
| Browser suite inventory loader; `git diff --check` | Passed. New marker UI suite is registered in interaction shard 3. |

Maven used JDK 21 at `C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot`. The initial sandboxed Maven attempt could not resolve the local Java classpath; repeating with normal dependency access succeeded. The two skipped opt-in database checks are `Marker6SchemaTest.verifiesOptInMarkerSixMariaDbTargetReadOnly` and `V2PreparationJdbcTest.createsJoinsRetriesReleasesAndExpiresInvitationsOnIsolatedMarker6Target`.

Debug feedback: the first dense capture exposed strip collisions, resolved by reducing capacity instead of shrinking badges. The Android touch test reproduced a missing card because player selection cleared the card timer after the click scheduled it; card scheduling now occurs after selection, and touch pointer exit does not cancel it. The original complete marker UI loop passes with this fix. One recovery assertion initially inspected the old decorative pitch during its React update; it now waits for the authoritative marker replacement. No debug instrumentation remains.

Windows Chrome and Android browser emulation were exercised; native Android hardware and Linux browser execution were not available and remain manual checks. Earlier recording formats without the new metadata retain skill text without guessed badges. The feature stays browser/BB2025-only. No debug stack restart, deployment, commit or push occurred. Temporary test servers close on completion. User-visible changelist entry added; unrelated movement-playback working-tree edits preserved. See [thread-summary.md](thread-summary.md) for the complete handoff.

GitHub #293 was updated with the implementation evidence and closed as completed: [verification comment](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293#issuecomment-6241968538). The outstanding native Android/Linux checks remain explicit manual validation, not claimed results. The final nine focused presentation tests also passed after adding the Animosity/Always Hungry/Loner/Secret Weapon priority assertion.

## Parallel-build playback assertion follow-up

The owner reported a 30-second timeout waiting for four decorative dice at playback-ui.mjs:120. A delayed-render reproduction confirmed every roll rendered but early dice expired before the assertion. The test now controls browser time around each committed movement and the overlap/continuation/expiry checks. Gameplay and existing playback changes are untouched. Standalone and concurrent playback runs, a 4�-throttled/delayed reproduction, the hosted Blitz suite (1 test), focused dice/playback units (5 tests), and all 12 suites in interaction shard 4 passed. [Diagnosis, commands and evidence](playback-build-timeout.md). No commit, push, deployment or managed stack restart occurred.
