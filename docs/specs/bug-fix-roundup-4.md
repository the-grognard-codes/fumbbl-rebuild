# Bug fix roundup #4

Prepared 2026-10-24. Single working branch: `fix/bug-fix-roundup-4`.
Base: `31465d14b`, matching local `main` and `origin/main` at preparation.
The branch already existed when this task began and the checkout was clean.

The authorized deliverable includes ten individual GitHub issues, implementation,
self-review and validation on one working branch. Changes remain uncommitted for
review; commits, pushes, PRs, merging and deployment were not authorized.
Results and verification boundaries are recorded in [the outcome report](bug-fix-roundup-4-outcome.md).
GitHub owns issue state; this file mirrors the scope and acceptance criteria.

## Ticket index

The owner resolved #344, #346, #348, #349, #350, #352 and #353 after review.
#345, #347 and #351 remain open; new [#354](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/354)
tracks the bottom-aligned log-dice preview. See the
[review follow-up](bug-fix-roundup-4-followup.md).
The owner confirmed the route-safety definition for item 10 on 2026-10-24.

- [x] [#344 Keep apothecary-saved KO players stunned through their next active-team turn](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/344)
- [ ] [#345 Allow unactivated standing and prone players to Blitz adjacent opponents directly](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/345)
- [x] [#346 Prevent position-changing hover effects from oscillating under a stationary pointer](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/346)
- [ ] [#347 Allow Solid Defence players moved to reserves to redeploy legally](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/347)
- [x] [#348 Scale game-event-log dice with the selected text size](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/348)
- [x] [#349 Center log d8 values and use a triangular d16 face that fits every value](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/349)
- [x] [#350 Display each armor and injury roll once with both d6 on one row](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/350)
- [ ] [#351 Resolve BB2025 Multiple Block in selected target order with clear targeting guidance](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/351)
- [x] [#352 Start every drive with players facing the opposing end zone](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/352)
- [x] [#353 Prefer equal-length safe movement routes that avoid the grounded ball](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/353)

## Item 1: Keep apothecary-saved KO players stunned through their next active-team turn

GitHub issue: [#344](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/344); preparation status: `ready-for-agent`.

### Abstract
Bug fix roundup #4, item 1. One issue per user-reported item; all implementation belongs on `fix/bug-fix-roundup-4`.

### Objective
Keep an apothecary-saved KO player on the pitch in the correct stunned state and preserve the complete required recovery turn.

### Context / Existing Behavior
A player on the active team is knocked down, has armor broken, and suffers a Knocked Out injury. Choosing Use Apothecary (Yes) leaves the player prone instead of stunned.

### In Scope
- An apothecary used to retain a knocked-out player on the pitch makes that player stunned, not merely prone.
- If the player becomes stunned during their own team's active turn, they remain stunned for the entirety of their next team turn; the remainder of the current turn must not count as that full turn.
- Preserve normal apothecary use, injury outcomes, and stun recovery for players on the inactive team.

### Out of Scope
- Unrelated gameplay or visual redesign.
- Release, deployment, or changes to unrelated rulesets.

### Functional Requirements
1. An apothecary used to retain a knocked-out player on the pitch makes that player stunned, not merely prone.
2. If the player becomes stunned during their own team's active turn, they remain stunned for the entirety of their next team turn; the remainder of the current turn must not count as that full turn.
3. Preserve normal apothecary use, injury outcomes, and stun recovery for players on the inactive team.

### Acceptance Criteria
- [ ] Reproduce the reported active-team KO and accept the apothecary: the same player remains on the same pitch square and is stunned.
- [ ] Advance through the current turn and the player's entire next team turn: the player cannot activate and does not recover early.
- [ ] At the rules-correct recovery boundary the player becomes prone; declining the apothecary still resolves the KO normally.

### Constraints
- Use the single roundup branch `fix/bug-fix-roundup-4`; preserve unrelated changes.
- Preserve MUTP styling, existing controls, and Android, Windows, and Linux support.
- Keep ruleset-specific changes scoped correctly; do not change other rulesets or inherit between ruleset implementations.
- Add a user-facing entry to the latest VersionChangeList for the eventual implementation.
- Ticket preparation does not authorize committing, pushing, PR creation, merging, or deployment.

### Implementation Guidance
Trace injury/apothecary resolution and stun turn bookkeeping together. Confirm exact BB2025 timing against the project's rules source before implementing.

### Validation
Add native regression coverage for active-team versus inactive-team timing, accepting versus declining the apothecary, and the turn boundary. Verify the browser state and sprite reflect the authoritative stunned state.
Run focused regressions first, followed by the affected native/game-server build and browser checks required by the delivery workflow. Record evidence and remaining gaps.

### Completion Notes
The active-team KO/apothecary failure did not reproduce in the current native engine. Added regressions for active/inactive team timing, accepting/declining, both coach projections, staying on the same square, and remaining stunned throughout the next own turn. No engine change was justified.

Implementation and validation results: [outcome report](bug-fix-roundup-4-outcome.md).
The owner validated this behavior and closed the GitHub issue as resolved.


---

## Item 2: Allow unactivated standing and prone players to Blitz adjacent opponents directly

GitHub issue: [#345](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/345); preparation status: `ready-for-agent`.

### Abstract
Bug fix roundup #4, item 2. One issue per user-reported item; all implementation belongs on `fix/bug-fix-roundup-4`.

### Objective
Allow a legal adjacent-target Blitz without artificial movement and permit remaining movement after the block resolves.

### Context / Existing Behavior
An unactivated standing or prone player cannot declare a Blitz against an adjacent opponent directly, but can do so after planning movement away and back.

### In Scope
- Offer the explicit Blitz action for eligible unactivated standing and prone players when the team's Blitz remains available, even with zero displacement before the block.
- Apply all normal Blitz and stand-up movement costs, eligibility restrictions, and team Blitz consumption.
- Stop pre-block movement planning at the block target. After the block and its consequences fully resolve, allow further legal movement using the remaining allowance.

### Out of Scope
- Unrelated gameplay or visual redesign.
- Release, deployment, or changes to unrelated rulesets.

### Functional Requirements
1. Offer the explicit Blitz action for eligible unactivated standing and prone players when the team's Blitz remains available, even with zero displacement before the block.
2. Apply all normal Blitz and stand-up movement costs, eligibility restrictions, and team Blitz consumption.
3. Stop pre-block movement planning at the block target. After the block and its consequences fully resolve, allow further legal movement using the remaining allowance.

### Acceptance Criteria
- [ ] Standing and prone eligible players can select an adjacent opponent, explicitly declare Blitz, confirm, and resolve the block without moving away first.
- [ ] A completed adjacent Blitz consumes the team allowance and movement costs correctly; unavailable Blitz and ineligible players remain blocked.
- [ ] After resolution the coach can plan and execute remaining legal movement; turnover or exhausted movement prevents continuation as usual.

### Constraints
- Use the single roundup branch `fix/bug-fix-roundup-4`; preserve unrelated changes.
- Preserve MUTP styling, existing controls, and Android, Windows, and Linux support.
- Keep ruleset-specific changes scoped correctly; do not change other rulesets or inherit between ruleset implementations.
- Add a user-facing entry to the latest VersionChangeList for the eventual implementation.
- Ticket preparation does not authorize committing, pushing, PR creation, merging, or deployment.

### Implementation Guidance
Preserve the ordinary adjacent Block default while making explicit Blitz available. Trace browser planning through native action declaration.

Related: #234 (target-based Blitz preview and execution), #265 (adjacent Block default).

### Validation
Cover standing/prone starts, unused/used Blitz, block movement cost, stand-up cost, post-block movement, and turnover. Exercise the actual browser declaration and confirmation flow.
Run focused regressions first, followed by the affected native/game-server build and browser checks required by the delivery workflow. Record evidence and remaining gaps.

### Completion Notes
Implemented target-first adjacent Blitz for standing and prone unactivated players. Browser checks cover target retention and one confirmation; native flows verify no displacement, correct stand/block cost, consumed Blitz and legal movement after resolution.

Implementation and validation results: [outcome report](bug-fix-roundup-4-outcome.md).
GitHub remains open pending review and an authorized delivery step.

---

## Item 3: Prevent position-changing hover effects from oscillating under a stationary pointer

GitHub issue: [#346](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/346); preparation status: `ready-for-agent`.

### Abstract
Bug fix roundup #4, item 3. One issue per user-reported item; all implementation belongs on `fix/bug-fix-roundup-4`.

### Objective
Keep position-changing hover feedback stable and clickable at control boundaries.

### Context / Existing Behavior
Some buttons and menu items move on hover. A stationary cursor at the affected edge repeatedly falls outside and inside the moved control, causing rapid hover/unhover flicker.

### In Scope
- Preserve a stable pointer interaction region or equivalent allowance when hover visuals shift a button or menu item.
- A stationary pointer cannot cause an endless enter/leave loop due solely to the hover transform.
- Preserve focus, keyboard activation, click/tap behavior, visual styling, and normal hover exit when the pointer actually leaves.

### Out of Scope
- Unrelated gameplay or visual redesign.
- Release, deployment, or changes to unrelated rulesets.

### Functional Requirements
1. Preserve a stable pointer interaction region or equivalent allowance when hover visuals shift a button or menu item.
2. A stationary pointer cannot cause an endless enter/leave loop due solely to the hover transform.
3. Preserve focus, keyboard activation, click/tap behavior, visual styling, and normal hover exit when the pointer actually leaves.

### Acceptance Criteria
- [ ] Hold the pointer along every affected edge and corner: the control reaches a stable visual state without rapid oscillation.
- [ ] A click at those positions activates the intended control once; neighboring controls remain usable.
- [ ] Keyboard focus and touch interaction continue to work without relying on hover.

### Constraints
- Use the single roundup branch `fix/bug-fix-roundup-4`; preserve unrelated changes.
- Preserve MUTP styling, existing controls, and Android, Windows, and Linux support.
- Keep ruleset-specific changes scoped correctly; do not change other rulesets or inherit between ruleset implementations.
- Add a user-facing entry to the latest VersionChangeList for the eventual implementation.
- Ticket preparation does not authorize committing, pushing, PR creation, merging, or deployment.

### Implementation Guidance
Prefer fixing shared hit-region or wrapper behavior where appropriate. A larger interactive region must not obscure neighboring controls.

### Validation
Identify shared and component-specific position-changing hover styles. Add a focused browser regression for stationary edge hovering and activation, and inspect representative site menu and match controls at supported desktop/tablet layouts.
Run focused regressions first, followed by the affected native/game-server build and browser checks required by the delivery workflow. Record evidence and remaining gaps.

### Completion Notes
Removed position-changing hover translations from affected lobby/site controls. Production-browser checks cover stationary edge/corner pointers, desktop/tablet widths, keyboard and touch activation.

Implementation and validation results: [outcome report](bug-fix-roundup-4-outcome.md).
The owner validated this behavior and closed the GitHub issue as resolved.

---

## Item 4: Allow Solid Defence players moved to reserves to redeploy legally

GitHub issue: [#347](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/347); preparation status: `ready-for-agent`.

### Abstract
Bug fix roundup #4, item 4. One issue per user-reported item; all implementation belongs on `fix/bug-fix-roundup-4`.

### Objective
Complete Solid Defence redeployment from reserves while enforcing legal setup.

### Context / Existing Behavior
Solid Defence removes the selected redeployment players from the pitch into reserves. They cannot be placed back on the pitch, leaving too few players deployed and preventing confirmation.

### In Scope
- Players selected for the Solid Defence redeployment and moved into reserves remain available to select and place back on the pitch.
- Apply the kickoff event's permitted player selection and redeployment rules.
- Allow confirmation only when deployment is legal; preserve normal player-count, line-of-scrimmage, half, and wide-zone constraints as applicable.

### Out of Scope
- Unrelated gameplay or visual redesign.
- Release, deployment, or changes to unrelated rulesets.

### Functional Requirements
1. Players selected for the Solid Defence redeployment and moved into reserves remain available to select and place back on the pitch.
2. Apply the kickoff event's permitted player selection and redeployment rules.
3. Allow confirmation only when deployment is legal; preserve normal player-count, line-of-scrimmage, half, and wide-zone constraints as applicable.

### Acceptance Criteria
- [ ] Trigger Solid Defence, select the permitted players, remove them to reserves, and redeploy them successfully.
- [ ] Legal deployment can be confirmed and the kickoff/game flow continues without a hung state.
- [ ] Illegal deployment remains unconfirmable with actionable feedback, and ineligible reserves cannot bypass event restrictions.

### Constraints
- Use the single roundup branch `fix/bug-fix-roundup-4`; preserve unrelated changes.
- Preserve MUTP styling, existing controls, and Android, Windows, and Linux support.
- Keep ruleset-specific changes scoped correctly; do not change other rulesets or inherit between ruleset implementations.
- Add a user-facing entry to the latest VersionChangeList for the eventual implementation.
- Ticket preparation does not authorize committing, pushing, PR creation, merging, or deployment.

### Implementation Guidance
Trace kickoff setup phase permissions and reserve selection through the authoritative engine and browser legal-action projection. Use the BB2025 rules source for event-specific limits.

### Validation
Add an engine-to-browser regression for selection, reserve availability, redeployment, illegal confirmation, legal confirmation, and continued play. Include fewer available players and the applicable event selection limit.
Run focused regressions first, followed by the affected native/game-server build and browser checks required by the delivery workflow. Record evidence and remaining gaps.

### Completion Notes
Selected Solid Defence reserves can use native placement actions again. Both coach orientations are covered through removal and redeployment; native tests retain missing-player and line-of-scrimmage legality checks.

Implementation and validation results: [outcome report](bug-fix-roundup-4-outcome.md).
GitHub remains open pending review and an authorized delivery step.

---

## Item 5: Scale game-event-log dice with the selected text size

GitHub issue: [#348](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/348); preparation status: `ready-for-agent`.

### Abstract
Bug fix roundup #4, item 5. One issue per user-reported item; all implementation belongs on `fix/bug-fix-roundup-4`.

### Objective
Keep log dice proportional to the selected text size and preserve coherent line sizing.

### Context / Existing Behavior
Changing the game event log's text size changes the text but leaves the embedded dice at a fixed size.

### In Scope
- All inline log dice scale up and down with the game log text-size selector.
- Dice align with surrounding text and use appropriate dimensions so they do not impose a fixed oversized line height or clip the line.
- Apply the size consistently to existing and newly added log entries.

### Out of Scope
- Unrelated gameplay or visual redesign.
- Release, deployment, or changes to unrelated rulesets.

### Functional Requirements
1. All inline log dice scale up and down with the game log text-size selector.
2. Dice align with surrounding text and use appropriate dimensions so they do not impose a fixed oversized line height or clip the line.
3. Apply the size consistently to existing and newly added log entries.

### Acceptance Criteria
- [ ] At every supported log text size, inline dice and text scale together without overlap, clipping, or oversized line gaps.
- [ ] Mixed text/dice and multi-dice entries retain sensible baseline and line alignment.
- [ ] Changing size updates already-visible entries; new entries use the same size.

### Constraints
- Use the single roundup branch `fix/bug-fix-roundup-4`; preserve unrelated changes.
- Preserve MUTP styling, existing controls, and Android, Windows, and Linux support.
- Keep ruleset-specific changes scoped correctly; do not change other rulesets or inherit between ruleset implementations.
- Add a user-facing entry to the latest VersionChangeList for the eventual implementation.
- Ticket preparation does not authorize committing, pushing, PR creation, merging, or deployment.

### Implementation Guidance
Reuse the log typography scale and shared inline dice rendering; preserve pitch dice sizing independently.

Related: #137 (game-log font size selector). Coordinate with this roundup's d8/d16 face issue where a shared component is involved; no blocking dependency is assumed.

### Validation
Use browser coverage and visual inspection at every supported size with d6, block dice, d8, d16, multiple dice, wrapping lines, and live appended events.
Run focused regressions first, followed by the affected native/game-server build and browser checks required by the delivery workflow. Record evidence and remaining gaps.

### Completion Notes
Game-log dice now inherit text-size scaling. Browser checks cover each text size, line wrapping, live appends and relative line geometry.

Implementation and validation results: [outcome report](bug-fix-roundup-4-outcome.md).
The owner validated this behavior and closed the GitHub issue as resolved.

---

## Item 6: Center log d8 values and use a triangular d16 face that fits every value

GitHub issue: [#349](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/349); preparation status: `ready-for-agent`.

### Abstract
Bug fix roundup #4, item 6. One issue per user-reported item; all implementation belongs on `fix/bug-fix-roundup-4`.

### Objective
Render readable, centered d8 and d16 log values using a simple triangular face for both dice.

### Context / Existing Behavior
Game-event-log d8 numbers can be off center. Two-digit d16 values fit or align incorrectly in the current face.

### In Scope
- Center every d8 numeric value within its triangular face.
- Replace the log d16 face with the same simple triangle style as the d8.
- Fit and center every legal d16 result, including two-digit values, within the triangle without clipping or crossing its outline.

### Out of Scope
- Unrelated gameplay or visual redesign.
- Release, deployment, or changes to unrelated rulesets.

### Functional Requirements
1. Center every d8 numeric value within its triangular face.
2. Replace the log d16 face with the same simple triangle style as the d8.
3. Fit and center every legal d16 result, including two-digit values, within the triangle without clipping or crossing its outline.

### Acceptance Criteria
- [ ] All d8 values 1-8 and all d16 values 1-16 are readable and centered within the face.
- [ ] The d16 uses the same simple triangular face language as the d8; single- and double-digit values fit.
- [ ] The result holds at all supported log text sizes and preserves inline alignment.

### Constraints
- Use the single roundup branch `fix/bug-fix-roundup-4`; preserve unrelated changes.
- Preserve MUTP styling, existing controls, and Android, Windows, and Linux support.
- Keep ruleset-specific changes scoped correctly; do not change other rulesets or inherit between ruleset implementations.
- Add a user-facing entry to the latest VersionChangeList for the eventual implementation.
- Ticket preparation does not authorize committing, pushing, PR creation, merging, or deployment.

### Implementation Guidance
Use geometric/optical centering appropriate to the triangular interior and allow enough width for two digits. Scope this request to game-event-log dice.

Related: this roundup's log dice scaling issue. Shared renderer changes should satisfy both tickets.

### Validation
Render a value matrix covering d8 1-8 and d16 1-16 at all supported text sizes. Inspect actual browser log output for clipping, centering, contrast, and alignment.
Run focused regressions first, followed by the affected native/game-server build and browser checks required by the delivery workflow. Record evidence and remaining gaps.

### Completion Notes
Log d8 and d16 now share a flat triangle with centered glyph bounds. Browser checks cover every d8 value 1–8 and d16 value 1–16 at every text size.

Implementation and validation results: [outcome report](bug-fix-roundup-4-outcome.md).
The owner validated this behavior and closed the GitHub issue as resolved.

---

## Item 7: Display each armor and injury roll once with both d6 on one row

GitHub issue: [#350](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/350); preparation status: `ready-for-agent`.

### Abstract
Bug fix roundup #4, item 7. One issue per user-reported item; all implementation belongs on `fix/bug-fix-roundup-4`.

### Objective
Present each actual armor/injury roll once, with its two d6 side by side.

### Context / Existing Behavior
Each armor or injury roll appears twice over the pitch: once normally and then again with each die on its own row.

### In Scope
- A single authoritative armor or injury roll generates one pitch presentation.
- Keep both d6 from that roll on the same horizontal row.
- Keep distinct actual rolls and rerolls visible normally; removing duplicated presentation must not suppress game-log evidence or later injury rolls.

### Out of Scope
- Unrelated gameplay or visual redesign.
- Release, deployment, or changes to unrelated rulesets.

### Functional Requirements
1. A single authoritative armor or injury roll generates one pitch presentation.
2. Keep both d6 from that roll on the same horizontal row.
3. Keep distinct actual rolls and rerolls visible normally; removing duplicated presentation must not suppress game-log evidence or later injury rolls.

### Acceptance Criteria
- [ ] An armor break followed by injury shows one horizontal two-d6 armor roll and one horizontal two-d6 injury roll.
- [ ] A non-breaking armor roll shows once and does not manufacture an injury presentation.
- [ ] Legitimate rerolls remain distinct and correctly ordered; no second stacked rendering of a roll appears.

### Constraints
- Use the single roundup branch `fix/bug-fix-roundup-4`; preserve unrelated changes.
- Preserve MUTP styling, existing controls, and Android, Windows, and Linux support.
- Keep ruleset-specific changes scoped correctly; do not change other rulesets or inherit between ruleset implementations.
- Add a user-facing entry to the latest VersionChangeList for the eventual implementation.
- Ticket preparation does not authorize committing, pushing, PR creation, merging, or deployment.

### Implementation Guidance
Determine whether duplication occurs in event emission, report adaptation, presentation queueing, or simultaneous renderers; fix the source and preserve event identity/order.

### Validation
Trace authoritative events through pitch presentation and run deterministic browser cases for armor-only, armor-then-injury, rerolls, and successive players. Verify log events remain complete.
Run focused regressions first, followed by the affected native/game-server build and browser checks required by the delivery workflow. Record evidence and remaining gaps.

### Completion Notes
Outcome-only armor/injury entries no longer replay the native rolls, and paired d6 share one row label. Browser playback checks cover armor, injury, rerolls and successive players.

Implementation and validation results: [outcome report](bug-fix-roundup-4-outcome.md).
The owner validated this behavior and closed the GitHub issue as resolved.

---

## Item 8: Resolve BB2025 Multiple Block in selected target order with clear targeting guidance

GitHub issue: [#351](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/351); preparation status: `ready-for-agent`.

### Abstract
Bug fix roundup #4, item 8. One issue per user-reported item; all implementation belongs on `fix/bug-fix-roundup-4`.

### Objective
Guide selection of two targets and resolve both blocks in coach-selected order according to BB2025.

### Context / Existing Behavior
Multiple Block highlights viable targets but hangs after a target is confirmed. The UI does not explain how to select the two targets.

### In Scope
- When a coach chooses Multiple Block, show a visible instruction to select the first and second targets and show the current selection/order.
- Accept two legal distinct targets, preserving coach selection order as the block resolution order.
- On confirmation resolve the first block and then the second according to the current BB2025 rules source, including skill restrictions, modifiers, outcome consequences, and rules-required early termination.
- The flow must leave the targeting phase and continue the game without a stuck confirmation state.

### Out of Scope
- Unrelated gameplay or visual redesign.
- Release, deployment, or changes to unrelated rulesets.

### Functional Requirements
1. When a coach chooses Multiple Block, show a visible instruction to select the first and second targets and show the current selection/order.
2. Accept two legal distinct targets, preserving coach selection order as the block resolution order.
3. On confirmation resolve the first block and then the second according to the current BB2025 rules source, including skill restrictions, modifiers, outcome consequences, and rules-required early termination.
4. The flow must leave the targeting phase and continue the game without a stuck confirmation state.

### Acceptance Criteria
- [ ] An eligible player can declare Multiple Block, identify target 1 and target 2 through visible guidance, confirm, and reach dice resolution.
- [ ] Swapping selection order swaps which opponent is resolved first.
- [ ] Both blocks and required choices resolve correctly under BB2025, and the game advances to the proper next state.
- [ ] Illegal, duplicate, or incomplete selections cannot produce a hung action; invalid selection is explained.

### Constraints
- Use the single roundup branch `fix/bug-fix-roundup-4`; preserve unrelated changes.
- Preserve MUTP styling, existing controls, and Android, Windows, and Linux support.
- Keep ruleset-specific changes scoped correctly; do not change other rulesets or inherit between ruleset implementations.
- Add a user-facing entry to the latest VersionChangeList for the eventual implementation.
- Ticket preparation does not authorize committing, pushing, PR creation, merging, or deployment.

### Implementation Guidance
Cite the exact project BB2025 rules source/section before implementation. Follow those mechanics rather than assuming older-edition behavior. Reuse the existing legal-target and decision UI flow.

### Validation
Add native rules/sequence tests and browser targeting/confirmation coverage. Cover target ordering, full resolution, first-block consequences affecting continuation, invalid targets, incomplete confirmation, and recovery into a decision state.
Run focused regressions first, followed by the affected native/game-server build and browser checks required by the delivery workflow. Record evidence and remaining gaps.

### Completion Notes
Multiple Block now guides first/second target selection, numbers selected targets and confirms the selected ordered native pair. Native regressions cover both orders, actual pushes, recovery and a first-block turnover without dropping the second block. Fixed missing BB2025 apothecary team ownership in checkpoints, including deterministic recovery of valid legacy empty steps.

Implementation and validation results: [outcome report](bug-fix-roundup-4-outcome.md).
GitHub remains open pending review and an authorized delivery step.

---

## Item 9: Start every drive with players facing the opposing end zone

GitHub issue: [#352](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/352); preparation status: `ready-for-agent`.

### Abstract
Bug fix roundup #4, item 9. One issue per user-reported item; all implementation belongs on `fix/bug-fix-roundup-4`.

### Objective
Initialize each team's players to face its opposing end zone when a drive begins.

### Context / Existing Behavior
Player facing carries over from previous movement or how players were dragged during drive setup.

### In Scope
- At each drive start, reset on-pitch players to face their team's opposing end zone regardless of earlier movement or setup drag direction.
- Determine facing from team attack direction rather than screen left/right or camera orientation.
- Apply the reset consistently for the opening drive, later touchdown drives, and halftime side changes while preserving normal facing updates during play.

### Out of Scope
- Unrelated gameplay or visual redesign.
- Release, deployment, or changes to unrelated rulesets.

### Functional Requirements
1. At each drive start, reset on-pitch players to face their team's opposing end zone regardless of earlier movement or setup drag direction.
2. Determine facing from team attack direction rather than screen left/right or camera orientation.
3. Apply the reset consistently for the opening drive, later touchdown drives, and halftime side changes while preserving normal facing updates during play.

### Acceptance Criteria
- [ ] Arrange players with varied setup-facing histories, start the drive, and observe both teams facing their respective opposing end zones.
- [ ] Repeat after a touchdown and a halftime/end switch: the new attack directions determine facing.
- [ ] Rotate or change camera view: world-space facing remains correct and subsequent normal movement updates facing normally.

### Constraints
- Use the single roundup branch `fix/bug-fix-roundup-4`; preserve unrelated changes.
- Preserve MUTP styling, existing controls, and Android, Windows, and Linux support.
- Keep ruleset-specific changes scoped correctly; do not change other rulesets or inherit between ruleset implementations.
- Add a user-facing entry to the latest VersionChangeList for the eventual implementation.
- Ticket preparation does not authorize committing, pushing, PR creation, merging, or deployment.

### Implementation Guidance
Initialize facing at the authoritative drive/setup boundary used by presentation. Preserve existing top-down sprite conventions.

Related: #144 (view-specific standing sprite and prone/stunned rendering).

### Validation
Add focused facing initialization regression coverage and browser visual checks for both teams, opening/later drives, side changes, and supported pitch views. Check kickoff setup/redeployment boundaries for stale facing.
Run focused regressions first, followed by the affected native/game-server build and browser checks required by the delivery workflow. Record evidence and remaining gaps.

### Completion Notes
Drive/setup/kickoff boundaries clear stale movement facings so players face the opposing end zone. Tests preserve facing during normal actions, turns and camera changes and cover both coaches in top-down and perspective views.

Implementation and validation results: [outcome report](bug-fix-roundup-4-outcome.md).
The owner validated this behavior and closed the GitHub issue as resolved.

---

## Item 10: Prefer equal-length safe movement routes that avoid the grounded ball

GitHub issue: [#353](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/353); preparation status: `ready-for-agent`.

### Abstract
Bug fix roundup #4, item 10. One issue per user-reported item; all implementation belongs on `fix/bug-fix-roundup-4`.

### Objective
Prevent unintentional pickup attempts caused by an automatically planned movement route crossing the grounded ball when an equal-length safe alternative exists.

### Context / Existing Behavior
Planning movement to a square beyond the grounded ball may route the player through the ball square without the coach explicitly selecting it.

### In Scope
- Prefer an equal-length safe route that avoids the grounded ball.
- Treat explicit selection of the ball square as intent to enter that square.
- Preserve the reported fallback: entering the ball square is allowed if no safe alternate route exists.
- Use the confirmed safety definition below when comparing alternate routes.

### Out of Scope
- Disabling deliberate pickup or changing pickup rules.
- Unrelated changes to route optimization or movement costs.
- Release or deployment.

### Functional Requirements
1. When an equal-length ball-free route requires no additional or harder Dodge, Rush, Jump, or Leap rolls than the existing route, automatically choose it.
2. Explicit selection of the ball square permits routing through that square and the normal pickup attempt.
3. If every ball-free alternative is riskier or longer, retain the existing legal route through the ball rather than increasing risk or distance.
4. Preserve explicit waypoints, legal movement limits, preview/execution consistency, and authoritative route validation.

### Acceptance Criteria
- [ ] An equal-length detour with no additional or harder movement rolls avoids an unselected grounded-ball square.
- [ ] Explicitly selecting the ball square permits normal entry and pickup.
- [ ] If every ball-free alternative is riskier or longer, the existing route through the ball remains selected.
- [ ] Other route restrictions, explicit waypoints, and destination selection remain intact.
- [ ] Preview and actual movement agree on whether the ball square is entered.
- [ ] An equal-length ball-free route with the same required movement rolls qualifies even when those rolls are not automatic successes; adding a roll or making a required roll harder does not qualify.

### Confirmed Decision
On 2026-10-24 the owner confirmed: "Yes—avoid the ball without adding risk or distance."

For this requirement, a safe alternate route has the same length and requires no additional or harder Dodge, Rush, Jump, or Leap rolls than the existing route. The alternate may still require movement rolls. If every ball-free alternative is riskier or longer, keep the existing legal route through the ball. Explicitly clicking the ball square always permits a legal pickup attempt.

Repository context: `ffb-server/src/main/java/com/fumbbl/ffb/server/match/RoutePlanner.java` currently defines its internal safe-route category using zero rolls and zero reactions, and ranks risk before distance. The confirmed ball-avoidance comparison must not be limited to that zero-roll category.

### Constraints
- Use the single roundup branch `fix/bug-fix-roundup-4`; preserve unrelated changes.
- Preserve MUTP styling and supported Android, Windows, and Linux behavior.
- Keep ruleset-specific behavior scoped correctly.
- Add a user-facing entry to the latest VersionChangeList for the eventual implementation.
- Ticket preparation does not authorize committing, pushing, PR creation, merging, or deployment.

### Implementation Guidance
Inspect route scoring, ball-handling state, and explicit waypoints together. Preserve existing route tie-breakers except where the confirmed ball-avoidance requirement requires a change.
Related: #260 (straight-route preference), #233 (movement waypoints). No blocking dependency on those tickets is asserted.

### Validation
Cover equal-length ball-free routes with the same movement checks, zero-roll detours, additional or harder Dodge/Rush/Jump/Leap rolls, only longer alternatives, unavoidable ball crossing, explicit ball selection, ball as final destination, absent/carried ball, and waypoint preservation. Exercise native route planning and the real browser preview/confirmation path.
Run focused regressions first, then affected native/game-server and browser checks; record evidence and remaining gaps.

### Completion Notes
Automatic routes use an equal-or-shorter bounded ball-free alternative only when per-kind movement-roll counts and difficulty do not increase. Explicit ball waypoints permit pickup; longer/riskier alternatives retain the baseline. Regressions cover equivalent nonzero Dodge/Rush profiles and equal aggregate odds with a harder individual check.

Implementation and validation results: [outcome report](bug-fix-roundup-4-outcome.md).
The owner validated this behavior and closed the GitHub issue as resolved.

## Follow-up: #355 spotted foul bribe decision

[GitHub issue](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/355).
Continue on `fix/bug-fix-roundup-4`. A spotted foul must offer the native bribe
use/decline choice to the fouling coach after Argue the Call is declined or fails.
Preserve native spending, success/failure, sending-off and turnover behavior.
Recover at both decision boundaries, including older saved bribe dialogs whose
browser action arrays were empty. Preserve the stored game and transcript.
Other native bribe phases and multiple-player end-of-drive choices are outside
this foul-specific correction. See the [follow-up report](bug-fix-roundup-4-followup.md)
for regression, review and validation evidence.
