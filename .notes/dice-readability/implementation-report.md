# Dice readability implementation report

Branch: `feature/dice-readability`. Issues: [#448](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/448), [#449](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/449), [#450](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/450), [#451](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/451).

Status: complete and ready for manual validation. Dev-local is running at http://localhost:5000/play.

Use **Game Menu > Interface > Show dice icons / Show dice text** to compare all four modes. Both controls default on.

## Delivered behavior

- Approved static event artwork is delivered with the browser assets. Catch uses v3 and Weather v1; approved SVGs remain unchanged.
- Game Menu > Interface provides independent Show dice icons and Show dice text controls. Both default on and persist per browser, including cross-tab changes and session fallback when storage is denied.
- Event names appear while rolling; authoritative results appear on the existing settle deadline. Rerolls keep their event identity. Targets/modifiers remain in existing log text.
- Native flags distinguish passes/bombs/Hail Mary, confusion traits, spells, reaction skills, and reroll tests. Unknown events retain their text without invented artwork or results.
- Scatter has one event caption and a direction arrow beside each D8. Arrows follow both camera ends and all supported pitch elevations. Missing direction metadata uses a neutral marker, never the numeric face as a guessed direction.
- Existing animated armor/injury/casualty artwork is retained and obeys the icon preference. Hiding/showing it does not restart its animation. No tooltips were added.
- Casualty D16 remains visible; the extra D6 is hidden only when an authoritative non-stat result makes it unused. Named stat detail retains its separate stage. Raw recorded values and original log/summary labels are preserved.
- Kickoff Deviation now shows the actual D8 plus D6 or D3 distance. An optional native `scatterDistanceSides` field survives JSON recovery and coach transforms. Old reports without the type retain direction-only display. D3 retains the established D6 geometry with values 1–3.
- Block choices, mechanics, outcomes, random generation, and unrelated working-tree changes are preserved. Other previously absent dice adapters remain deferred.

## Review findings resolved

1. Corrected the inventory's mistaken `scatterPlayer` Deviation mapping after inspecting the actual producer. The user approved the kickoff interpretation before implementation.
2. Kept presentation metadata separate from labels used by logs and compact replay summaries.
3. Preserved outcome-art DOM while icons are hidden, preventing animation restarts.
4. Fixed mobile overflow where simultaneous groups wrapped into an offscreen column; groups now remain in a vertically scrollable column.
5. Updated replay and hosted-page casualty assertions to expect only the contributing D16 for Badly Hurt, while keeping the original stored D6. Legacy replay without authoritative injury facts still displays both recorded dice.
6. Carried native presentation into the dedicated Pro display so its rerolled tests retain the `(reroll)` caption.
7. Updated the manual-Pro/reconnect assertions to use the concise accessible status names; native actions and exact retained-request checks remain intact.

## Validation evidence

- Browser unit suite: 489 tests passed (`npm.cmd test --prefix browser-client`).
- Focused parser/outcome/direction suite: 20 tests passed.
- Browser build: TypeScript and Vite passed (`npm.cmd run build --prefix browser-client`).
- `node browser-client/test/dice-ui.mjs`: passed native dice geometry/landing, lifetimes, live playback, replay/static inspection, rerolls, block choices, outcome stages, desktop/mobile, and the new preference/direction checks.
- Focused browser checks: all four modes, persistence, cross-tab update, denied storage, settle timing, reduced motion, fallback, Pro/original rolls, projected direction, and mobile overflow passed. These are invoked by the registered dice UI runner.
- Visually inspected actual LivePitch captures: [desktop](ui-live-1440.png) and [mobile](ui-live-390.png).
- `npm.cmd run assets:check --prefix browser-client`: passed, including 571 delivered assets. Delivery was synchronized after correcting the Deviation manifest entry.
- `node browser-client/test/pending-recovery-ui.mjs`: passed ordinary-action behavior and exact retained-request recovery.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 verify`: clean build passed in 13:49 across all five reactor modules. 950 tests reported, 938 executed, zero failures/errors, 12 opt-in skips. Common: 17/0 skipped; server: 653/5 skipped; state tests: 280/7 skipped. Skips cover explicitly opt-in JDBC/runtime/artifact checks; detailed names are recorded in `server-test-summary.json`.
- An initial preflight timed out in the existing double-click confirmation test, whose gesture interval is 400 ms. It passed in isolation and in both subsequent two-worker runs. Reduced contention is consistent with those results; no gesture logic was changed or assertion weakened.
- The complete startup preflight passed: all 63 interaction suites and 10 hosted suites, with zero failures. This includes the corrected hosted casualty and manual-Pro/recovery assertions. Run: `$env:FFB_BROWSER_TEST_WORKERS = '2'; node tools/deploy.mjs --environment dev-local`. Browser validation took 802.4 seconds; reports are in `.tools/validation/local-browser-Qfv6NS` and startup output is in `dev-local-ready.log`.
- Dev-local startup passed: Docker image built, server/database healthy, real V2 proxy authentication-gate/reconnect test passed, Firebase Hosting started, and the computer-player service became ready.
- `node .notes/dice-readability/verify-dev-local.mjs`: `/play` returned HTTP 200; the delivered manifest and all 78 SVGs matched canonical files byte-for-byte. Evidence: `runtime-ready.json`, checked 2026-11-05 00:42 EST.
- `git diff --check`: passed. Working branch confirmed as `feature/dice-readability`.

## Execution notes

PowerShell's script policy required `npm.cmd`. Java compilation reproduced an `AccessDeniedException` on a Maven dependency under the sandbox; approved execution outside the sandbox resolved that boundary. Docker likewise required approved execution outside the sandbox. Later, Windows error 1909 prevented sandbox-account process creation; approved execution as the working account continued successfully. An initial dev-local preflight caught an unregistered standalone-style check filename; renaming it to the established `*-checks.mjs` convention retained coverage through `dice-ui.mjs` and passed inventory validation. A server run overlapping Deviation edits/native fixture compilation was stopped after mixed module versions caused `NoSuchMethodError`; the subsequent clean full run passed. The supported startup refreshed expired Google ADC and then verified Firebase access. No credential contents were copied into the repository.

The existing art-review screenshots regenerated by broad validation were restored from saved copies and hash-verified. The unrelated `site/src/updates/index.html` change remains intact.

No commit, push, remote deployment, or merge has been performed.

## Process follow-up

- Verify native producers before assigning die semantics in an inventory; report names and an existing decorator comment were insufficient evidence for Deviation.
- Search both browser and hosted assertions before running long validation after changing visible or accessible labels.
- Keep native clean builds separate from fixture-generating browser runs, and use the supported two-worker setting for timing-sensitive local validation.
- Preserve generated review images before broad suites, and register new browser checks through the established runner/file naming convention.
