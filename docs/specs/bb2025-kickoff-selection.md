# Feature: Consistent BB2025 kickoff player selection

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/420

## Abstract
Use one select, toggle, confirm interaction for High Kick, Charge, Solid Defence,
Quick Snap and player-recipient touchbacks in Browser V2.

## Objective
Remove inconsistent selection UI and reserves-based Solid Defence redeployment.

## Context / Existing Behavior
Charge and Solid Defence use server-side tentative selections, High Kick and
Quick Snap use movement actions, and touchback immediately assigns the ball.

## In Scope
- BB2025 hosted Browser V2, server validation, live play, replay and recovery.
- Consistent normal selection highlights and a counter below the turn counter.
- Browser-local tentative choices; reload/reconnect clears them. Confirm atomically
  validates and locks the group; confirmed state and actions survive recovery.
- Existing participant marker during actions, otherwise blue number outlines.
- High Kick confirmation directly moves the chosen player to the landing square.
- Charge retains its permitted actions.
- Solid Defence keeps all players on the pitch. Selected players may reposition
  and swap with each other in their own half; unselected players remain fixed.
  Intermediate formations may be invalid; final formation must obey setup rules.
- Quick Snap selects up to D3+3 Open players before movement. Each selected player
  may move once to an adjacent empty square, including across halfway. Moving all
  selected players is optional.
- Touchback selects and confirms one recipient and clears UI selection before the
  turn starts. Preserve the square fallback when no eligible recipient exists.

## Out of Scope
Older rulesets, other turn sequences, commits, pushes and remote deployment.

## Functional Requirements / Acceptance Criteria
- Toggle eligible players using the normal selection highlight; show selected
  count and allowance below the turn counter. Preserve optional selection limits.
- Use the normal centered confirmation button without a separate instruction panel.
- Confirm locks the group; subsequent actions obey each event's existing rules.
- Clear event markings when the event ends; distinguish participant from actor.
- Never pause replay for input or reapply confirmed actions during recovery.
- Preserve MUTP styles, themes, and Android/Windows/Linux browser support.

## Constraints
Use a new branch in the existing checkout, preserve unrelated changes and existing
repository conventions. Do not commit or push.

## Implementation Guidance
Deliver as one vertical slice: server selection/action contract and browser flow
must change together. Include native BB2025 movement protection and regression
coverage for confirmed selection and swaps.

## Validation
Focused unit and integration tests first, then browser tests and game-server build.
Check live play, replay and recovery; update affected appearance/timing assertions.
Start dev-local and report its readiness and any unverified platform coverage.

## Completion Notes
Record issue link, self-review, exact validation commands/results and remaining
gaps in the accompanying outcome report. User approved these decisions in chat.
