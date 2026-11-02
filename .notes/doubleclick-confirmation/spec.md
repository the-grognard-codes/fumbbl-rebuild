# Feature: Doubleclick confirmation for common actions

Tracker: [#409](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/409). One integrated implementation slice; gestures and touch cancellation share the planner's confirmation state. Branch: `feature/doubleclick-confirmation`.

## Abstract
Let coaches confirm common planned player actions by doubleclicking or double tapping their final destination or target.

## Objective
Reduce keyboard and confirmation-button travel while preserving deliberate confirmation and server validation.

## Context / Existing Behavior
Confirm and Space commit planned actions. Repeated target clicks can cancel proposals or re-request previews. Movement previews are asynchronous. Right-click cancels selected actions or removes movement waypoints.

## In Scope
- Browser V2 move, block, blitz, foul, teammate-targeted pass and handoff, including plans made through the action menu.
- Doubleclick/double-tap confirmation and conditional touch cancellation.

## Out of Scope
- Empty-square passes, including Hail Mary targets, and other action types.
- Rules, server protocol, replay controls, unrelated appearance or interaction changes.

## Functional Requirements
- Selecting a new final square or player is the first click. That click never contributes to the confirmation pair. The next two clicks/taps on that same final target confirm. Three rapid clicks are valid when the preview is ready.
- Confirm only when the existing Confirm control is enabled, through the same execution path. Do not queue an early gesture; require a new pair once ready.
- A single repeated click on the selected final square/player leaves the plan unchanged. Other squares/players still edit the plan normally.
- Scope gesture state to the current plan, actor, match and revision. Reset after edits, cancellation, interruption, input changes and submission; never send duplicates, stale requests, or replay/spectator actions.
- Show Cancel plan while touch is the active input, including on hybrid devices; hide it for mouse/trackpad input. Cancel clears the entire pending plan.
- Preserve Confirm, Space and existing right-click behavior. Reuse MUTP controls, styles and themes.

## Acceptance Criteria
- Move: select a coach player, plan a route, then doubleclick its already-selected final square to execute exactly once.
- Block/blitz/foul: select the target, then doubleclick the same target to execute exactly once.
- Pass/handoff: select the teammate, then doubleclick the same teammate to execute exactly once.
- Selection plus one repeat never executes; isolated repeat clicks do not cancel or refresh the plan.
- Unready, invalid, disconnected, pending, playback and spectator states cannot commit gestures. Becoming ready does not execute previously received input.
- Touch users can cancel all six kinds; switching input updates Cancel visibility without changing the plan. Mouse right-click still cancels/undoes as before.

## Constraints
- Preserve MUTP colors, typography, themes and unrelated working-tree changes.
- Support Android touch and Windows/Linux mouse input; report physical-platform coverage honestly.
- Use a new working branch. Do not stage, commit, push, open a PR, merge or deploy.

## Implementation Guidance
Intercept repeat selections before existing cancellation/replanning. Use a small tested gesture state machine with a bounded doubleclick interval and canonical logical targets, invoking the existing commit path. Keep touch input detection at the match surface and reuse the command bar for cancellation.

## Validation
- Focused gesture unit tests and browser scenarios for all six actions, readiness, edits, repeated input, touch/hybrid cancellation and interruption.
- Relevant existing live-play, replay and recovery suites, browser unit tests and production build.
- Java reactor tests/build and standalone game-service validation using the pinned toolchain.
- Start dev-local, check readiness and startup errors, and leave it running for manual validation.

## Completion Notes
Implementation and validation are complete; see [outcome.md](outcome.md). Keep the issue open pending review/merge. Dev-local is running at http://localhost:5000/play with healthy database/game-server containers, working hosting/proxy and a ready computer service. Google credentials were renewed. The report records retained-match recovery warnings and remaining physical-platform checks.
