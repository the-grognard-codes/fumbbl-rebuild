# Feature: Extend block dice presentation to D6 D8 and D16 rolls

## Abstract

Extend the accepted polygon block dice presentation to native D6, D8, and D16 rolls. Use physical dice with stable markings, the shared roll animation, and the same uncluttered pitch layout and reroll controls. Preserve native outcomes, decision timing, accessibility, and MUTP styling.

Status: Implementation and local verification complete on `feature/polygon-numeric-dice`. See the [roll inventory and implementation details](polygon-numeric-dice-inventory.md).

## Objective

Give coaches and observers a consistent dice experience across block, action, skill, scatter, and casualty rolls, with readable results and reroll choices that remain available when the native engine offers them.

## Context / Existing Behavior

[PR #275](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/275), merged as `2d493b600b816ed6f5e13959d9b82ec45f58046a`, introduced polygon block dice, diffuse backing without an enclosing rectangular panel, and placement centered at 65% of screen width and vertically centered within visible bounds.

Block dice keep their physical faces and visual identity through preview, confirmation, and result. A gentle preview continues while awaiting the server. The native result starts one 310 ms animation blending two opposing diagonal half-turns, with smooth deceleration and descent into a head-on result.

Numeric dice still use `DiceFace`, which draws a flat body and D6 pips with a separate 440 ms 2D animation. `reportedDice` accepts block arrays and scalar `report.roll` values from 1–6; it does not distinguish arbitrary dice types or generally extract D8/D16 outcomes. Native reports also contain dedicated fields and grouped rolls: kickoff scatter has separate direction and distance fields, BB2016 casualty generation produces a D6/D8 pair, and BB2020/BB2025 casualty generation produces a D16/D6 pair. These require report- and ruleset-aware interpretation before presentation.

The pitch overlay, required decision dialog, replay summary, and event log are separate consumers. A global replacement of `DiceFace` would mix interactive pitch presentation with compact history and modal responsibilities.

## In Scope

- Polygon D6, D8, and D16 rendering for native rolls in the live pitch overlay, including action and skill tests, original results, and eligible rerolls.
- Native extraction of D8/D16 rolls and grouped D6/D8/D16 results needed for existing match flows, including scatter and casualty reports where the native report supplies individual outcomes.
- Consistent dice and reroll presentation for both coaches, observers, and the main pitch result in match replay.
- Dice artwork inside required decision dialogs, while retaining their modal layout and decision behavior.
- A shared renderer and motion lifecycle that preserves the accepted block dice behavior.
- An inventory mapping each affected roll to its native report, ruleset semantics, dice type, grouping, display surface, and any offered decision.

## Out of Scope

- New gameplay rules, random number generation, roll probabilities, reroll eligibility, or browser-generated outcomes.
- New potential-roll forecasts for non-block actions. Existing block previews remain supported.
- D3 or other new dice variants, including inventing individual faces from totals or reconstructing missing native outcomes.
- Redesigning compact event-log glyphs or secondary replay-summary dice; retain their existing static behavior.
- Removing required modal shells, changing apothecary decisions, changing Kick's nonmodal behavior, or redesigning unrelated HUD panels.
- Issue submission, commits, pushes, or deployments without explicit authorization.

## Functional Requirements

1. **Explicit native dice semantics.** Identify dice by native report semantics and ruleset, with explicit type, face value, group membership, and stable roll identity. A value of 1–6 must not imply D6: it can also be a D8 or D16 outcome. Validate values against the declared die type. Do not treat an armour/injury total, modified result, casualty code, or direction enum as an individual die face.
2. **Physical dice.** Render D6 as a cube with six fixed pip faces, D8 as an eight-faced solid with numeric markings, and D16 as a sixteen-faced solid with numeric markings. Keep markings attached to their physical faces throughout motion. Rotate to the authoritative result; do not swap markings to manufacture the landing face. Each result must settle head-on and remain readable, including two-digit D16 values.
3. **Shared motion.** Reuse or generalize the block renderer's lifecycle and motion engine. Each newly revealed native die rolls once over 310 ms, blending two opposing diagonal half-turns with smooth deceleration and descent. The turns overlap within one animation; they are not full revolutions or successive roll animations. Adapt landing orientation to each solid.
4. **Waiting and continuity.** Confirmation must not start an extra tumble. Where a preview already exists, preserve its DOM and animation identity while awaiting the server, then start the result roll from its visible pose. Numeric flows without a preview retain their existing pending behavior until an authoritative outcome arrives; do not display a guessed result.
5. **Pitch layout.** Remove enclosing rectangular dice panels from the affected pitch surfaces. Use the accepted neutral diffuse backing for numeric dice and team/skill reroll icons. Center the dice row at 65% of window width and at the vertical center, clamped to the visible pitch/window using the existing fallback behavior. Keep rows stable, dice fully opaque, and all choices reachable after pan, zoom, scroll, resize, or a camera change. Empty overlay space must allow pitch interaction.
6. **Reroll choices.** Carry the block dice styling and icon grouping into numeric reroll decisions. Preserve exact native option IDs, labels, resource accounting, pending guards, skill subchoices, keyboard focus, and decline/cancel behavior. Generic face-bearing choices must be typed explicitly rather than assumed to be block faces. Show only choices the native engine offers.
7. **Chronology and identity.** Appending a rush, dodge, or other action die animates only the new die. Preserve per-die labels and group ordering. Keep original action results distinct from a Pro test, any offered Pro-test reroll, and the subsequent action reroll. An unchanged result, late transcript, new choice, reconnect, or ordinary rerender must not replay a completed roll. Explicit replay navigation may replay an event according to existing playback semantics.
8. **Accessibility and timing.** Preserve accessible roll labels, die type and value, success/failure context, keyboard operation, visible focus, and reduced-motion support, including preference changes during motion. Decorative animation must not delay authoritative input availability, send commands, or change movement timing. Warning red retains its existing meaning; numeric failures must not acquire an uphill warning merely by sharing the renderer.
9. **Compatibility.** Preserve block counts, uphill glows, face selection, previews, and reroll behavior, as well as kickoff/Kick previews and apothecary presentation. Older transcripts/checkpoints must remain readable when optional presentation metadata is absent. Omit unsupported or invalid die artwork while preserving the existing event text and decisions; never substitute an invented face.
10. **Review follow-up: roll pacing.** Keep ordinary results visible for 1,200 ms from each group's arrival, increasing the previous 1,000 ms interval by 200 ms. Start successive groups at least 350 ms apart in native report order, including contiguous labelled groups within an injury report. Keep simultaneous pairs together, show group captions, and expire each group independently without restarting surviving dice. Pending native roll choices stay pinned until resolved and immediately replace any decorative backlog. Reconnects and replay seeks cancel old groups. Reduced motion retains group order without tumbling. Static replay snapshots and Skip animations remain available for inspection. D16 motion must not create scrollbars; genuinely long choice lists remain scrollable.

## Acceptance Criteria

- All six D6, eight D8, and sixteen D16 outcomes render with stable physical markings and land on the correct native face without a final orientation jump. Tests distinguish a low-valued D8/D16 result from a D6 result.
- Native fixtures exercise at least one genuine D8 report and one genuine D16 report, plus a grouped roll, through extraction and the pitch display. The inventory records every affected report and explicitly accounts for excluded surfaces and unsupported report forms.
- An accumulated action sequence retains earlier dice without restarting them. A numeric action failure followed by a Pro test and subsequent native reroll preserves the correct original result, order, choices, and one animation per new die.
- A delayed native response produces no confirmation roll or double roll. Existing previews continue smoothly until the result; the actual roll lasts 310 ms independently of server latency and retention time.
- Numeric dice and associated reroll icons use diffuse backing without a rectangular pitch panel. Placement, readable D16 labels, full opacity, scrolling, and click-through behavior hold in narrow and desktop viewports, for both coach views and both pitch cameras.
- Observer and main replay displays show the same native die types, values, and ordering without exposing actionable controls to read-only viewers. Required modal decisions retain their behavior.
- Keyboard and reduced-motion checks pass, including a preference change during a roll. Pending controls prevent duplicate submissions without adding animation-dependent delays.
- Existing block dice, kickoff/Kick preview, apothecary, native checkpoint, reroll-accounting, and replay regressions pass. Compact history glyphs and secondary replay-summary dice retain their existing behavior.

## Constraints

- Preserve supported MUTP themes, colors, typography, and style on Android, Windows, and Linux. Reuse existing CSS and UI scaffolding where appropriate.
- Create a new branch before implementation; preserve unrelated working-tree changes and follow repository conventions.
- Keep native game decisions authoritative. Prefer existing reports; add only bounded, backward-compatible presentation metadata if report semantics cannot otherwise be conveyed reliably. Do not add server gameplay logic for decorative motion.
- Keep ruleset-specific interpretation in the appropriate ruleset boundary. Shared code must not change unaffected rulesets or introduce inheritance between ruleset implementations.
- Keep roll duration separate from result retention, route playback, waiting, and decision availability.
- Do not commit, push, publish, or deploy unless explicitly requested.

## Implementation Guidance

- Start with `dice-presentation.ts`, `match-decision.ts`, and `reroll-presentation.ts`; trace their actual native reports and callers before changing rendering. Include movement, pickups, passing/catching, Pro, scatter, and casualty flows where applicable. Record report fields and evidence for side counts rather than inferring them from observed values.
- Generalize `BlockDie.tsx` behind a shared die interface with variant-specific geometry, fixed face layouts, and outcome-to-orientation mappings. Keep one motion lifecycle; retain a static mode for contexts that do not animate.
- Migrate `PitchDecisionOverlay.tsx` and its CSS with explicit die kinds and stable per-die keys. Generalize its block-only face-option assumption. Keep the body portal, row alignment, focus restoration, scroll handling, and pending guards.
- Audit `MatchDecisionDialog.tsx` callers before migrating its artwork. Preserve required modal shells. Keep `MatchEventLog.tsx` and the secondary `HostedResult.tsx` summary separate from the main pitch migration.
- Review `pitch-playback.ts` and `use-pitch-playback.ts` for identity and retention effects without coupling them to animation duration. Preserve compatibility with older records when extending browser/native contracts.
- Use the accepted [block feature](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/275), `CONTEXT.md`, `docs/adr/0003-coach-oriented-angled-pitch.md`, and `docs/specs/parallel-validation.md` as implementation references.
- Add a user-facing entry to the latest `VersionChangeList` in `ffb-client-logic/src/main/java/com/fumbbl/ffb/client/model/ChangeList.java` when implementing the visible change.

## Validation

- Extend unit coverage for typed extraction, report/ruleset mappings, grouped values, invalid or missing data, all face orientations, stable identities, and original/Pro/reroll chronology. Include supported rulesets with different casualty dice and older-record compatibility.
- Extend `dice-ui.mjs` and relevant playback, movement, reroll-choice, reroll-accounting, manual-reroll, projected-pitch, and round-four checks. Cover D8/D16 native fixtures, delayed responses, late transcripts, focus, reduced motion, viewport bounds, and block regressions. Query the body portal rather than only the pitch element.
- Use Playwright's clock for JS timers and inspect or pause WAAPI animations separately. Verify motion continuity and one roll per identity without relying on browser-command timing races.
- Update hosted Play/replay checks, including `site/test/play-browser.test.mjs` and `m5e-result-browser.test.mjs`, for numeric dice on the main pitch. Provide visual acceptance evidence for each solid, D16 readability, reroll controls, both cameras, and representative mobile/desktop layouts.
- Run focused selectors first, then complete browser-client and site unit tests, browser-client builds, the interaction and hosted browser suites, and the supported game-server verification: `npm.cmd test --prefix browser-client`, `npm.cmd test --prefix site`, `npm.cmd run build --prefix browser-client`, `npm.cmd run test:browser --prefix site`, and `./tools/target-build.ps1 verify`. The hosted browser command also builds the site and runs client interaction suites; avoid duplicating that full run without a concrete reason.
- Follow the existing validation inventory and gate requirements. Keep native checkpoint comparisons strict; refresh fixtures only after confirming the intended presentation change and unchanged unrelated values. Use separate Vite caches for concurrent browser shards and do not replace dependencies during checks.

## Completion Notes

- Following visual review, implemented independent roll-group timing now rather than coupling it to future player movement animation. The decorative queue can later share action timing cues while authoritative board updates and choices remain immediate. See the inventory's roll-pacing follow-up for implementation and validation details.
- Follow-up validation passed 290 browser unit tests, 12 site unit tests, all 32 interaction scripts, all 19 hosted checks across 10 suites, both production builds and the complete browser coverage gate. D16 overflow and labelled armour/injury evidence covers desktop and 390 px layouts.

- The user approved implementation in chat. Work is local to `feature/polygon-numeric-dice`; issue submission, commit, push, and deployment have not been performed.
- The [completed inventory](polygon-numeric-dice-inventory.md) records report mappings, the optional native `numericDice` contract, retained surfaces, exclusions, visual evidence, and verification results.
- Passed 288 browser unit tests, 12 site unit tests, all 32 registered interaction scripts, and 19 hosted checks across 10 suites. Browser reports passed exact inventory, completion, and skip validation.
- Browser and site production builds passed. Full Java 21 `tools/target-build.ps1 verify` passed across all modules. Its 44 native suites ran 254 cases with zero failures/errors and seven existing, explicitly allowed opt-in skips; all four inventory validators passed against the actual XML results.
- Regression coverage includes all 30 numeric faces, fixed markings, head-on landings, 310 ms motion, block preview continuity, accumulated action dice, Pro selection/chronology, snapshot restoration, pending guards, both coaches/cameras, and hosted Play/replay. Validation failures encountered during implementation were corrected and affected checks rerun successfully.
- Visual checks used Windows Chrome, with desktop and 390 px viewport evidence. Actual Android and Linux browser/device sessions were not run.
