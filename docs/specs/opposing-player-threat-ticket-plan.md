# Opposing player threat markings: ticket plan

Status: approved and published on 2026-10-10. Implementation, focused automated verification and code self-review are complete in the local working tree. Owner manual validation accepted the original feature; the requested combined-warning layout refinement is implemented and awaits owner recheck. All three GitHub issues remain open and labelled `ready-for-agent`.
Prepared 2026-10-10 on `feature/opposing-player-threat-tickets`.

## Confirmed decisions

- Selecting an on-pitch friendly player shows threats before activation and throughout an unfinished activation. A finished activation does not qualify.
- Show markings only during the selecting coach's regular turn or that coach's Charge! kickoff event. Exclude setup, other kickoff events, the opponent's turn, spectator viewing, replay, and full time. Charge! uses native event eligibility rather than ordinary-turn assumptions.
- Zone colors, Tackle symbols, and other-skill stripes have independent category controls. Each relevant skill has a control. All controls default to enabled and persist between games.
- The incomplete objective sentence ending in "The highlight should also" adds no requirement.
- Mark empty pitch squares only. Opposing sources must be on the pitch, standing, and not distracted. Use authoritative native tackle-zone status rather than infer it from display text.
- Color by the number of overlapping opposing tackle zones: one dark green, two yellow, three orange, four or more red. This is zone-count information, not a computed dodge target or success probability.
- Tackle uses a small hollow white rounded triangle outline containing a red T, matching current rushing geometry and size. Keep one Tackle marker per square. The owner's manual-review refinement centers combined rushing/Tackle markers equally around a slash `/` in the square; disabling Tackle recenters the lone rushing marker.
- The initial stripe skills are Prehensile Tail, Diving Tackle, Tentacles, and Shadowing. Mark skill presence even when a selected player's skills make a threat irrelevant. Arm Bar is excluded; Tackle alone never adds stripes.
- Use one consistent diagonal pattern per square for all players, including overlaps. When zone colors are disabled, enabled other-skill markings use thin neutral diagonal hatch lines without colored shading. Tackle symbols and other-skill markings remain independently controllable.
- One-zone dark green uses 50% opacity as requested in the objective. Calibrate the other color bands against the supplied screenshot for approximately 15% greater opacity, capped at 50%; precise remaining alpha values are a visual implementation choice subject to owner manual review. Render one composite fill per square so overlap changes color without increasing alpha.
- Add a new Game Menu tab named **Game Settings**, preserve MUTP typography/themes, and preserve existing gameplay and unrelated changes.
- Include self-review, focused automated verification, a user-facing ChangeList entry, and an owner manual-review handoff for implementation. No commit, push, merge, publication of application code, or deployment is authorized.

## Approval and interpretation

The owner approved all three tickets and their proposed dependencies. Clarification responses confirmed the viewing contexts, five-skill scope, presence-based markings, shared diagonal pattern, hollow Tackle symbol, exclusion of Arm Bar, and neutral hatching when zone colors are off. The owner supplied the screenshot in response to the opacity question rather than approving a uniform 50% opacity for all bands; retain the original reference-relative instruction and 50% cap. No further product clarification is required to publish these tickets.

## Reviewed visual reference

The owner supplied the [Blood Bowl 3 screenshot](references/opposing-player-threats/bb3-tackle-zones.png) on 2026-10-10. It shows colored ground-plane squares aligned with the pitch grid in perspective. Sparse coverage appears green, with yellow and orange regions in the crowded center; the turf texture and pitch markings remain visible beneath the shading. Use this square alignment and translucent treatment as the visual reference. The screenshot does not establish the requested diagonal stripes or Tackle triangle design, and it does not clearly demonstrate the requested four-or-more red band.

