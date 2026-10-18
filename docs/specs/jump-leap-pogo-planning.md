# Feature: Jump, Leap and Pogo movement planning

## Abstract

Enable explicit jump waypoints inside browser movement plans using the BB2025 native mechanics.

## Objective

Plan a player's legal activation, including a first-square jump and mixed walking/jumping, without declaring an action or rolling until confirmation.

## Context / Existing Behavior

Native Jump, Leap and Pogo commands exist. Browser route decoding and continuation currently accept adjacent walking steps only. Threat fills already provide green/yellow/orange/red bands and Rush triangles.

## In Scope

- A fixed smaller Jump toggle immediately beside Move, using the existing icon artwork and styles.
- Server-authoritative jump destinations from the last planned waypoint, or starting position; unavailable Jump remains faded and disabled.
- Explicit jump waypoint metadata, two-square movement accounting, curved route segments, native execution and durable continuation.
- Jump target numbers, skill-adjusted penalty colors, neutral unpenalized landing outlines, relevant optional skill stripes and Rush triangles.
- First-square Jump planning and Move/Blitz/Foul combinations; movement during already declared moving actions uses the same route support.
- BB2025 mechanics audit; present discrepancies before changing engine rules.

## Out of Scope

- Other rulesets, visibility preferences and double-click shortcuts.
- Planning beyond a block or terminal action before its outcomes are known.
- Persisting unconfirmed browser drafts or changing native decisions and reroll choices.

## Functional Requirements

- Entering Jump is a reversible local planning mode. Selecting a legal landing adds one normal waypoint and returns to Move; subsequent jumps may be explicitly selected.
- Jump colors reuse the existing palette for effective penalties 1/2/3/4+; zero or favorable modifiers use a neutral outline. Numeric targets include native skills. Conditional Diving Tackle remains a warning, not an assumed use.
- Explicit Jump guidance remains visible when ordinary threat markings are disabled. Optional stripes respect category and individual skill preferences. Exit restores ordinary markings.
- Right-click/Escape first cancels armed Jump without changing the route. Otherwise retain existing undo/clear behavior. Undo removes the whole jump segment and remains in Move mode.
- Confirm is disabled while awaiting a jump landing. No planning operation activates a player, spends movement, rolls dice or writes gameplay history.
- Confirm commits the appropriate legal activation. Native decisions interrupt execution and valid remaining routes resume automatically. Invalid continuation, turnover and ended activation stop the plan.
- Committed routes survive recovery; unconfirmed drafts follow existing local-state behavior. Replay shows actual outcomes, never actionable planning controls.

## Acceptance Criteria

- Ordinary players can jump legal prone/stunned obstacles; Leap/Pogo players can use native additional destinations.
- Mixed routes and first-square jumps preview and execute with correct movement allowance, modifiers and Rush warnings.
- Invalid, stale and forged jump destinations are rejected without mutation; old walking routes/checkpoints remain readable.
- Adjacent controls, mode exit, undo and guidance work with keyboard, mouse and touch in both coach views and supported pitch projections.
- Existing moving action declarations and terminal Blitz/Foul intent remain intact.

## Constraints

- Branch: `feature/jump-leap-pogo-planning`.
- Preserve existing browser presentation and unrelated work. Keep BB2025 behavior isolated from other rulesets.
- Owner authorized implementation, validation, staging, commit, PR publication and merge on 2026-10-18.

## Implementation Guidance

Native legality/modifiers remain authoritative. Share palette and projection geometry; do not reuse ordinary destination-zone counts as jump penalties. Route steps must retain explicit jump identity through commit and checkpoint recovery.

## Validation

Run focused Java and browser regression selectors first, then browser unit/UI checks and Maven build/tests. Cover native interruptions, checkpoint recovery and replay compatibility. Record exact commands and results before publishing.

## Completion Notes

Tracking: [#297](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/297), [PR #298](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/298). Implementation and self-review complete. Full Maven verification, focused native regressions, browser unit tests, production build and affected desktop/tablet interaction journeys passed. See [acceptance evidence, compatibility and audit limits](jump-leap-pogo-validation.md) and the [outcome report](jump-leap-pogo-outcome.md).
