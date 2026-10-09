# Improved player movement interaction flow

Reviewed, published and implemented on 2026-10-08. Owner manual validation is pending.

The range and movement-risk presentation below is superseded by the
[player movement markings rollback](player-movement-markings-removal.md).
Single-confirmation Move/Blitz, unified routes and waypoint undo remain in effect.

Feature branch: `codex/improve-player-movement-flow`. All five tickets are implemented together as unstaged working-tree changes. Existing unrelated changes are preserved. No staging, commit, push or deployment was performed.

## Agreed behavior

- Ordinary Move uses select player, select a legal destination, then Confirmed or Space once. Selecting or planning does not commit an activation.
- Show only the selected player's range. Unactivated own players use full allowance, the active own player uses remaining allowance, and finished own players show no range.
- Opponent inspection starts only when no player is selected. Ignore spent opponent activation for their next-turn range, while retaining current conditions. Stunned, rooted or otherwise movement-incapable opponents show zero range. Prone players lose three movement for standing unless Jump Up removes the cost.
- An opponent click with an eligible own player selected retains the direct Blitz shortcut before action commitment. Keep that own player selected and treat the opponent as an attack target, without displaying an opposition range. After an ordinary Move is committed, opponent clicks cannot change it into Blitz or Block. Clear local selection before inspecting an opponent; clearing UI proposals never revokes an accepted activation.
- For Blitz, select own player, select opposing target, review the approach, and confirm once to execute movement and proceed directly to the block. Manual Blitz declaration remains available. Required native game decisions are still made normally.
- Color each entered square independently. Earlier route risk does not change later square colors. Use established light/dark blue and yellow/orange/red/dark-red bands. Combined dodge and rush show both identified checks and target numbers using dodge color.
- All ordinary destination clicks, including adjacent ones, add waypoints. Replace waypoint numbers with dots, keep Move highlighted during ordinary route planning, and remove the separate planner-mode requirement.
- A right-click undoes the most recent waypoint and its generated span. Held right-button dragging continues pitch panning and cannot also undo.
- Keep native rules, permissions, interruption behavior, game logging and playback. Reuse native route ranking and forecasts; numeric success percentages remain outside this feature.

## Published tickets and dependencies