The owner's written requirements govern the exact overlap thresholds and colors, empty-square-only scope, additional skill markings, and maximum 50% opacity. Use 50% for one-zone dark green and aim for approximately 15% more opaque shading than the reference for the other bands, subject to the cap. Exact source alpha cannot be recovered reliably from this composited screenshot; document chosen alpha values and provide visual captures for manual review. Existing video controls, numeric roll modifiers, player rings, and skill badges in the image are reference context rather than additional requirements.

## Repository findings and boundaries

The browser Game Menu already has Game Options, Interface, Key Bindings, and Game Log tabs. Game Settings is an additional tab. Existing browser preferences use local storage with a session fallback when storage is unavailable; reuse that convention for between-game persistence.

The live pitch already uses canonical squares and a shared camera projection for ground overlays in both coach views and perspective/top-down modes. Current rushing markers are small hollow rounded outlines with a matching grey exclamation point. Reuse the geometry and scaling for the requested Tackle variant without altering rushing behavior.

The native model exposes standing and distracted status separately from activation eligibility, and defines whether a player currently has tackle zones. Public player projection currently exposes descriptions/status and skill names; descriptions alone are not a reliable activation contract. Include any necessary read-only presentation data and strict decoder compatibility in the first end-to-end slice. Actual game rules, commands, checkpoints, and transcript semantics remain unchanged.

The accepted coach-view ADR requires all pitch overlays to share the same canonical projection and targeting, while readable UI text remains upright. There is no conflict with these requirements. Existing selection, movement perimeters, rushing signs, passing guidance, routes, mandatory decisions, and input targeting must remain usable together with the new markings.

The earlier shaded movement-range design in issues #230 and #231 was superseded by the movement-marking rollback and then the approved perimeter design in #240-#242. Those prior issues are context, not blockers for this feature; the required selection/projection/rushing behavior is already present in the current checkout.

## Approved vertical slices

