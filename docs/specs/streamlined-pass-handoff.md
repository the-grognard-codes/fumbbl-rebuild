# Feature: Streamlined pass and handoff declarations

## Abstract

Extend the browser's reviewed movement plans to include a pass or handoff to a friendly player, with one confirmation for declaration, movement, pickup and transfer.

## Objective

A coach selects an eligible player, optionally plans movement, clicks a teammate, reviews the complete play, then confirms once. Planning must not activate a player or mutate the game.

## Context / Existing Behavior

The browser already plans Move, Blitz and Foul before confirmation. Pass and Hand Off currently require explicit action-menu declarations. Existing native rules, prompts, logging, replay and checkpoint recovery remain authoritative.

## In Scope

- Server preview, validation, execution and recovery of planned pass and handoff actions.
- Browser recipient selection, route editing, action highlighting and existing transfer-line presentation.
- Native, browser unit and browser interaction regression coverage; relevant build and replay/recovery checks.

## Out of Scope

- Changes to native pass, handoff, pickup, catch or turnover rules.
- Transfer shortcuts after an activation has begun; changes to explicit action-menu flows.
- Pass difficulty overlays for implied actions, success odds, or automatic pathfinding avoidance of the loose ball.
- Deployment or hosting publication.

## Functional Requirements

1. Infer Hand Off when the teammate is adjacent to the final movement endpoint (or current square without movement); otherwise infer Pass. Explicit menu selections retain their existing behavior, including passing to adjacent teammates.
2. Require initial ball possession or contact with the grounded ball along the actual displayed movement route. All traversed squares count, including generated spans between waypoints. Separate future ball-avoidance pathfinding will require an explicit click on the ball square; do not implement that change here.
3. Apply native declaration availability and recipient eligibility/range from the planned endpoint. Reject invalid target clicks while retaining the selected player and valid movement plan; do not substitute another action or switch players.
4. With an eligible ball carrier selected, clicking a teammate targets a transfer, including without waypoints. Clear selection with existing right-click/Escape controls before selecting another player.
5. Clicking another teammate replaces the recipient, preserves the route and recomputes action type. Clicking an empty square removes the transfer and edits/extends movement. Right-click removes the transfer before removing waypoints; Escape clears the proposal.
6. Highlight the inferred Pass/Hand Off menu item and draw the existing transfer line from the planned endpoint to the recipient. Preserve themes, pitch projections, typography and Android/Windows/Linux browser support.
7. Confirm commits the entire sequence through native commands. Normal game prompts still require coach input; successful resolution resumes the route and transfer automatically without another recipient selection or confirmation.
8. A failed pickup retains normal turnover behavior. If movement stops short or the transfer becomes illegal during execution, cancel the pending transfer and preserve the normal resulting game state. Never silently change the origin, recipient or action type.
9. Preserve permissions, revision checks, duplicate-request handling, replay and recovery. A recovered confirmed plan must not execute its transfer twice.

## Acceptance Criteria

- Ball carriers can plan stationary and moving handoffs/passes without opening the menu.
- A noncarrier can plan either transfer when the route crosses the grounded ball; a route missing the ball cannot imply a transfer.
- Adjacency uses the route endpoint and changes when the recipient or route changes; inference never invents an approach route.
- Invalid/unavailable targets preserve the existing plan. Explicit adjacent Pass still works.
- Replacement, empty-square editing, right-click undo and Escape preserve the agreed selection behavior.
- Recipient line and menu highlight identify the reviewed transfer; implied planning shows no difficulty overlay.
- One confirmation executes the full sequence, including prompt continuation, with normal failure/turnover and safe cancellation.
- Read-only forecasts do not mutate checkpoints/logs. Replay and recovered pending execution preserve native outcomes and single execution.

## Constraints

- Work on the fresh `feature/handoff-pass-steamline` branch from current main; preserve unrelated changes.
- Follow repository conventions and add a user-facing entry to the latest ChangeList.
- The user requested the usual delivery method: issues, implementation, self-review, validation, scoped commit/push, PR and merge after required checks. No deployment is authorized.

## Implementation Guidance

Extend the existing movement request/plan and persisted pending-route machinery. Use the existing native pass-range and handoff eligibility checks. Keep browser forecasts advisory and revalidate at commit and execution.

## Work Slices

1. [#305: Native planned transfers](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/305): movement contract, read-only preview eligibility, native execution, prompt continuation and checkpoint recovery.
2. [#306: Browser planned transfers](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/306): dependent on #305; recipient inference/editing, protocol decoding, transfer line/menu feedback, regression coverage and ChangeList.

## Validation

- Focused server movement/ball-action tests: stationary and routed transfers, actual-route pickup, invalid targets and declarations, no forecast mutation, prompts/failure, interruptions and checkpoint recovery.
- Browser protocol/interaction unit tests and Playwright transfer journeys: menu override, target replacement, empty-square editing, undo/Escape, endpoint line/highlight, invalid targets and stale previews.
- Existing movement, pass workflow, replay and pending-recovery checks where affected.
- Browser unit suite and production builds; relevant Java reactor tests/build and game-service package. Record exact commands and outcomes in the adjacent outcome report.

## Completion Notes

Implementation is in progress on `feature/handoff-pass-steamline`. Outcomes and exact validation commands will be recorded alongside this design.