| Ticket | What it delivers | Blocked by | Triage label |
| --- | --- | --- | --- |
| [#230](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/230) | Show complete movement ranges for selected own players | None | ready-for-agent |
| [#231](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/231) | Inspect a selected opponent's next-turn movement range | #230 | ready-for-agent |
| [#232](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/232) | Activate and move to an adjacent destination with one confirmation | #230 | ready-for-agent |
| [#233](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/233) | Plan all movement with waypoint dots and right-click undo | #232 | ready-for-agent |
| [#234](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/234) | Preview and execute a target-based Blitz with one confirmation | #233 | ready-for-agent |

The five tickets remain open for owner review. GitHub owns issue state and discussion; the dependency order above guided the implementation.

## Ticket handoff

### T01: Show complete movement ranges for selected own players

GitHub: [#230](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/230)

## What to build

Selecting an own-team player shows every square that player could reach using native movement rules, before any activation is committed. The display is a read-only forecast and supplies the selected-player planning foundation used by later movement tickets.

## Acceptance criteria

- [ ] Selecting an unactivated eligible own player shows full available movement, including legal rushes; selecting the currently active player shows remaining movement; a finished own player shows no movement range.
- [ ] Retain current occupancy, posture, skills, weather and native movement restrictions. Account for three movement to stand from prone, except when Jump Up removes that cost; preserve any native standing or activation checks without rolling them during inspection.
- [ ] Show no-roll entry squares in light blue and rush-only entry squares in darker blue with the native Rush target. Dodge entry colors retain the established bands: yellow for no net penalty or a bonus, orange for -1, red for -2, dark red for -3 or worse.
- [ ] A square with both dodge and rush uses the dodge color and displays both identified checks and target numbers, such as D 3+ and R 2+.
- [ ] Colors and labels describe entry into each square on the native proposed path. An earlier dodge or rush must not propagate its color to later squares. Reuse current native route ranking; do not invent browser legality or success percentages.
- [ ] Selecting, changing or clearing a player, obtaining forecasts, or moving the camera never activates a player, spends movement, rolls dice, changes a checkpoint or adds game-log/transcript records.
- [ ] Only the selected player's range is displayed. Refresh or invalidate forecasts when authoritative state, conditions, selection or connection validity changes, and keep canonical targeting consistent in both coach views and supported pitch projections.
- [ ] Verify native allowance/forecast cases and state immutability; cover selection and full-range labels in browser tests, including prone/Jump Up, active/finished players, combined checks and safe entry after earlier risk.

## Blocked by

None (can start immediately).

## Delivery constraints

Use the existing MUTP styling, typography and themes. Preserve unrelated working-tree changes and native game rules, permissions and logging. Keep scope within movement, player selection, route planning and the agreed Blitz shortcut. Use the existing feature branch, or a new codex/ branch when working independently. Add a user-facing entry to the latest client ChangeList for delivered behavior. Self-review the implementation and provide focused automated evidence plus a manual-review handoff. Do not commit, push, merge or deploy without explicit authorization.

### T02: Inspect a selected opponent's next-turn movement range

GitHub: [#231](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/231)

## What to build

With no player currently selected, a coach can select an opposing player and see where that player could reach on their next turn under the current pitch conditions. Inspection never changes the acting player or makes an opponent actionable.

## Acceptance criteria

- [ ] Allow either coach to select an on-pitch opponent for inspection when local player selection is empty, including while it is the other coach's turn.
- [ ] Ignore the opponent's spent movement and completed activation when computing full next-turn allowance from their current square. Retain current occupancy, skills, posture, weather and other movement restrictions.
- [ ] Stunned, rooted or otherwise movement-incapable opponents show zero range. Prone opponents account for the three-movement standing cost, except with Jump Up.
- [ ] Show only the selected opponent's range, using the same per-square colors and combined Dodge/Rush targets as own-player forecasts.
- [ ] While any other player is selected, do not add an opposition range or a simultaneous inspection selection. Coaches must clear their selection before starting opponent inspection; the own-player opponent-click Blitz shortcut remains separate.
- [ ] Read-only opponent selection and forecast requests do not cancel an accepted native activation, submit commands, offer confirmation, change actor permissions, spend resources, or change the checkpoint, game log or transcript.
- [ ] Clearing inspection removes its range; selecting an own player returns to that player's normal selection and movement guidance.
- [ ] Verify both coach roles, completed opponent activation, prone/Jump Up, stunned/rooted zero range, selection gating, and zero native mutation through focused server and browser checks.

## Blocked by

- #230: Show complete movement ranges for selected own players (https://github.com/the-grognard-codes/fumbbl-rebuild/issues/230)

## Delivery constraints

Use the existing MUTP styling, typography and themes. Preserve unrelated working-tree changes and native game rules, permissions and logging. Keep scope within movement, player selection, route planning and the agreed Blitz shortcut. Use the existing feature branch, or a new codex/ branch when working independently. Add a user-facing entry to the latest client ChangeList for delivered behavior. Self-review the implementation and provide focused automated evidence plus a manual-review handoff. Do not commit, push, merge or deploy without explicit authorization.

### T03: Activate and move to an adjacent destination with one confirmation

GitHub: [#232](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/232)

## What to build

A coach can select an eligible own player, select a legal adjacent destination and press Confirmed or Space once. Move is the default proposal, and that single confirmation declares the action and executes movement through the normal engine.

## Acceptance criteria

- [ ] Selecting an eligible own player selects/highlights Move locally without committing an activation or requiring a separate action-locking confirmation.
- [ ] Clicking a legal adjacent destination creates a reviewed one-waypoint movement plan. Enable Confirmed only when its player, actor, revision, route and destination are valid.
- [ ] One Confirmed click or supported Space press executes both activation/declaration and the planned movement. No separate declaration confirmation or ordinary movement-step confirmation is required.
- [ ] Already active own movers can confirm another partial movement from their current square and remaining allowance without redeclaring the activation.
- [ ] Preserve native standing/activation checks, dodges, rushes, pickups, reactions, skill and team rerolls, turnovers, logging and ordered movement presentation. Pause only where normal engine decisions require it, and stop at accepted state after failure or invalidation.
- [ ] Before confirmation, cancellation or switching own players clears the pending proposal without a native mutation. A selected player without a valid destination cannot be activated merely by pressing Confirmed or Space.
- [ ] An ordinary committed Move cannot become a Blitz or Block through an opponent click. No opposition inspection range appears while an own player remains selected.
- [ ] Guard repeated confirmation, retries, stale revisions, disconnects, pending mutations, suspended matches and read-only access so declaration or movement cannot execute twice.
- [ ] Verify the three-click journey, Space equivalence, pre-confirmation state immutability, already-active continuation, cancellation, double-confirm protection and representative native interruptions.

## Blocked by

- #230: Show complete movement ranges for selected own players (https://github.com/the-grognard-codes/fumbbl-rebuild/issues/230)

## Delivery constraints

Use the existing MUTP styling, typography and themes. Preserve unrelated working-tree changes and native game rules, permissions and logging. Keep scope within movement, player selection, route planning and the agreed Blitz shortcut. Use the existing feature branch, or a new codex/ branch when working independently. Add a user-facing entry to the latest client ChangeList for delivered behavior. Self-review the implementation and provide focused automated evidence plus a manual-review handoff. Do not commit, push, merge or deploy without explicit authorization.

### T04: Plan all movement with waypoint dots and right-click undo

GitHub: [#233](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/233)

## What to build

Ordinary movement uses one route-planning flow for adjacent and distant destinations. Coaches add waypoints directly on the pitch, review the complete native path and confirm once, without selecting a separate Plan path mode.

## Acceptance criteria

- [ ] Remove the requirement to select Plan path separately. Every legal destination click, including an adjacent square, is a waypoint proposal; later legal square clicks extend the pending route rather than cancel it.
- [ ] A distant destination obtains the native proposed span from the selected player's current square or last waypoint. Retain existing legal manual waypoints, native route ranking, allowances and route validation.
- [ ] Render each coach-added waypoint as a simple dot on the route line. Remove route/waypoint numbering while preserving actual Dodge/Rush targets, other native movement-check information and accessible route descriptions.
- [ ] Keep the Move action highlighted while an ordinary movement route is being planned.
- [ ] A right-click without a camera drag removes the most recently added waypoint and its generated route span, then refreshes the preview. Removing the last waypoint clears the route and disables movement confirmation while retaining player selection.
- [ ] Right-click with no waypoint performs no undo. Held right-button dragging continues pitch panning; release, pointer cancellation and capture loss do not produce a spurious undo or consume the next primary click.
- [ ] Retain functional keyboard undo/clear and normal camera controls. Camera gestures cannot select a player, add waypoints or commit movement.
- [ ] One confirmation executes the valid partial or full route through the native engine, retaining existing interruption, continuation, logging, retry and stale-preview safeguards.
- [ ] Verify adjacent/distant/multiple-waypoint routes, waypoint-span undo, no-waypoint undo, right-drag coexistence and cancellation, dot rendering, target-label readability and canonical targeting in both coach views and pitch projections.

## Blocked by

- #232: Activate and move to an adjacent destination with one confirmation (https://github.com/the-grognard-codes/fumbbl-rebuild/issues/232)

## Delivery constraints

Use the existing MUTP styling, typography and themes. Preserve unrelated working-tree changes and native game rules, permissions and logging. Keep scope within movement, player selection, route planning and the agreed Blitz shortcut. Use the existing feature branch, or a new codex/ branch when working independently. Add a user-facing entry to the latest client ChangeList for delivered behavior. Self-review the implementation and provide focused automated evidence plus a manual-review handoff. Do not commit, push, merge or deploy without explicit authorization.

### T05: Preview and execute a target-based Blitz with one confirmation

GitHub: [#234](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/234)

## What to build

Keep the direct Blitz shortcut: select an eligible own player, click an opposing target, review the proposed approach, then confirm once. That confirmation declares Blitz, executes the reviewed movement and proceeds directly to the native block action. Manual Blitz declaration remains available.

## Acceptance criteria

- [ ] Where native Blitz is legally available before an own player's action is committed, clicking an opposing target proposes Blitz and a native legal approach path without requiring the Blitz button first.
- [ ] Keep the own player selected during the Blitz proposal; the opponent is an attack target, so no opposition movement range is displayed.
- [ ] Show the proposed approach before confirmation, including the native movement-check colors/targets and allowance needed for the block. Retain native standing, rush, occupancy, target and block-cost rules.
- [ ] A single Confirmed click or supported Space press executes the declared Blitz, reviewed route and native block action at arrival. Do not introduce a separate action-locking, route-execution or block-start confirmation.
- [ ] Mandatory native reroll, reaction, block-die, push and follow-up choices remain available as required by game rules. The no-extra-click shortcut refers to starting movement and the block, not removing required game choices.
- [ ] Preserve the normal manual method for declaring Blitz. During a declared Blitz, an opponent can be targeted for a block only while the native block remains available.
- [ ] During an ordinary committed Move, opponent clicks do not propose a Blitz, Block or opposition range. Opponent inspection starts only after clearing local player selection.
- [ ] Do not execute a block after terminal movement failure, lost block availability, invalid target or invalidated remaining path. Continue only when native decisions permit the reviewed remainder and block.
- [ ] Cancel unconfirmed Blitz proposals without native mutation, preserve normal game logging/playback, and guard double confirmations, retries, stale state, disconnects and recovery against duplicated movement or blocks.
- [ ] Verify the direct shortcut with adjacent and distant targets, manual Blitz compatibility, unavailable/spent Blitz rejection, one-confirmation movement-plus-block, and failed/paused movement with no premature block.

## Blocked by

- #233: Plan all movement with waypoint dots and right-click undo (https://github.com/the-grognard-codes/fumbbl-rebuild/issues/233)

## Delivery constraints

Use the existing MUTP styling, typography and themes. Preserve unrelated working-tree changes and native game rules, permissions and logging. Keep scope within movement, player selection, route planning and the agreed Blitz shortcut. Use the existing feature branch, or a new codex/ branch when working independently. Add a user-facing entry to the latest client ChangeList for delivered behavior. Self-review the implementation and provide focused automated evidence plus a manual-review handoff. Do not commit, push, merge or deploy without explicit authorization.

## Acceptance evidence

All five published issue bodies and titles match this handoff, and all four native blocking edges were read back and verified. The acceptance checkboxes above remain available for owner manual validation.

Implemented native read-only selected-player ranges, revision-bound movement previews, and a single retained Move/Blitz mutation. Native route continuation handles activation, movement and block initiation; existing required game choices remain in place. The browser selects Move locally, renders per-entry range checks and route dots, and supports right-click undo alongside right-drag camera panning. The public V2 contract and latest client change list are updated.

### Affected checks

| Area | Automated evidence |
| --- | --- |
| Browser protocols, eligibility, retry and projection contracts | `npm test`: 238 tests passed; includes new native fixture decoding, movement plan correlation and exact retained-request retry |
| Playable bundle | `npm exec tsc -- --noEmit` and direct Vite play build passed |
| New interaction flow | `node test/movement-flow-ui.mjs`: native-backed own/opponent inspection, adjacent/distant Move and Blitz, multiple waypoint spans, undo, cancellation, Space and repeated-confirm guards passed |
| Forecast rendering and camera interaction | `node --experimental-strip-types test/route-check-ui.mjs`: 21 native forecast cases in both coach views at all four angle presets passed, including combined targets, overlapping range/path squares and dots on the route line |
| Existing movement checks | `node --experimental-strip-types test/movement-checks-ui.mjs`: 24 native pickup, ball-contact, reaction and jump cases passed in both coach views at every angle preset |
| Existing workflows affected by selection | Pass, teammate, end-player-action and projected-pitch interaction scripts passed; Pass also covers replacing an unconfirmed route with a legal recipient proposal |
| Native rules and composite execution | 10 focused modifier, route planner, V2 adapter and movement-session Maven tests passed; client-logic/common compilation also passed |

Self-review covered native permissions, immutable inspection, stale plans, retries, durable continuation, local cancellation and interaction with declared actions. Independent native review found low-MA standing forecasts and Blitz block-cost reservation issues; both were corrected with regression coverage. Further integration review preserved movement during declared Pass and other native movement actions and moved waypoint dots onto the route line without obscuring roll targets.

The focused native command was `mvn -pl ffb-server -am test -Dtest=DodgeModifierFactoryTest,RoutePlannerTest,SetupSessionMovementTest,BrowserV2AdapterTest#movementReadsAuthorizeBothCoachesAndRejectSpectators -Dsurefire.failIfNoSpecifiedTests=false`. Its cases include own/opponent immutable reads, off-turn inspection, active Pass continuation, low-MA standing, Blitz block reservation, invalid intent rejected before activation, and exact retries. A deterministic failed Dodge pauses a composite Blitz at a native team reroll; recovery with a declined reroll clears the route without a block, while an accepted reroll resumes movement and starts the native block. Repeated requests remain duplicates in both cases.

The full Maven suite and exhaustive posture/skill combinations were not run. The owner will validate gameplay manually using the cases below.

### Manual review

1. With either coach, select an unactivated own player, click an adjacent or distant destination, then Confirmed or Space. Check that selection and planning leave the game log unchanged and one confirmation performs the native movement.
2. Add multiple waypoints. Check the dots and Dodge/Rush labels, right-click undo, Backspace and Escape; hold and drag the right button to pan in both coach views and at different camera angles.
3. Inspect an opponent with no player selected. Check spent, prone, Jump Up, stunned and rooted players. Clear selection before inspecting another opponent. Check active own remaining allowance and finished own zero allowance.
4. Select own player, select an opposing target and confirm the reviewed Blitz approach. Check both adjacent and distant targets, required native choices, movement failure and the normal manual Blitz method. Check that an ordinary committed Move cannot become a Blitz.
5. Check a declared Pass or other action that allows movement, and confirm that movement leaves the declaration intact. Exercise reconnect/retry while a movement action is pending.

The normal asset-sync prebuild was not run because it writes the user's unrelated generated stadium catalog. The playable build was run directly instead. Existing site output and unrelated working-tree changes were preserved.