1. [#247: Show opposing tackle-zone colors with Game Settings controls](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/247). No blockers. Deliver selection eligibility, native zone status, empty-square overlap colors, the new tab, persistent zone/category preferences, and a master switch to disable all threat markings.
2. [#248: Mark opposing Tackle zones with rounded T warnings](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/248). Blocked by #247. Deliver the requested per-square symbol and persistent Tackle control, including coexistence with rushing markers.
3. [#249: Stripe opposing movement-skill zones with per-skill controls](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/249). Blocked by #247 and #248. Deliver the confirmed skill list, persistent other-skill/per-skill controls, overlap composition, and complete simultaneous stripe/Tackle behavior. #248 gates the combined behavior and its end-to-end verification.

No separate prefactoring or test-only ticket is needed. Each ticket includes the presentation data, UI behavior, settings, relevant tests, and manual-review evidence needed to demonstrate its own behavior.

## Ticket #247: Show opposing tackle-zone colors with Game Settings controls

### What to build

During a coach's regular turn or that coach's Charge! kickoff event, selecting a friendly on-pitch player before activation or during an unfinished activation shows translucent colors on empty squares covered by currently effective opposing tackle zones. Add Game Settings to Game Menu and persistent controls for zone coloring and disabling all opposing threat markings.

### Acceptance criteria

- [ ] Before activation and during an unfinished activation, selecting an eligible friendly on-pitch player enables the overlay during the selecting coach's regular turn and that coach's Charge! kickoff event. Finished activations, cleared/off-pitch selection, setup, other kickoff events, the opponent's turn, spectators, replay, and full time show no overlay. A selected prone player can qualify before standing; the standing/not-distracted restriction applies to opposing sources.
- [ ] Charge! selection and movement use native event eligibility and current event participation/activation status. Showing markings does not choose additional Charge! participants, declare an action, or change which players the native event permits to act. Clear the overlay when Charge! ends or the selected participant becomes ineligible/finished.
- [ ] Use authoritative eligibility and native tackle-zone status. Standing opponents with no current tackle zone, distracted opponents, prone/stunned opponents, and off-pitch opponents contribute no color or skill marking. A rooted opponent that still has native tackle zones remains a source.
- [ ] For every empty square covered by at least one opposing zone, count adjacent qualifying opponents once each. Use dark green for one, yellow for two, orange for three, red for four or more, and no fill for zero. Clip at touchlines and end zones; do not render off-pitch squares or occupied squares.
- [ ] Use the reviewed Blood Bowl 3 reference for square-aligned translucent ground shading. One-zone dark green uses 50% opacity; calibrate yellow/orange/red for approximately 15% more opacity than the reference, capped at 50%, and document the chosen alpha values with manual-review captures. Use one composite fill per square; overlap changes the color, never stacks alpha above 50%. Do not present the count as an authoritative dodge roll, route legality, or success percentage.
- [ ] Game Menu has a new Game Settings tab with a zone-color toggle and a master control that disables all threat markings, including categories delivered by later tickets. Switching the master off preserves individual choices for restoration when switched on again.
- [ ] Controls default on, update the visible overlay immediately, and persist between games and reloads using existing browser preference conventions. Missing, invalid, or inaccessible stored values have safe defaults/session behavior without affecting gameplay.
- [ ] Selection, player positions, occupancy, posture, distraction, completed activation, turn/phase transitions, connection validity, and resumed match state update or invalidate markings. Do not leave guidance based on a superseded revision visible; respect existing settled playback/decision conventions.
- [ ] Markings use the existing projection in both coach views and supported perspective/top-down settings, including pan and zoom. They do not intercept mouse/keyboard targeting or obscure routes, passing guidance, movement perimeters, or required decisions.
- [ ] Required public presentation-data additions are read-only and keep strict browser/server decoding, reconnect, and existing stored replay compatibility intact. Showing/toggling markings does not activate a player, send a gameplay command, roll dice, spend resources, or alter checkpoints/logs/transcripts.
- [ ] Verify overlap thresholds 0/1/2/3/4+, pitch edges, occupied squares, status/activation gating, regular-turn and Charge! eligibility/end transitions, excluded viewing/phase contexts, selection/state refresh, persistence/storage fallback, both coach ends, and supported projections. Include focused native/decoder checks when those contracts change, self-review, a user-facing ChangeList entry, and an owner manual-review handoff.

### Blocked by

None (can start immediately).

## Ticket #248: Mark opposing Tackle zones with rounded T warnings

### What to build

Show a small white rounded warning triangle containing a red T on empty squares in the effective tackle zone of an opposing player with Tackle. Let a coach control this marking independently through Game Settings.

### Acceptance criteria

- [ ] Apply the same friendly-selection and effective opposing-zone gating as #247, including the selecting coach's regular turn and Charge! event. Mark every qualifying empty neighboring square when at least one contributing opponent has Tackle, even when the selected player has no Dodge skill or the threat is otherwise irrelevant to that player's skills. Resolve native/ruleset identity and current temporary skills through existing conventions.
- [ ] Match the existing rushing marker's size, rounded shape, projection, and scaling with a hollow white rounded triangle outline and a small red T in place of the exclamation mark. Keep one Tackle marker per square even when several Tackle players overlap.
- [ ] Tackle receives a dedicated persisted enable/disable control in Game Settings. It defaults on, responds immediately, and works independently of ordinary zone-color and other-skill controls; the master threat control disables it.
- [ ] Tackle markers remain visible when ordinary zone colors are disabled. Changing the Tackle control never changes overlap counts/colors or the effectiveness of any native skill.
- [ ] Tackle and rushing warnings remain distinguishable in the same square without one covering the other. Existing rushing appearance, movement guidance, and targeting stay usable.
- [ ] Verify Tackle/no-Tackle, presence-based marking for a selected player without Dodge, multiple overlapping Tackle sources, distracted/prone/off-pitch sources, regular-turn/Charge! contexts, independent controls, persistence, combined rushing/Tackle squares, and both coach ends/projections. Include relevant presentation-data checks, self-review, a user-facing ChangeList entry, and an owner manual-review handoff.

### Blocked by

- [#247: Show opposing tackle-zone colors with Game Settings controls](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/247).

## Ticket #249: Stripe opposing movement-skill zones with per-skill controls

### What to build

Use thin diagonal transparent bands to distinguish the effective tackle zones of opposing players with Prehensile Tail, Diving Tackle, Tentacles, or Shadowing. Add an other-skill category control and individual skill controls in Game Settings, and compose these markings with zone colors and Tackle symbols. When zone colors are off, use thin neutral diagonal hatch lines instead.

### Acceptance criteria

- [ ] Mark empty squares within the effective opposing tackle zones of players with Prehensile Tail, Diving Tackle, Tentacles, or Shadowing. Show skill presence even if the selected player's skills make a threat irrelevant. Resolve native/ruleset skill identity and temporary/current skills through existing conventions. Arm Bar is excluded; Tackle alone receives no stripes.
- [ ] Thin diagonal transparent bands reveal the pitch beneath the colored marking. Use one consistent diagonal pattern per square shared by all players; overlapping sources/skills produce one pattern without crosshatching. Moving or rotating the camera retains consistent ground-plane alignment in both coach views.
- [ ] Compose the final zone color from all qualifying sources, independently of which skill controls are enabled. Multiple skills/sources do not make a square darker than the 50% cap or multiply identical hatch patterns accidentally.
- [ ] Add a persistent other-skill category toggle and separate persistent toggles for Prehensile Tail, Diving Tackle, Tentacles, and Shadowing. All default on. A source remains striped when at least one enabled qualifying skill remains; disabling its last enabled qualifying skill removes its stripes. Tackle remains controlled by its T-symbol toggle and does not receive stripes solely for Tackle.
- [ ] When ordinary zone colors are disabled but other-skill markings are enabled, show thin neutral diagonal hatch lines without colored shading on qualifying empty squares. Turning off the other-skill category removes stripes/hatching while retaining independently enabled Tackle symbols and ordinary colors. The master switch hides every threat marking without discarding individual preferences.
- [ ] A source with both Tackle and an enabled stripe skill produces both its stripes and a T warning on qualifying squares. Overlapping zones from different Tackle and stripe sources likewise retain both markings. Rushing warnings remain separately visible when also present.
- [ ] Reuse #247's selection/status/update/projection behavior and retain native gameplay, input targeting, selection, routes, movement perimeters, passing guidance, mandatory decisions, and checkpoint/transcript behavior.
- [ ] Verify each of the four stripe skills, excluded Arm Bar, presence-based marking despite selected-player skills, multiple skills on one player, differently skilled overlapping opponents, Tackle-plus-stripe and rush-plus-Tackle-plus-stripe squares, neutral hatching with colors off, disabled categories/skills, persistence, status changes, regular-turn/Charge! contexts, both coach ends, and supported projections. Include meaningful native/decoder checks when those contracts change, self-review, a user-facing ChangeList entry, and an owner manual-review handoff.

### Blocked by

- [#247: Show opposing tackle-zone colors with Game Settings controls](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/247).
- [#248: Mark opposing Tackle zones with rounded T warnings](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/248), needed for simultaneous Tackle/stripe delivery and verification.

## Publication

The owner approved granularity and blocking edges on 2026-10-10. Published one GitHub issue per slice in dependency order with `ready-for-agent`. Native GitHub blocking relationships connect #248 to #247, and #249 to #247 and #248. GitHub owns issue state; this document and the repository issue index mirror the approved scope and links. Existing issues were not modified or closed.

## Ticket verification

Read back all three published issue bodies and confirmed they match the prepared bodies, are open, and carry `ready-for-agent`. Verified native dependencies: #247 has none, #248 is blocked by #247, and #249 is blocked by #247 and #248. The implementation follow-up is recorded in the [verification and manual-review handoff](../verification/opposing-player-threat-markings.md). Issue closure remains pending owner validation and publication authorization.
