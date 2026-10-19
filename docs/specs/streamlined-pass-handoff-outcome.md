# Streamlined pass and handoff: delivery outcome

Design: [streamlined-pass-handoff.md](streamlined-pass-handoff.md).
Issues: [#305](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/305), [#306](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/306).
Delivery: [PR #307](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/307).

## Acceptance review

| Agreed requirement | Implementation and evidence |
| --- | --- |
| Stationary and moving transfers before activation | Movement plans now accept `pass` and `handOff`; six native-backed browser journeys cover stationary, moving and pickup cases. Already active players retain explicit flows. |
| Infer from the final endpoint | The browser uses the reviewed route endpoint, and native validation requires the same adjacency/action combination. Transfers never add an approach route. |
| Initial possession or actual route contact with the loose ball | Native validation checks the entered route squares, including intermediate generated squares. A forced-corridor test covers pickup between waypoints; routes missing the ball are rejected. |
| Preserve explicit declarations and normal eligibility | Existing explicit-pass browser journeys and an adjacent explicit-pass native test retain the original behavior. Native declaration offers and target/range rules remain authoritative. |
| Replace/edit/cancel safely | Browser journeys verify recipient replacement, rejected-preview rollback, unavailable-action rejection, empty-square edits, transfer-first undo and Escape. Movement and selection survive invalid recipient clicks. |
| Existing line and action highlight | `LivePitch` reuses the target-line renderer from the planned endpoint; menu keys match the inferred action. Browser tests assert the line origin and highlight. No new artwork, CSS or implied-pass difficulty overlay. |
| One confirmation with normal prompts | Native route continuation executes declaration, movement/pickup and transfer. Tests cover pickup rerolls, the captain's optional Pro prompt, failed-pickup turnover and both transfer types. |
| Interruptions, replay and recovery | Native tests cover invalidated recipients, displaced movers, checkpoint continuation and duplicate requests. Pending intent is cleared before transfer dispatch. Existing browser playback and pending-recovery tests pass. |

Native pass, handoff, pickup and catch rules are unchanged. Ball-avoidance pathfinding, success odds and deployment remain outside this work.

## Validation commands and evidence

Windows uses Node 26.8.1, Maven 3.9.9 and the repository-pinned Temurin 21.0.11+10 toolchain.

- `npm.cmd test` in `browser-client`: 332 tests passed.
- `npm.cmd run build` and `npm.cmd run build:play` in `browser-client`: passed.
- `node tools/validation/browser-suites.mjs --family interaction --shard 4`: all 14 suites passed. This working-tree run covered explicit passing, new transfers, movement, jumps, replay playback, teammate actions, range, threats and confirmation/menu layouts.
- `node --experimental-strip-types test/smart-pitch-ui.mjs`, `test/pass-ranges-ui.mjs` and `test/pending-recovery-ui.mjs` in `browser-client`: passed.
- `tools/target-build.ps1 test -JavaHome .tools/jdk21/jdk-21.0.11+10 -Module ffb-server -Test SetupSessionMovementTest`: all 23 tests passed after correcting the new intermediate-pickup fixture.
- `mvn -f game-service/pom.xml clean verify` with the pinned toolchain and workspace Maven cache: 29 tests passed; shaded service artifact built.
- Root Maven `verify -Pmockito5 -Dnative.shard.includesFile=...`: all eight reactor modules built successfully; 700 tests reported, zero failures/errors, two existing opt-in tests skipped. This includes all module unit tests and 52 affected native state tests selected by the eight suites below.
- Native state selectors: `BallAndFoulActionsTest`, `PassWorkflowTest`, `HandOffTurnoverTest`, `RecoverySessionTest`, `RecoveryScenariosTest`, `RouteForecastTest`, `PassRangeProjectionTest`, and `MovementChecksTest`.
- Linux: the new planned-transfer journeys passed in the [complete browser run](https://github.com/the-grognard-codes/fumbbl-rebuild/actions/runs/39192005033). [PR checks after the fixture repair](https://github.com/the-grognard-codes/fumbbl-rebuild/actions/runs/39192663867) exercise all four native state-test shards. The PR records checks for the final delivery commit.

Complete optional Linux browser validation is not green. Three assertions failed both on this branch and on [unchanged main at `c4fbb7c`](https://github.com/the-grognard-codes/fumbbl-rebuild/actions/runs/39192669559): account-menu sign-out focus (`site/test/account-menu-browser.test.mjs:117`), the 640px drive tracker overlapping its instruction (`drive-phase-tracker-ui.mjs:57`), and the action-menu hover color (`player-action-menu-ui.mjs:70`). The hover assertion observed different intermediate colors in the two runs. These existing failures remain outside this feature; the local action-menu suite passed as part of interaction shard 4. No claim is made that every optional browser suite passed.

Local visual captures are under `test-output/planned-transfers/`. Reviewed desktop perspective transfer lines/action highlights and portrait top-down movement editing. Android coverage uses a touch-capable browser viewport; no physical Android device was used.

### Follow-up acceptance and local validation (2026-10-19)

The owner confirmed that streamlined Pass and Hand Off work as expected in local gameplay. A subsequent parallel browser-validation run exposed two existing readiness races in the shared reroll harness: checking a resource icon before it loaded, and looking for a choice before the offered match revision arrived.

The harness now waits for the expected revision and image completion with bounded timeouts, retaining its existing choice, icon, resource-accounting and duplicate-request assertions. A registered regression journey delays the initial state beyond the former five-second deadline and delays the reroll icon. Both failures were reproduced before their respective fixes.

Post-fix verification: 56 reroll-choice cases and 22 accounting cases passed concurrently; the two delayed-readiness cases passed while those suites were running. All 20 validation-tooling tests passed. This follow-up changes test synchronization and inventory only; native game rules and browser gameplay are unchanged.

## Standards

Independent review found no actionable documented-standard violation or baseline-smell regression. The instance service convention, ChangeList entry, strict protocol handling and existing styling were preserved.

## Spec

Independent review found no missing, incorrect or unrequested behavior against the agreed design. Standards: **0 findings**. Spec: **0 findings**.

## Validation repairs and environment retrospective

1. The first broad native run contained Eclipse-generated error stubs in Maven class outputs while Java language servers were running. Workspace auto-build was temporarily disabled for clean verification; the original setting is restored after the local build. Future build tooling should detect this conflict or isolate CLI output from editor compilation.
2. The intermediate-pickup test initially allowed a longer safe path around the ball. Its corrected fixture forces contact through one open corridor square and resolves the captain's normal optional Pro prompt before asserting turnover. Product pathfinding was preserved.
3. Sandboxed GitHub CLI access could not read the refreshed Windows keyring credential. Running authorized GitHub operations outside that sandbox resolved authentication. Future preflight should check keyring access before requesting another login.

No deployment was requested or performed. See the PR and linked issues for current CI status and merge evidence.
