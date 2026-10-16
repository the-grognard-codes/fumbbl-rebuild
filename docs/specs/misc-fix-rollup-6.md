# Miscellaneous match fixes - batch 6

Branch: `fix/misc-fix-rollup-6`. Requested 2026-10-16. One GitHub issue per numbered observation. The owner accepted the fixes and requested commit, PR publication, merge after passing CI and local branch removal. Deployment is outside this request. Implementation decisions and acceptance evidence are in [the verification report](../verification/misc-fix-rollup-6.md).

## 1. Allow concessions across stored game versions and active phases

Issue: [#279](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/279).

## Abstract
A participant can concede a retained match despite a runtime/replay version mismatch. Current active-game concessions work from either side at supported phases, persist once, and survive retry/reload.

## Objective
Resolve observation 1 on the existing batch branch.

## Context / Existing Behavior
Conceding an older match from preparation returns REPLAY_UNSUPPORTED; active-game concessions also sometimes fail.

## In Scope
- ffb-server match application, completion storage and concession flow; browser concession response handling.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- A participant can concede a retained match despite a runtime/replay version mismatch. Current active-game concessions work from either side at supported phases, persist once, and survive retry/reload.

## Acceptance Criteria
- Old-version preparation concession succeeds without replaying incompatible game commands; unauthorized callers cannot concede; active concessions and duplicate requests produce one durable result.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
ffb-server match application, completion storage and concession flow; browser concession response handling.

## Validation
Regression tests for old/current runtimes, either participant, phase boundaries, stale revision, retry and durable completion.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 2. Identify and remove unexplained friendly-player dashed targeting lines

Issue: [#280](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/280).

## Abstract
Identify the graphic and report its code/CSS name and purpose. Remove lines with no meaningful purpose in that proposal; preserve valid pass/receiver/target indicators.

## Objective
Resolve observation 2 on the existing batch branch.

## Context / Existing Behavior
A dashed line can appear between friendly players while proposing a Block; its name and purpose are unclear.

## In Scope
- browser-client target and threat overlays.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Identify the graphic and report its code/CSS name and purpose. Remove lines with no meaningful purpose in that proposal; preserve valid pass/receiver/target indicators.

## Acceptance Criteria
- A Block proposal shows no unrelated friendly-player connector; documented graphic identity supports a future assists feature.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
browser-client target and threat overlays.

## Validation
Reproduce Block proposal in a browser and verify connector visibility for block, pass and handoff.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 3. Keep match preparation connected throughout play and fifteen minutes afterward

Issue: [#281](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/281).

## Abstract
Preparation remains connected and usable for the full active match and fifteen minutes after completion. Apply the lifecycle to local and hosted configurations.

## Objective
Resolve observation 3 on the existing batch branch.

## Context / Existing Behavior
The preparation area disconnects when a live match starts.

## In Scope
- Preparation transport, session ownership, match lifecycle and heartbeat.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Preparation remains connected and usable for the full active match and fifteen minutes after completion. Apply the lifecycle to local and hosted configurations.

## Acceptance Criteria
- Starting and playing a match does not evict preparation; post-match retention lasts fifteen minutes; disconnect/reconnect and cleanup remain bounded.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
Preparation transport, session ownership, match lifecycle and heartbeat.

## Validation
Lifecycle tests using a controllable clock; browser transition check and timeout boundary checks.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 4. Use Space to confirm every proposed action and end-turn confirmation

Issue: [#282](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/282).

## Abstract
Space invokes the same guarded confirmation as Confirmed! for proposed Block, Pass, other actions, movement and end turn. Avoid accidental actions while editing chat, repeating keys or disconnected.

## Objective
Resolve observation 4 on the existing batch branch.

## Context / Existing Behavior
Space currently misses action-menu and target proposals and the unactivated-player end-turn confirmation.

## In Scope
- browser-client confirmation keyboard handling.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Space invokes the same guarded confirmation as Confirmed! for proposed Block, Pass, other actions, movement and end turn. Avoid accidental actions while editing chat, repeating keys or disconnected.

## Acceptance Criteria
- One click to propose then Space commits the same request as Confirmed!; Space accepts the unactivated-player warning; no duplicate commands or chat interference.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
browser-client confirmation keyboard handling.

## Validation
Browser checks from pitch, player and action-menu focus; editable fields, repeat key and disabled-state checks.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 5. Recalculate movement range after each planned waypoint

Issue: [#283](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/283).

## Abstract
Show authoritative remaining movement and rush perimeter from the end of the planned path, charging prior segments and stand-up costs. Recalculate on add, undo and clear.

## Objective
Resolve observation 5 on the existing batch branch.

## Context / Existing Behavior
Range perimeter remains based on the original position after waypoints are added.

## In Scope
- Browser movement-range requests and server preview/range calculation.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Show authoritative remaining movement and rush perimeter from the end of the planned path, charging prior segments and stand-up costs. Recalculate on add, undo and clear.

## Acceptance Criteria
- A detour consumes range; waypoint add/undo/clear redraws correctly; planning never mutates the live engine.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
Browser movement-range requests and server preview/range calculation.

## Validation
Regression tests for detours, rushing, standing and stale reads; browser perimeter updates.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 6. Preserve manual movement paths when declaring and targeting a Blitz

Issue: [#284](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/284).

## Abstract
Retain prior waypoints when selecting a standing opponent as Blitz target. A manually confirmed Blitz permits target-first automatic approach or waypoint-first manual approach, then confirmation.

## Objective
Resolve observation 6 on the existing batch branch.

## Context / Existing Behavior
Selecting a Blitz target overwrites manual waypoints; confirming a manual declaration prevents planning the approach.

## In Scope
- Browser Blitz intent plus native movement preview/commit.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Retain prior waypoints when selecting a standing opponent as Blitz target. A manually confirmed Blitz permits target-first automatic approach or waypoint-first manual approach, then confirmation.

## Acceptance Criteria
- Native rules declare the target before movement; requested waypoints are followed; targetless planning does not move or consume Blitz; rejected/undone plans remain safe.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
Browser Blitz intent plus native movement preview/commit.

## Validation
Regression and browser tests for target-first, waypoint-first, explicit declaration, adjacent/distant targets and retry.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 7. Complete Hit and Run after the selected movement square

Issue: [#285](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/285).

## Abstract
Expose valid Hit and Run square choices and advance the native skill sequence after selecting one.

## Objective
Resolve observation 7 on the existing batch branch.

## Context / Existing Behavior
Declining Hit and Run works, but accepting it and choosing a square hangs.

## In Scope
- Native skill steps and browser action projection.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Expose valid Hit and Run square choices and advance the native skill sequence after selecting one.
- Owner follow-up: show the same directional arrows as pushback/follow-up on selectable destinations and provide an option labelled exactly "Decline Hit and Run". Selecting an arrow commits its native square choice directly.
- Owner acceptance follow-up: offer destinations immediately after the block, without first asking whether to use Hit and Run. The separate decline button remains available in the centered pitch decision.
- Place the reminder and Decline Hit and Run button centrally over the board using follow-up's compact non-modal presentation. Keep the active player and destination arrows unobstructed and allow pitch panning.

## Acceptance Criteria
- Completing an eligible block immediately offers legal destination arrows and a "Decline Hit and Run" button. Selecting a legal square moves the player and continues; decline remains correct; invalid squares and duplicate input do not hang or move illegally.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
Native skill steps and browser action projection.

## Validation
Deterministic native/gateway skill-choice-to-square regression including ball handling and decline.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 8. Select and confirm a friendly Hand Off receiver on the pitch

Issue: [#286](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/286).

## Abstract
Clicking an eligible friendly player reviews the offered native Hand Off receiver action; Confirmed!/Space commits it.

## Objective
Resolve observation 8 on the existing batch branch.

## Context / Existing Behavior
Hand Off declaration consumes its turn allowance, but the receiver cannot be selected on pitch; debug action works.

## In Scope
- Browser friendly-player target mapping.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Clicking an eligible friendly player reviews the offered native Hand Off receiver action; Confirmed!/Space commits it.

## Acceptance Criteria
- Declaration, friendly target and confirmation complete a handoff using native legality; ineligible friendly players cannot be selected; no second declaration is consumed.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
Browser friendly-player target mapping.

## Validation
Browser target-to-command check plus focused native handoff coverage.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 9. Allow standing in place and routes returning to the starting square

Issue: [#287](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/287).

## Abstract
Select prone player, select its square and confirm to stand while retaining remaining movement. Permit legal routes ending on the starting square and apply stand-up handling to supported actions.

## Objective
Resolve observation 9 on the existing batch branch.

## Context / Existing Behavior
Prone players cannot stand without moving; a waypoint cannot target their own square or return there after a detour.

## In Scope
- Browser self-square input and server route/movement planning.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Select prone player, select its square and confirm to stand while retaining remaining movement. Permit legal routes ending on the starting square and apply stand-up handling to supported actions.

## Acceptance Criteria
- Stand-in-place charges native cost once; a route out and back executes; occupied other-player squares remain invalid; normal standing-player self-selection remains predictable.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
Browser self-square input and server route/movement planning.

## Validation
Regression/browser tests for prone stand, insufficient movement/native roll, detour return and later movement.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 10. Verify and fix both Get the Ref bribes in live inducements

Issue: [#288](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/288).

## Abstract
Trace actual kickoff award through persisted native state, projected resource counts and displayed inducements; repair the failing boundary.

## Objective
Resolve observation 10 on the existing batch branch.

## Context / Existing Behavior
A Get the Ref kickoff reported no bribe in either team's inducements; related previous work exists in #258.

## In Scope
- Kickoff handlers, resource/inducement projection and browser HUD.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Trace actual kickoff award through persisted native state, projected resource counts and displayed inducements; repair the failing boundary.

## Acceptance Criteria
- Both teams gain one usable bribe, existing bribes accumulate, UI updates immediately, and use/recovery retain correct counts.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
Kickoff handlers, resource/inducement projection and browser HUD.

## Validation
Run existing Get the Ref regression; cover actual kickoff and UI resource icon/count path.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 11. Clear eligible stunned players at the end of their coach's turn

Issue: [#289](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/289).

## Abstract
Keep a player stunned and unavailable through the owning coach's turn, then turn prone at its end. Players newly stunned during that same turn remain stunned until the appropriate later turn end.

## Objective
Resolve observation 11 on the existing batch branch.

## Context / Existing Behavior
Stunned appears to clear at turn start and shows an inactive prone player throughout that turn.

## In Scope
- Native turn lifecycle, player-state age and browser projection.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Keep a player stunned and unavailable through the owning coach's turn, then turn prone at its end. Players newly stunned during that same turn remain stunned until the appropriate later turn end.

## Acceptance Criteria
- Previously stunned players skip a full own turn; newly stunned players do not recover early; both coaches, drive/turn transitions and relevant rulesets remain correct.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
Native turn lifecycle, player-state age and browser projection.

## Validation
Native lifecycle regression for existing versus newly stunned, consecutive turns, both coaches and recovery.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.

## 12. Verify computer-player support for the multi-injury apothecary flow

Issue: [#290](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/290).

## Abstract
Exercise computer-player choice, resolution, decline and transport recovery for offered new apothecary actions; fix any unsupported decision.

## Objective
Resolve observation 12 on the existing batch branch.

## Context / Existing Behavior
The computer player's compatibility with the new apothecary flow needs review.

## In Scope
- computer-player policy/transport and native prompt contract.

## Out of Scope
- Unrelated gameplay, artwork and deployment changes.

## Functional Requirements
- Exercise computer-player choice, resolution, decline and transport recovery for offered new apothecary actions; fix any unsupported decision.

## Acceptance Criteria
- Computer player can choose or decline offered multi-injury apothecary actions and proceed through subsequent choices without loops or stale IDs.

## Constraints
- Use the existing branch; preserve unrelated changes and existing MUTP presentation.
- Follow native ruleset separation and existing protocol/security conventions.
- Add a user-facing change-list entry for changed behavior.
- Do not commit, push or deploy.

## Implementation Guidance
computer-player policy/transport and native prompt contract.

## Validation
Focused policy and transport tests using offered new action IDs, multiple injuries, decline, reconnect and retry.

## Completion Notes
Implemented or verified locally. See [the per-issue verification report](../verification/misc-fix-rollup-6.md) for regression evidence and practical limits; final broad checks are recorded there.
