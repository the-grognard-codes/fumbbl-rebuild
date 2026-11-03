Production implementation resumed on feature/production-decision-prompts after approval of horizontal mole mockups. BB2025 is the sole supported ruleset under current repository instructions. Reuse #415, #416 and #417. Official May 2026 FAQ confirms bribes remain available when Argue the Call is unavailable; no multi-player ordering found in that FAQ, so apply the owner's explicitly approved choose-player / fully-resolve fallback. Source: https://assets.warhammer-community.com/eng_20-05_blood_bowl_faq_errata-gytvlserev-ngihd3chox.pdf
## Implementation checkpoint

- Branch: `feature/production-decision-prompts`; issues #415, #416, #417 reused.
- Horizontal production prompts reuse the approved six mole images, existing inducement atlas and player-card portraits. Injury-result selection and tactical skill/reroll circles retain their existing presentation.
- Interception and multi-patient selection preview locally, then confirm one authoritative action. Pending player prompts allow pitch inspection and camera movement; coin and kick/receive remain modal.
- Connector placement uses actual projected 3x3 ground cells and subject artwork, allowing overlap only when space cannot accommodate the prompt. Off-pitch subjects show player number without a pointer.
- Secret Weapon selection resolves one player, optional argue rerolls, and bribes before the next. Coach ejection suppresses later arguments, not bribes. Existing checkpoints retain their phase ordering, with newly available browser projections and optional focus-target compatibility.

## Review

Standards review requested the Unreleased entry and preservation of historical native snapshot shape; both fixed and rechecked as approved. Specification review found optional Bribery and Corruption and legacy multi-player bribe projection gaps; both addressed and rechecked as approved. Self-review caught nullable checkpoint serialization and a DOMRect placement argument that overrode the calculated position; fixed and covered. Added compatibility checks for saved decisions without focus targets.

## Validation

- `npm.cmd test`: 467 passed.
- `npm.cmd exec tsc -- --noEmit` and `npm.cmd run build:play`: passed; 436 synchronized assets.
- Focused browser suites `apothecary-decision-ui.mjs`, `foul-bribe-ui.mjs`, `rectangular-decisions-ui.mjs` and `playback-ui.mjs`: passed. Coverage includes candidate switching without submission, current-revision confirmation, pending controls, modal/nonmodal behavior, real portraits, keyboard inspection, camera-linked markers, all nine protected cells, off-pitch identity, narrow viewport, live/replay pacing and reconnect behavior.
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 install`: all modules passed; 975 tests, zero failures/errors, 12 opt-in skips.
- Final compatibility changes: `tools/target-build.ps1 test -Module ffb-statetest -Test FoulBribeFlowTest,SecretWeaponDecisionTest`: 13 passed, zero skips. Covers both coaches, KO/off-pitch subjects, wrong actor/player, declined options, resources, coach ejection, optional reroll, exact historical native serialization and recovery of decisions without focus targets.
- Full dev-local browser preflight: all 73 interaction/hosted suites passed, zero failures/errors/skips. Reports: `.tools/validation/local-browser-RPJ8R2/`; elapsed 675.1 seconds with two workers. The report records the branch base commit; the tested tree includes this uncommitted implementation.
- Dev-local Linux/JDK 21 image build passed, including 17 common and 663 server tests (five opt-in skips, no failures/errors).

The first full browser preflight found one stale heading assertion in `round-four-ui.mjs`: it expected the old kick/receive title. Updated it to the approved “Kick or receive?” copy; the focused suite passed before restarting the full preflight.

Screenshots and logs are retained locally under `.tools/validation/decision-prompts/` and `.tools/production-prompts-*.log`. Chromium desktop/narrow-viewport checks are not physical Android or Linux GUI validation.

## Manual validation instance

Dev-local is ready at `http://localhost:5000/play`. The owner renewed expired Google Application Default Credentials; the repository helper verified Firebase access. Restarted standard startup passed all 73 browser suites again (450.7 seconds, four workers; `.tools/validation/local-browser-BLkWjG/`), rebuilt the Linux server successfully, confirmed healthy server/database containers, passed the live proxy initial-connection/reconnect test against the real Java authentication gate, and started the computer-player service. Startup log: `.tools/production-prompts-dev-local-authenticated.log`.

No commit, push, PR, merge or remote deployment was performed for this implementation. Issues #415–#417 remain open for review.

## Retrospective

The useful process improvement is preserving historical snapshot shapes in recovery regressions: changing only the saved browser projection did not expose native serialization incompatibility. The regression now removes the newly introduced native fields too. Use the repository's UTF-8-safe patch tool for source edits; default Windows PowerShell text encoding caused an avoidable Vite parse failure during development. Existing TypeScript, native and browser gates caught these problems; no additional global instruction or parallel validation system is needed.
