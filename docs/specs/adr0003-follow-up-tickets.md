# ADR0003 follow up tickets

The initial owner observations from 2026-10-05 are split into eight focused GitHub tickets. A second adjustment batch with seventeen child tickets is recorded below. These extend or correct the completed coach-oriented match UI from [ADR 0003](../adr/0003-coach-oriented-angled-pitch.md) and [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101). GitHub owns ticket state; this file mirrors the agreed scope and acceptance criteria.

Delivery evidence and merged PRs are recorded in adr0003-follow-up-delivery.md. Checked acceptance items refer to the completed implementation and its recorded verification.

The final reroll consumption order is **Brilliant Coaching > Mascot > Leader Reroll > Team Reroll**. Pass declaration retains movement and possible pickup before explicit target confirmation. New 30 and 50 degree views extend the earlier production camera scope while keeping 40 degrees as the default.

## Ticket index

| Observation | Ticket | Triage |
| --- | --- | --- |
| 1 | [#111 Compare the live coach view with the accepted ADR0003 reference](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/111) | needs-triage |
| 1 | [#112 Add selectable 30 and 50 degree perspective coach views](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/112) | ready-for-agent |
| 2 | [#113 Preserve player sprites during pushback square selection](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/113) | ready-for-agent |
| 3 | [#114 Make pass declaration movement and target confirmation work together](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/114) | ready-for-agent |
| 3.1 | [#115 Color pass ranges on the pitch and account for weather](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/115) | ready-for-agent |
| 4 | [#116 Show dice directly over the pitch without enclosing boxes](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/116) | ready-for-agent |
| 4 | [#117 Show every eligible reroll option beside the current roll](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/117) | ready-for-agent |
| 5 | [#118 Verify reroll totals and consume sources in the requested priority](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/118) | ready-for-agent |

## Compare the live coach view with the accepted ADR0003 reference

GitHub: [#111](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/111). Status: open. Observation: 1. Triage: `needs-triage`.

### Problem

Follow-up to [ADR 0003](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/HEAD/docs/adr/0003-coach-oriented-angled-pitch.md) and completed integration [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101), from owner observations on 2026-10-05.

The owner reports differences between the perspective example and the live product. The individual differences have not yet been enumerated. Establish a reproducible comparison before prescribing corrections.

### Scope and acceptance

- [ ] Compare the live 40-degree perspective coach view with the accepted v4 viewer using the same viewport, camera position, zoom, coach end and equivalent player arrangement. Compare home and away views and near/far camera positions.
- [ ] Save paired captures and list concrete differences in camera framing, perspective convergence, travelling scenery, pitch/sprite alignment and HUD presentation. Identify responsive adaptations and documented MVP scenery limitations separately from regressions against the accepted requirements.
- [ ] Map each confirmed discrepancy to the ADR/spec requirement, expected appearance and reproduction steps. Specify corrections here, or create focused child work if a discrepancy exceeds one cohesive fix.
- [ ] Complete this investigation when its comparison evidence and scoped findings are linked in the issue; do not close it solely because a live screenshot exists.

### Handoff

The [approved UI specification](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/HEAD/docs/specs/coach-oriented-playable-match-ui.md) and v4 reference under `docs/adr/references/0003-angled-pitch-v4/` are the comparison baseline. Start with `browser-client/src/pitch-projection.ts`, `LivePitch.tsx`, `PitchScenery.tsx` and `live-pitch.css`. The separate camera-preset ticket covers 30 and 50 degrees. This ticket does not authorize replacing the accepted renderer or stadium art.


### Related tickets

- [#112 Add selectable 30 and 50 degree perspective coach views](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/112)

## Add selectable 30 and 50 degree perspective coach views

GitHub: [#112](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/112). Status: closed by [PR #119](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/119). Observation: 1. Triage: `ready-for-agent`.

### Outcome

Follow-up to [ADR 0003](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/HEAD/docs/adr/0003-coach-oriented-angled-pitch.md) and completed integration [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101), from owner observations on 2026-10-05.

Add 30-degree and 50-degree perspective views to the live match and reference comparison, with elevation measured above the pitch plane. Retain 40-degree perspective as the default and the existing 90-degree top-down view.

### Acceptance

- [x] Provide clearly labelled 30, 40 and 50 degree choices through the existing match camera controls. Both new views retain zero yaw, width-fit framing and the travelling camera contract.
- [x] Pitch, scenery, players, ball, routes, selection and decision overlays share the chosen camera. Home and away remain opposing coach views; input resolves to the same canonical squares.
- [x] Switching elevation retains coach end, longitudinal position, zoom, selected player, prepared target/route and pending decision. Camera choices remain local presentation state and never submit a match command.
- [x] Keep height/elevation/lens fixed during travel within each preset; only an explicit preset, resize or zoom change can recalibrate framing. Expose both end zones and their players at each elevation.
- [x] Add home/away reference captures for 30 and 50 degrees and record any framing/readability trade-offs. Update the camera documentation to explain the new production choices.
- [x] Add a user-facing change-list entry.

### Verification and handoff

Exercise projection/input round trips and edge/end-zone targeting at each preset, then inspect live home/away views, crowded positions, resizing and view switching with a staged action or pending push. Start with `browser-client/src/pitch-projection.ts` and `LivePitch.tsx`.

This owner request extends the [original UI scope](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/HEAD/docs/specs/coach-oriented-playable-match-ui.md), which kept comparison presets out of production controls. It does not change the selected 40-degree default. Reference-parity investigation is separate and does not block adding the presets.


### Related tickets

- [#111 Compare the live coach view with the accepted ADR0003 reference](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/111)

## Preserve player sprites during pushback square selection

GitHub: [#113](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/113). Status: closed by [PR #120](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/120). Observation: 2. Triage: `ready-for-agent`.

### Problem

Follow-up to [ADR 0003](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/HEAD/docs/adr/0003-coach-oriented-angled-pitch.md) and completed integration [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101), from owner observations on 2026-10-05.

While choosing a pushback square, a home/away placeholder token such as A3 appears instead of the player graphic. Available player artwork should remain visible throughout this required decision.

### Acceptance

- [x] Reproduce and capture the reported placeholder during a real pushback decision, identifying the affected player and authoritative state/asset lookup.
- [x] Render the pushed player and other affected players with their existing team/position artwork and correct facing/pose while legal push destinations are shown. Do not substitute H/A-number tokens for players with available art.
- [x] Preserve player identity, jersey number, canonical square and ground anchor through the push prompt, each chain-push prompt and the accepted resulting movement.
- [x] Retain legal push arrows and direct server-offered choice submission from [#94](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/94). Player graphics must not obscure or intercept a valid destination choice.
- [x] Retain an explicit fallback only for genuinely missing/unsupported artwork, with a regression check that distinguishes that case from normal Human/Orc push decisions.
- [x] Add a user-facing change-list entry.

### Verification and handoff

Cover ordinary push and chain push with both coach views, top-down view and spectator rendering. Confirm correct artwork during the prompt and after resolution, plus working keyboard destination selection. Start with `browser-client/src/LivePitch.tsx`, `player-art.ts`, `push-choice.ts` and `SetupPanel.tsx`. Preserve the original pushback interaction contract.

## Make pass declaration movement and target confirmation work together

GitHub: [#114](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/114). Status: closed by [PR #121](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/121). Observation: 3. Triage: `ready-for-agent`.

### Outcome

Follow-up to [ADR 0003](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/HEAD/docs/adr/0003-coach-oriented-angled-pitch.md) and completed integration [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101), from owner observations on 2026-10-05.

The pass interaction feels unclear. Support the owner's intended sequence: select Pass and confirm its declaration; move the active player normally, including a possible ball pickup; click the target player and confirm the pass target.

### Acceptance

- [x] Selecting Pass stages the server-offered declaration; Confirmed! declares it. The active player remains in the Pass action while moving through the existing route preview/confirmation flow.
- [x] Movement and a legal ball pickup can occur before the throw. Movement does not silently replace Pass with a Move declaration or prematurely finish the player's action.
- [x] Clicking a legal target player stages the matching server-offered pass target. Show the selected target clearly; Confirmed! submits the throw only after this explicit target review.
- [x] Preserve native support for any other legal pass targets, including empty squares when offered. Do not fabricate legal targets when the active player lacks the ball or the native rules prohibit the throw.
- [x] Required pickup/movement/reroll/reaction decisions interrupt and resume through the existing prompt path. Refresh targets after accepted movement or a changed authoritative revision.
- [x] Stale proposals, double confirmation, wrong actor, disconnect and spectator/replay mode cannot submit a pass. Camera changes preserve a still-valid selection.
- [x] Add a user-facing change-list entry.

### Verification and handoff

Exercise a stationary pass, move-then-pass and move/pickup/pass against the real BB2025 engine, including a pickup decision/failure and changed legality. Verify the recipient and ball outcome, confirmed action IDs and both coach projections. Start with `browser-client/src/SetupPanel.tsx`, `action-ribbon.ts` and the native match action adapter. Related baseline: [#92](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/92) and [#53](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/53). Coordinate the active-pass state with the separate range-overlay ticket.


### Related tickets

- [#115 Color pass ranges on the pitch and account for weather](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/115)

## Color pass ranges on the pitch and account for weather

GitHub: [#115](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/115). Status: closed by [PR #122](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/122). Observation: 3.1. Triage: `ready-for-agent`.

### Outcome

Follow-up to [ADR 0003](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/HEAD/docs/adr/0003-coach-oriented-angled-pitch.md) and completed integration [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101), from owner observations on 2026-10-05.

When a Pass action has been declared, color the pitch grid from the active passer's current square so the coach can see passing distance and the effect of weather.

### Acceptance

- [x] Use the native BB2025 range classification for each canonical target square. Base colors are green for Quick Pass, yellow for Short Pass, orange for Long Pass and red for Long Bomb. Out-of-range squares are distinctly unavailable.
- [x] Derive permitted distances and weather modifiers from authoritative rules/state. Mark distances forbidden by current weather as unavailable and prevent staging a forbidden target.
- [x] For an additional weather passing penalty, shift the displayed colors one step: green to yellow, yellow to orange, orange to red, red to darker red. Preserve the actual range category; explain the weather penalty in the legend/target details so a changed color is not mistaken for a changed distance.
- [x] Recalculate after each accepted movement of the passer and after a relevant weather/state change. Remove the overlay when the Pass action ends or is cancelled by authoritative state.
- [x] Project the colored grid through the same camera in all perspective presets and top-down view, for both coach ends. Keep players, ball, selection, routes and legal target indications readable.
- [x] Include a compact legend and a text equivalent for range, restriction and weather penalty. Do not rely on color alone or introduce client-derived success percentages.
- [x] Add a user-facing change-list entry.

### Verification and handoff

Check each range boundary, diagonal targets, movement updates, weather that limits range and weather that imposes a penalty, using deterministic native BB2025 scenarios. Verify both coach ends and top-down rendering. If the current protocol lacks the needed range/weather facts, extend and version it with matching server projection and strict browser decoder checks; do not add a parallel browser rules engine.

Coordinate with the pass-flow ticket; the authoritative classification and overlay can be developed independently. [#37](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/37) remains the separate success-percentage work.


### Related tickets

- [#114 Make pass declaration movement and target confirmation work together](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/114)
- [#112 Add selectable 30 and 50 degree perspective coach views](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/112)

## Show dice directly over the pitch without enclosing boxes

GitHub: [#116](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/116). Status: closed in [PR #123](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/123). Observation: 4. Triage: `ready-for-agent`.

### Outcome

Follow-up to [ADR 0003](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/HEAD/docs/adr/0003-coach-oriented-angled-pitch.md) and completed integration [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101), from owner observations on 2026-10-05.

Render revealed dice as the dice themselves over the pitch, removing the enclosing panel/box. Use restrained shadowing if needed to separate the dice from turf and player artwork.

### Acceptance

- [x] Remove visible enclosing card backgrounds/borders from roll display and selectable dice. Retain the accepted ivory/cyan dice faces and distinguish individual selectable outcomes.
- [x] Keep dice readable against light/dark turf and players through suitable shadows or a subtle per-die treatment. Do not hide the acting player or a required target.
- [x] Preserve server-revealed values, roll timing, selected outcome and mapping of each selectable die to its offered choice. Visual styling must not generate or change a result.
- [x] Retain keyboard access, accessible roll/result text and a visible focus/selection cue. Reduced motion reveals the final dice immediately.
- [x] Place any contextual reroll controls near the roll without reintroducing a box around the dice; availability/choice behavior is covered by the separate reroll-options ticket.
- [x] Add a user-facing change-list entry.

### Verification and handoff

Capture d6 and one/two/three block-die rolls, selectable outcomes and reduced-motion presentation on both coach views and top-down. Include spectator/replay revealed dice and keyboard selection. Start with `browser-client/src/LivePitch.tsx`, `PitchDecisionOverlay.tsx`, `DiceFace.tsx` and `live-pitch.css`. Related baseline: [#53](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/53).


### Related tickets

- [#117 Show every eligible reroll option beside the current roll](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/117)

## Show every eligible reroll option beside the current roll

GitHub: [#117](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/117). Status: closed by [PR #124](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/124). Observation: 4. Triage: `ready-for-agent`.

### Outcome

Follow-up to [ADR 0003](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/HEAD/docs/adr/0003-coach-oriented-angled-pitch.md) and completed integration [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101), from owner observations on 2026-10-05.

When a roll can be rerolled, show the available source choices, including team rerolls and skills. If the coach may choose between Pro and a team reroll, both options must be visible and individually actionable.

### Acceptance

- [x] Display every concurrently eligible server-offered reroll/skill choice for the current roll, with a clear source label and a decline/keep-result choice where offered. Do not collapse multiple sources into one generic button or hide one prompt family behind another.
- [x] Allow an explicit choice between Pro and a team reroll when both are offered, and support other reachable skill/resource rerolls through the same authoritative choice path.
- [x] Each control submits its exact offered action ID. Selecting one source updates/clears the other choices from the accepted server revision and prevents double expenditure or a second reroll of the same roll where prohibited.
- [x] Show options whenever the native rules permit them, including successful rolls where rerolling is allowed. Never offer an exhausted, ineligible or already-used source based solely on a HUD count.
- [x] Required prompts remain keyboard accessible and visible beside unboxed dice. Other coaches, spectators and replay viewers can inspect revealed results but cannot answer the acting coach's prompt.
- [x] Preserve pending choices through camera/view changes and reconnect reconciliation; invalidate stale choices after changed legality.
- [x] Add a user-facing change-list entry.

### Verification and handoff

Use deterministic real-engine scenarios with team-only, skill-only and concurrent Pro/team choices. Exercise accept/decline, skill failure and any legal follow-on choice, source exhaustion, repeated activation and wrong-actor denial. Start with `browser-client/src/match-decision.ts`, `PitchDecisionOverlay.tsx` and `ffb-server/src/main/java/com/fumbbl/ffb/server/match/CorePromptActions.java`.

Coordinate with the source-accounting ticket for authoritative availability; skill-vs-team choice must remain explicit even when team-source consumption uses automatic priority. Related baseline: [#53](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/53).


### Related tickets

- [#116 Show dice directly over the pitch without enclosing boxes](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/116)
- [#118 Verify reroll totals and consume sources in the requested priority](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/118)

## Verify reroll totals and consume sources in the requested priority

GitHub: [#118](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/118). Status: closed by [PR #125](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/125). Observation: 5. Triage: `ready-for-agent`.

### Outcome

Follow-up to [ADR 0003](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/HEAD/docs/adr/0003-coach-oriented-angled-pitch.md) and completed integration [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101), from owner observations on 2026-10-05.

Verify team-reroll availability and source consumption. A single HUD total may combine sources, while the engine retains source identity and consumes eligible sources in the owner's final stated order:

**Brilliant Coaching > Mascot > Leader Reroll > Team Reroll.**

This final sequence resolves the earlier conflicting order in the observation.

### Acceptance

- [x] Audit native BB2025 availability, consumption and browser totals for Brilliant Coaching, team mascot, Leader and ordinary team rerolls. Record current behavior and any divergence before making corrections.
- [x] Apply the requested priority among sources currently eligible for the decision. Skip exhausted/ineligible sources and preserve each source's native conditions, limits and expiry. A conditional Mascot attempt must not become an unconditional guaranteed reroll through aggregation.
- [x] Decrement only the source actually consumed and derive the combined visible total from authoritative availability. Declining a reroll, rejecting a stale action or reconciling an exact retry must not spend another resource.
- [x] Verify Brilliant Coaching expiry, Leader availability when the qualifying player is unavailable, Mascot success/failure and any permitted follow-on team reroll, turn/half/drive resets, and ordinary reroll exhaustion against the active rules.
- [x] Keep explicit skill-vs-team decisions, such as Pro versus team reroll, separate from this automatic ordering of team sources. Preserve ruleset-specific behavior outside BB2025 unless the same correction is explicitly applicable there.
- [x] Make the consumed source identifiable in the authoritative outcome/log and ensure both coaches/spectators receive correct revealed counts after use and reconnect.
- [x] Add a user-facing change-list entry for any visible correction.

### Verification and handoff

Add focused native-engine scenarios for all four sources available together, each higher-priority source unavailable, Mascot success/failure, Leader eligibility, expiry/reset boundaries and retry safety; verify the matching browser HUD and prompt projection. If a requested ordering conflicts with a native rules constraint, record the exact constraint and isolate that decision rather than silently weakening legality.

Start with `ffb-server/src/main/java/com/fumbbl/ffb/server/util/UtilServerGame.java`, the BB2025 kickoff/end-turn/block steps, and `browser-client/src/hud-model.ts` / `LiveMatchScoreboard.tsx`. The existing Season 3 reroll notes in `issues.md` are background; this ticket scopes the concrete post-integration audit and correction.


### Related tickets

- [#117 Show every eligible reroll option beside the current roll](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/117)

## Second match UI adjustment batch (2026-10-05)

GitHub rollup: [#127 Match UI adjustment batch: kickoff, pitch rendering, dice and diagnostics](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/127).
Rollup branch: `codex/fix-new-match-ui`, based on `feat/mutp-site-updates` at `08f211c5018978b899b09329b393f50422aca3ca`. Following the owner's “Proceed,” implementation uses this checkout with unrelated changes preserved. Delivery and per-ticket evidence are recorded in [the verification report](adr0003-ui-adjustment-verification.md). Tickets remain open for review; the reported 30° black-pixel failure still needs confirmation on the owner's display.

GitHub owns ticket state. These 17 tickets cover all 15 owner observations, splitting observation 11 into block-dice sizing, reroll icon reuse and skill icon artwork/integration. All 17 are ready for an agent after the owner confirmed the product decisions.

### Confirmed decisions

- Message placement: touchback and general game-step messages share a prominent area slightly below the turn counter. Use an event heading plus instructions, following the owner's Quick Snap, Charge and High Kick examples; N/X allowances come from authoritative game state.
- Mouse2: the right mouse button, held while moving to travel up/down the pitch. The mouse wheel zooms.
- Successful d6 lifetime: accumulate the action sequence, then clear about one second after the final roll; the three-dodges-plus-rush example displays all four results together.
- Charge identifies the kicking team, matching the server, as confirmed by the owner.

### Ticket index

| Observation | Ticket | Triage |
| --- | --- | --- |
| 1 | [#128 Fix Quick Snap player selection, square highlights and movement counter](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/128) | ready-for-agent |
| 2 | [#129 Fix black or missing pitch and scenery regions in the 30 degree view](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/129) | ready-for-agent |
| 3 | [#130 Use held right mouse button for pitch travel and the mouse wheel for zoom](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/130) | ready-for-agent |
| 4 | [#131 Add projected player ground shadows matching the approved design](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/131) | ready-for-agent |
| 5 | [#132 Correct player square alignment across every pitch viewing angle](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/132) | ready-for-agent |
| 6 | [#133 Explain touchbacks and the required receiving-player choice in game-status text](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/133) | ready-for-agent |
| 7 | [#134 Add a general current-game-status text area to the match UI](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/134) | ready-for-agent |
| 8 | [#135 Remove follow-up screen fading and compact the MUTP decision prompt](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/135) | ready-for-agent |
| 9 | [#136 Place rolled dice nearer the center of the visible pitch](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/136) | ready-for-agent |
| 10 | [#137 Make the game-log font size selector change the displayed text](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/137) | ready-for-agent |
| 11a | [#138 Fit block dice and their choices without display scrollbars](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/138) | ready-for-agent |
| 11b | [#139 Use the existing inducement reroll icon for the roll's reroll button](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/139) | ready-for-agent |
| 11c | [#140 Add distinct MUTP icon buttons for Pro, Brawler, Dodge and other reroll skills](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/140) | ready-for-agent |
| 12 | [#141 Keep successful d6 rolls visible for about one second without a decision](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/141) | ready-for-agent |
| 13 | [#142 Move camera options, server actions and movement-plan details into a debug drawer](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/142) | ready-for-agent |
| 14 | [#143 Select the ball's kickoff target square directly with the mouse](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/143) | ready-for-agent |
| 15 | [#144 Keep standing sprites direction-independent in top-down and retain prone/stunned art](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/144) | ready-for-agent |

### Delivery requirements

- Implement each child against the authoritative game state and existing MUTP design/asset conventions.
- Add user-facing entries to the latest VersionChangeList for delivered UI changes.
- Match verification to each child's behavior. Retain screenshots for visual changes and real-server evidence for kickoff, touchback, dice and reroll choices.
- Exercise applicable 30/40/50 degree and top-down views, opposing coach ends, and role-safe spectator presentation.
- Link implementation/verification evidence before closing each child; keep this rollup open until every child is accepted.

### Fix Quick Snap player selection, square highlights and movement counter

GitHub: [#128](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/128). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 1, 2026-10-05.

#### Problem

Quick Snap square highlights do not align with the expected interaction. The coach should click an eligible open player, then click a legal adjacent square to move that player one square. The UI also needs to show the event's allowed player count and completed movements.

#### Acceptance

- [ ] Clicking an eligible open player selects that player and highlights only the current server-legal one-square destinations, with the highlights aligned to the projected squares.
- [ ] Clicking a highlighted square uses the exact offered action for that player and canonical destination; it does not run the ordinary multi-square route planner.
- [ ] Show the maximum number of players that may move, the number already moved and the remaining allowance. Use authoritative event state and distinguish selected players from completed moves.
- [ ] A player cannot move twice or exceed the allowance. Rejected/stale/pending requests do not increment the completed count; accepted state and reconnect restore the correct count.
- [ ] Preserve server-offered finish/decline choices and prevent another coach or spectator from submitting the move.

#### Verification and handoff

Start with `browser-client/src/kickoff-choice.ts`, `SetupPanel.tsx`, `usePitchInteraction.tsx`, `LivePitch.tsx` and the kickoff action projection. Verify an actual Quick Snap from selection through one-square moves, limit reached, early finish and reconnect, in opposing coach views and top-down. The existing general kickoff multi-player selection must be distinguished from the subsequent Quick Snap movement step.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Fix black or missing pitch and scenery regions in the 30 degree view

GitHub: [#129](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/129). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 2, 2026-10-05.

#### Problem

The owner reports significant rendering 'tearing' in the 30 degree perspective preset: parts of the pitch and pitch assets become black or disappear.

#### Acceptance

- [ ] Record reproducible 30 degree captures at the affected camera positions and identify whether projection clipping, scenery composition or browser rendering causes the missing regions.
- [ ] Visible pitch, players, ball and expected scenery render continuously while idle, panning, zooming, resizing and switching into the 30 degree view.
- [ ] Cover both coach ends, near/far end zones and a crowded formation; correct the fault without changing the approved stadium artwork or silently removing the 30 degree option.
- [ ] Retain canonical square targeting and stable depth ordering; verify the fix also preserves the 40, 50 and top-down views.

#### Verification and handoff

Follow-up to completed #112 and related comparison #111. Start with `browser-client/src/pitch-projection.ts`, `PitchScenery.tsx`, `LivePitch.tsx` and `live-pitch.css`. Keep before/after captures and the browser/viewport details that reproduce the report.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Use held right mouse button for pitch travel and the mouse wheel for zoom

GitHub: [#130](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/130). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 3, 2026-10-05.

#### Problem

Pitch travel should use a click-and-hold of the right mouse button, while the mouse wheel controls zoom. The owner confirmed that 'mouse2' means the right button.

#### Acceptance

- [ ] Pressing and holding the right mouse button while moving the pointer travels up/down the pitch; release, pointer cancellation or loss of capture ends travel.
- [ ] The mouse wheel changes zoom within the supported limits, with bounded framing and no longitudinal travel from the wheel.
- [ ] A camera gesture never selects a player, pins a square or commits a game action. Ordinary primary-click gameplay and setup drag/drop remain usable.
- [ ] Both coach orientations, 30/40/50 degree views and top-down preserve canonical targeting and the pending action/decision through camera changes.
- [ ] Keep keyboard camera controls accessible and suppress the browser context menu for right-button pitch travel without affecting other parts of the page.

#### Verification and handoff

Start with the wheel and pointer handlers in `browser-client/src/LivePitch.tsx` and `pitch-projection.ts`. Verify press/move/release, capture cancellation, wheel zoom, and gameplay clicks.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

#### Confirmed product decision

Confirmed by the owner in chat: mouse2 means the right mouse button.

### Add projected player ground shadows matching the approved design

GitHub: [#131](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/131). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 4, 2026-10-05.

#### Problem

Players need ground shadows beneath them as shown in the accepted angled-pitch design examples.

#### Acceptance

- [ ] Use the accepted v4 home/away perspective and top-down examples under `docs/adr/references/0003-angled-pitch-v4/` to match shadow placement, shape and restrained opacity.
- [ ] Anchor each shadow to its player's canonical square and ground/foot position, below the artwork; project and scale it consistently with the selected camera.
- [ ] Keep shadows attached during movement playback, pan, zoom, resizing and view switching for normal and large players, including prone/stunned poses.
- [ ] Shadows do not change hit testing, hide selection/target markings or create additional player controls.

#### Verification and handoff

Start with `browser-client/src/LivePitch.tsx`, `live-pitch.css` and the v4 `renderer.js` reference. Capture sparse and crowded formations at 30/40/50 degrees and top-down from both ends. This is renderer work; any actual roster sprite edits must use `.agents/skills/team-pixel-sprites/SKILL.md`.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Correct player square alignment across every pitch viewing angle

GitHub: [#132](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/132). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 5, 2026-10-05.

#### Problem

Player artwork appears slightly off center in its assigned square. Review placement across every supported viewing angle and top-down.

#### Acceptance

- [ ] At 30/40/50 degrees, standing players' visible ground/foot anchor aligns with the projected canonical square center; prone/stunned ground anchors remain correctly placed.
- [ ] In top-down, the visible artwork is centered according to the accepted tactical reference rather than accidentally aligned by transparent image padding or a standing foot anchor.
- [ ] Review normal/large players, available poses and both team orientations across near/far rows, sidelines and end zones; pan/zoom/view changes do not introduce drift.
- [ ] Keep sprite artwork, ground shadows, selection squares and hit targets tied to the same canonical position, including during playback.
- [ ] Record measurements or overlay captures against projected centers and paired before/after captures.

#### Verification and handoff

Start with `browser-client/src/LivePitch.tsx`, `player-art.ts` and `pitch-projection.ts`. Coordinate the shadow and top-down pose tickets. Any sprite metadata/artwork revisions must follow `.agents/skills/team-pixel-sprites/SKILL.md`.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Explain touchbacks and the required receiving-player choice in game-status text

GitHub: [#133](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/133). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 6, 2026-10-05.

#### Problem

A touchback needs a prominent message slightly below the turn counter, telling the coach to assign the ball to a player. Use the same prominent status area as general game-step messages.

#### Acceptance

- [ ] When the server enters touchback selection, show a prominent Touchback heading and an instruction to the receiving coach to assign the ball to an eligible player.
- [ ] Place the message slightly below the turn counter in the shared MUTP game-status area; keep the current turn counter and required player selection visible.
- [ ] The acting coach sees the required action clearly; the opposing coach/spectator sees the public step and an appropriate waiting instruction without choice controls.
- [ ] The message updates or clears when the server accepts the receiving-player choice and stays accurate after reconnect or a view change.
- [ ] The status message supplements the server's touchback choice and never assigns a player or advances the game on its own.

#### Verification and handoff

Depends on the shared game-status surface ticket. Start with `browser-client/src/SetupPanel.tsx`, `match-decision.ts` and the authoritative touchback projection. Verify an actual touchback for both coaches and a spectator.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

#### Confirmed product decision

Confirmed by the owner in chat: show a prominent message slightly below the turn counter, using the same area as general game-step text. The message must tell the coach to assign the ball to a player.

Blocked by: #134 (shared status-message surface).


### Add a general current-game-status text area to the match UI

GitHub: [#134](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/134). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 7, 2026-10-05.

#### Problem

The match needs a prominent 'this is the step the game is currently on' message slightly below the turn counter. Share this area with the touchback message and use an event heading plus clear instructions for the coach.

#### Acceptance

- [ ] Provide one shared MUTP-themed status area slightly below the turn counter, with a prominent event/step heading and a clear instruction describing who acts and what they must do.
- [ ] Cover currently reachable setup, kickoff, touchback, player-action and decision/waiting states, with a meaningful fallback for unfamiliar states.
- [ ] For Quick Snap, show 'Quick Snap!' and 'Receiving team to select up to N open players, each may move one square', substituting the current authoritative allowance for N.
- [ ] For Charge, show 'Charge!' and 'Receiving team to select up to X open players, each may perform a move action. Up to one player may perform a Blitz, Throw teammate, and/or Kick Teammate', substituting the current authoritative allowance for X and reflecting server-permitted action restrictions.
- [ ] For High Kick, show 'High Kick!' and 'Select one open player, that player may be redeployed to a new square.' Derive the eligible player/destination restrictions from the current server state.
- [ ] Messages reflect the viewer's role and current accepted game state; display revealed step/allowance information and never raw action IDs or diagnostic details.
- [ ] Update on accepted transitions and reconnect. Keep instructions correct through camera/view changes and avoid obscuring required square/player/dice controls.

#### Verification and handoff

Start with `browser-client/src/SetupPanel.tsx`, `match-decision.ts`, `hud-model.ts` and the current browser projection. Touchback copy is a separate dependent ticket. Verify real Quick Snap, Charge, High Kick and touchback states from both coach roles and a spectator, including dynamic counts and transitions. Use existing authoritative phase/decision metadata; add a paired server/browser contract only if required.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

#### Confirmed product decision

Confirmed by the owner in chat: use a prominent message slightly below the turn counter, shared with touchback. The Quick Snap, Charge and High Kick examples above define the intended heading-plus-instruction pattern. Event allowances and actual legal actions remain server-authoritative.

### Remove follow-up screen fading and compact the MUTP decision prompt

GitHub: [#135](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/135). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 8, 2026-10-05.

#### Problem

Follow-up decisions currently fade the screen. The owner wants the pitch to remain fully visible and the follow-up text box to match the other MUTP UI elements at a slightly smaller size.

#### Acceptance

- [ ] Opening a follow-up decision leaves the pitch and surrounding HUD at their normal brightness; remove the dimming backdrop for this decision.
- [ ] Restyle the follow-up prompt using the existing MUTP HUD typography, navy/cyan/gold treatment and background transparency.
- [ ] Reduce the prompt's footprint from the current compact presentation while keeping its text and all offered options readable and easy to select.
- [ ] Keep the required decision, exact offered action mapping, actor permissions, pending protection, keyboard focus and camera/view continuity intact.
- [ ] The prompt does not obscure the acting/blocking player or the follow-up destination in either coach orientation.

#### Verification and handoff

Start with `browser-client/src/MatchDecisionDialog.tsx`, `match-decision.css` and the existing HUD styles. Capture a real follow-up in perspective and top-down; verify mouse/keyboard choices and pending/rejected requests.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Place rolled dice nearer the center of the visible pitch

GitHub: [#136](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/136). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 9, 2026-10-05.

#### Problem

Dice appear too far from the center of the field. The roll presentation should be more central within the visible pitch.

#### Acceptance

- [ ] Anchor the roll group around the center of the visible pitch viewport, using bounded adjustments to preserve visibility of the acting player, required target and offered decisions.
- [ ] Keep the accepted unboxed ivory/cyan dice treatment and the nearby reroll choices.
- [ ] One/two/three block dice and d6 groups remain inside the visible pitch area while panning, zooming, resizing and switching view.
- [ ] Both coaches and spectators see the same revealed results; changing presentation never changes roll values or selectable action IDs.

#### Verification and handoff

Follow-up to #116. Start with the roll/decision placement in `browser-client/src/LivePitch.tsx`, `PitchDecisionOverlay.tsx` and `live-pitch.css`. Capture all roll group sizes from both coach ends at 30/40/50 degrees and top-down.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Make the game-log font size selector change the displayed text

GitHub: [#137](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/137). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 10, 2026-10-05.

#### Problem

The game-log font size controls do not visibly change the log text.

#### Acceptance

- [ ] Each small/medium/large A control immediately changes the computed size of the visible game-log entry text, with three distinct readable sizes.
- [ ] Show the active control and preserve the existing saved preference across reload/reconnect when browser storage is available.
- [ ] The selected size applies to existing and newly received entries, including formatted/nested log text; selection does not lose the log's reading position.
- [ ] Fix conflicting CSS or inherited font declarations rather than only changing selector state; keep the log contained in its existing panel.

#### Verification and handoff

Start with `browser-client/src/MatchEventLog.tsx`, `live-pitch.css`, `coach-match.css` and `play-brand.css`. Verify rendered computed text sizes after each control, incoming entries and preference restoration.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Fit block dice and their choices without display scrollbars

GitHub: [#138](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/138). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 11a, 2026-10-05.

#### Problem

The block-dice display should not require scrollbars.

#### Acceptance

- [ ] One, two and three block dice and their selectable outcomes fit in the visible roll area without horizontal or vertical display scrollbars.
- [ ] Keep all offered dice and associated required choices reachable; hiding overflow must not cut off an option.
- [ ] Use a responsive layout consistent with the existing unboxed dice design, central roll placement and compact icon controls.
- [ ] Retain mouse/keyboard choice mapping, focus cues and a visible selected outcome at the supported match viewports.

#### Verification and handoff

Follow-up to #116. Start with `browser-client/src/PitchDecisionOverlay.tsx` and `live-pitch.css`. Verify 1/2/3 dice, multiple concurrent reroll sources and compact viewports. Coordinate the two icon-control tickets.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Use the existing inducement reroll icon for the roll's reroll button

GitHub: [#139](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/139). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 11b, 2026-10-05.

#### Problem

The reroll control beside the dice should display only the reroll icon already used in the inducements/resources area.

#### Acceptance

- [ ] Reuse the accepted reroll image at `assets/game/ui/reroll-v1.png` (and its runtime copy), displayed as a compact icon-only reroll button.
- [ ] Provide the source name through an accessible label and hover/focus text, with clear available, pending and disabled states.
- [ ] The button submits the exact server-offered reroll choice and preserves current source accounting and consumption priority.
- [ ] Where the server offers multiple resource choices, keep their identities/labels discernible without collapsing distinct actions.

#### Verification and handoff

Follow-up to #117 and #118. Start with `browser-client/src/PitchDecisionOverlay.tsx`, `match-decision.ts`, `LiveMatchScoreboard.tsx` and the existing reroll art. Verify team-only and concurrent team/skill choices with keyboard and pointer.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Add distinct MUTP icon buttons for Pro, Brawler, Dodge and other reroll skills

GitHub: [#140](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/140). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 11c, 2026-10-05.

#### Problem

Pro, Brawler, Dodge and other skill reroll controls need distinct images displayed as buttons beside the roll.

#### Acceptance

- [ ] Inventory every currently supported server-offered skill reroll/roll-modifying choice and provide a recognizable unique MUTP-style icon for each, including Pro, Brawler and Dodge when offered.
- [ ] Keep each skill's identity visible through its accessible name and hover/focus text; do not label distinct skills with one generic reroll icon.
- [ ] Display every concurrently offered team/skill option and preserve the exact offered action IDs, actor permissions, eligibility, pending/used states and keep/decline choices.
- [ ] Reuse approved artwork where suitable; record asset provenance and sync new runtime copies through the existing asset conventions.
- [ ] Document/test how automatic skill rerolls are presented versus optional decisions, without inventing a manual choice where the server offers none.

#### Verification and handoff

Follow-up to #117. Start with `browser-client/src/match-decision.ts`, `PitchDecisionOverlay.tsx` and `assets/game/ui/`. Art and integration belong to this ticket; adding new skill/rules support is separate work. Verify representative distinct icons, concurrent Pro/team choice, Brawler and the currently exposed Dodge behavior.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Keep successful d6 rolls visible for about one second without a decision

GitHub: [#141](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/141). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 12, 2026-10-05.

#### Problem

Successful d6 rolls disappear too quickly when no decision is required. The owner confirmed that rolls in one action sequence should accumulate, then clear about one second after the final roll.

#### Acceptance

- [ ] Render every authoritative d6 roll in a successful no-decision action sequence, accumulating the revealed results in order rather than replacing or skipping intermediate dice.
- [ ] For three successful dodges plus a rush, retain all four rolled dice together until approximately one second after the final roll, then clear the sequence.
- [ ] Each new roll in the same sequence extends the accumulated display; the one-second clearing policy applies after the last revealed roll rather than independently to each die.
- [ ] When an actual decision is required, retain the relevant roll and its controls until resolved rather than clearing them on the no-decision timer.
- [ ] Presentation retention does not delay the authoritative engine, change outcomes, duplicate events or resend an action. Keep each result associated with the correct action/sequence.
- [ ] Preserve reduced-motion and spectator behavior and clear/reconcile retained presentation on reconnect so stale or duplicated dice do not reappear.

#### Verification and handoff

Start with `browser-client/src/dice-presentation.ts`, `pitch-playback.ts`, `use-pitch-playback.ts` and `LivePitch.tsx`. Verify rapid successful rolls, a decision interruption, and no stale/duplicate dice after reconnect.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

#### Confirmed product decision

Confirmed by the owner in chat: accumulate the sequence, then clear. All four results in the three-dodges-plus-rush example should remain together until about one second after the last roll.

### Move camera options, server actions and movement-plan details into a debug drawer

GitHub: [#142](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/142). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 13, 2026-10-05.

#### Problem

Create a drawer-style debug panel similar to More actions. It should expose view angle options, the valid server options list, and movement plan details.

#### Acceptance

- [ ] Add an always-reachable Debug toggle that opens/closes a MUTP-themed drawer using the More actions interaction/style pattern; keep diagnostics collapsed by default.
- [ ] Expose the existing perspective angle choices and top-down switch, the current viewer's valid server-issued actions/options, and existing movement-plan details in the drawer.
- [ ] Treat 'valid server options' as the existing Server actions list, including its actor/kind/action controls where currently available; retain normal actor/pending/stale guards.
- [ ] Details update with the accepted state and current plan. Camera changes preserve the prepared action/route and required decisions.
- [ ] Opening/closing the drawer is keyboard accessible and does not submit a game action or hide access to a required gameplay choice.

#### Verification and handoff

Start with `browser-client/src/SetupPanel.tsx` (existing Server actions and route UI), `LivePitch.tsx` (camera controls), `action-ribbon.ts` and the More actions styles. No new server administration/configuration features are implied. Verify closed/open layouts, live plan updates and camera changes during a pending decision.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Select the ball's kickoff target square directly with the mouse

GitHub: [#143](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/143). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 14, 2026-10-05.

#### Problem

The kicking coach needs to place the kick location by selecting its square on the pitch with the mouse.

#### Acceptance

- [ ] During the server's kick-placement phase, clicking a legal receiving-half square selects the canonical kick destination and shows the ball/target marker on that square.
- [ ] Submit through the existing authoritative action/confirmation flow and make the selection/confirmation behavior clear; another coach or spectator cannot place the kick.
- [ ] All supported views and both coach ends map the same visual square to the same canonical destination, including after pan/zoom and near end-zone boundaries.
- [ ] Reject outside-pitch and illegal-half selections; player artwork overhang and camera gestures cannot redirect or accidentally commit the kick.
- [ ] The target marker follows accepted state and reconciles rejected/stale requests without inventing scatter or final ball position.

#### Verification and handoff

Start with `browser-client/src/SetupPanel.tsx`, `usePitchInteraction.tsx`, `LivePitch.tsx` and the server-offered kickoff placement actions. Verify real kickoff placement through acceptance/scatter with both coach roles and a spectator.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.

### Keep standing sprites direction-independent in top-down and retain prone/stunned art

GitHub: [#144](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/144). Triage: `ready-for-agent`.

Part of #127. Planned rollup branch: `codex/fix-new-match-ui`.
Owner observation 15, 2026-10-05.

#### Problem

Top-down should not adjust standing-player sprites based on standing direction. It must still use the correct prone and stunned sprites.

#### Acceptance

- [ ] Use a stable standing sprite per player/team in top-down; movement direction and camera travel do not choose directional standing variants.
- [ ] Continue to select distinct prone and stunned sprites from authoritative player state; changing back to standing restores the stable top-down standing art.
- [ ] Perspective retains its existing direction/coach-end facing behavior, and switching views does not change the underlying player state.
- [ ] Verify both teams, normal/large players, movement playback and stand/prone/stunned transitions; anchor each pose correctly under the centering ticket.

#### Verification and handoff

Start with `browser-client/src/LivePitch.tsx`, `player-art.ts` and the playback facing state. Use existing pose assets; any sprite edits must follow `.agents/skills/team-pixel-sprites/SKILL.md`. Capture all three states in both coach views and verify perspective facing after switching back.

Follow the rollup's delivery requirements, including a user-facing change-list entry when implemented. This ticket records requested work; no implementation or reproduction is claimed.


## Third match UI adjustment batch — annotated comments

Branch: `codex/fix-new-match-ui`. Rollup: [#145](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/145). Implementation is local and uncommitted; tickets remain open for review/merge. Acceptance evidence: [UI comment verification](adr0003-ui-comment-verification.md).

Delivery decisions: Confirmed becomes shorter. Each condensed dugout retains its own team name. Plan path keeps adding waypoints; other pending proposals cancel on an empty-square click or selecting another own player. Weather uses existing five-condition artwork, icon left and text right (working assumption after clarification remained unanswered).

### Add title-only dugout condensation and dock dugouts above chat and log

GitHub: [#146](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/146).

Owner browser comment(s) 1–2. Fix branch: `codex/fix-new-match-ui`.

Add a second condense control per team, independent of existing compact/normal/expanded controls. Condensed mode hides everything except that team’s own Dugout heading and its restoration controls. Home dugout docks just above chat; away dugout just above game log. Expanded bodies grow upward without covering those panels. Preserve reserve drag/drop, player inspection and keyboard controls.

Acceptance and verification: Verify independent condense/restore, all existing modes and reserve controls; measure bounds against chat/log at 1224×604, desktop, narrow and short viewports.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.

### Align both match clocks with the team name bar and match its height

GitHub: [#147](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/147).

Owner browser comment(s) 3–4. Fix branch: `codex/fix-new-match-ui`.

Give both time-bank/turn boxes the central team-name bar’s height and align their top/bottom edges to it, preserving active/urgent clock behavior and readable labels.

Acceptance and verification: Compare measured clock and center-bar bounds at normal, narrow and short sizes; verify no overlap with team names/resources.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.

### Align both resource panels with the central scoreboard top edge

GitHub: [#148](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/148).

Owner browser comment(s) 5–6. Fix branch: `codex/fix-new-match-ui`.

Place the top of both resource/inducement boxes level with the central team-name box. Preserve source counts, hover/focus tooltips and opposing team placement.

Acceptance and verification: Measure top-edge equality and resource reachability at annotated and responsive viewport sizes.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.

### Place Game Menu below the right-hand resource panel

GitHub: [#149](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/149).

Owner browser comment(s) 7. Fix branch: `codex/fix-new-match-ui`.

Move the Game Menu trigger directly under the right-hand inducement/resource box. Preserve its dialog, tabs, keyboard focus and separation from other match controls.

Acceptance and verification: Verify layout bounds, opening/closing and focus at normal/narrow/short sizes.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.

### Show authoritative weather text and sprites between turn markers

GitHub: [#150](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/150).

Owner browser comment(s) 8. Fix branch: `codex/fix-new-match-ui`.

Populate the central weather area from server state for Nice, Very Sunny, Sweltering Heat, Pouring Rain and Blizzard. Reuse existing weather artwork where suitable; include canonical provenance and synced runtime assets. Weather text shares the turn-track horizontal plane; artwork may extend slightly below it. Working placement is icon left and text right, following the optional clarification fallback.

Acceptance and verification: Check all five native states, readable text, loaded artwork, turn-track alignment and no overlap across viewports.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.

### Compact the player action command bar

GitHub: [#151](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/151).

Owner browser comment(s) 9. Fix branch: `codex/fix-new-match-ui`.

Reduce the oversized Move/Block/Blitz/Other Action/End Turn bar, preserving clear glyphs/labels, accessible targets, disabled states and responsive layouts.

Acceptance and verification: Capture before/after; verify all actions and mandatory decisions remain reachable at normal/narrow/short sizes.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.

### Reduce Confirmed button height by reducing its padding

GitHub: [#152](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/152).

Owner browser comment(s) 10. Fix branch: `codex/fix-new-match-ui`.

The owner clarified that reducing padding should make the Confirmed button shorter. Keep its label/glyph legible and preserve review/confirmation behavior.

Acceptance and verification: Measure the smaller button and verify mouse/keyboard confirmation with native offered actions.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.

### Cancel proposed player actions through player and empty-square selection

GitHub: [#153](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/153).

Owner browser comment(s) 11. Fix branch: `codex/fix-new-match-ui`.

Remove the dedicated cancel-proposal button. Selecting another own player cancels the previous proposal and selects that player. Clicking an empty square while a proposal awaits confirmation cancels it and deselects its player without submitting a command. Preserve ordinary first-click movement targeting when no proposal exists, native active-player state, mandatory responses and setup/kickoff controls.

Acceptance and verification: Verify player switch/empty-square cancellation, removal of button, exact confirmations, zero mutation on cancellation, stale target/route cleanup, normal movement planning, and native required decisions.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.

Owner clarification: While using Plan path, keep adding waypoints; cancel other pending actions.

### Replace chat write button and message count with independent text-size controls

GitHub: [#154](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/154).

Owner browser comment(s) 12. Fix branch: `codex/fix-new-match-ui`.

Remove message counter. Replace Write Message with the same A/A/A font-size selector as game log, with independent persisted chat preference. Preserve drafting, sending, Enter/Escape and accessible mouse/touch entry.

Acceptance and verification: Measure actual message text at three sizes, persisted independent log/chat choices, click/touch/keyboard entry, drafts and exact send behavior.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.

### Reduce top padding above the game log heading

GitHub: [#155](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/155).

Owner browser comment(s) 13. Fix branch: `codex/fix-new-match-ui`.

Reduce empty space above Game Log while preserving its font selector, event content, scrolling and paging.

Acceptance and verification: Measure/capture heading inset and readable content at annotated and responsive sizes.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.

### Wrap stadium walls and crowds around both end zones with cheerleader space

GitHub: [#156](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/156).

Owner browser comment(s) 14. Fix branch: `codex/fix-new-match-ui`.

Continue matching crowd and walls around the north/south ends as well as existing sidelines. No goal posts. Reserve a clear row behind each endzone for future cheerleaders. Modest sideline details may be included. Keep game state/canonical pitch targeting separate from scenery; retain existing source-width tiling and art provenance.

Acceptance and verification: Review captures of all four crowd/wall sides and reserved rows at both coach ends, 30/40/50 degrees, top-down, pan/zoom and resize. Check assets load, avoid excessive rendering surfaces, and canonical input remains unchanged.

Related to the third UI rollup and #127. Preserve unrelated changes; add user-facing changelist and verification evidence.


## HUD refinements — 2026-10-06

Follow-up comments 1–5 under #145, same `codex/fix-new-match-ui` branch. Implementation remains local/uncommitted; full weather artwork is deferred and recorded in `TODO.md`. Verification: [HUD refinement evidence](adr0003-hud-refinement-verification.md).

### Match resource panel height to timers and team-name bar

GitHub: [#157](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/157).

Comments 1–2: reduce the padding on both home/away resource panels so their single-row height matches the timer and central team-name bar. Keep icons/counts readable and resource tooltips accessible; allow narrow-screen wrapping when needed. Verify actual geometry in the owner viewport and responsive layouts.

Part of #145, related to #127. Branch: `codex/fix-new-match-ui`. Owner browser comments, 2026-10-06. Preserve unrelated local changes; delivery remains local/uncommitted unless publication is requested.

### Remove the match window-controls overlay row

GitHub: [#158](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/158).

Comment 3: remove the entire Match window controls element (Connected, Fullscreen, Exit match and associated row). Retain existing disconnected-page recovery outside this overlay. Verify the row is absent in the rendered match and other required controls remain accessible.

Part of #145, related to #127. Branch: `codex/fix-new-match-ui`. Owner browser comments, 2026-10-06. Preserve unrelated local changes; delivery remains local/uncommitted unless publication is requested.

### Simplify match weather labels and remove the weather panel box

GitHub: [#159](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/159).

Comment 4: display native weather conditions as Nice, Blizzard, Rain, Heat and Sunny. Remove the black box/border/outline around the weather area. Retain authoritative mapping, existing interim art and turn-track alignment. Fully fleshed-out weather icons are deferred to a separate TODO ticket. Verify all five labels and the rendered transparent/outline-free container.

Part of #145, related to #127. Branch: `codex/fix-new-match-ui`. Owner browser comments, 2026-10-06. Preserve unrelated local changes; delivery remains local/uncommitted unless publication is requested.

### Suppress ordinary turn broadcasts and narrow game-step messages

GitHub: [#160](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/160).

Comment 5: routine regular turns do not need a broadcast banner, whether awaiting player activation or already moving a player. Make visible banners narrower and centered, with wrapping for longer event instructions. Verify regular play stays quiet while Quick Snap, Charge and Touchback remain readable. The later owner clarification in #163 restricts broadcasts to drive setup and kickoff events; action decisions and saved/finished notices retain their dedicated UI.

Part of #145, related to #127. Branch: `codex/fix-new-match-ui`. Owner browser comments, 2026-10-06. Preserve unrelated local changes; delivery remains local/uncommitted unless publication is requested.

### Create fully fleshed-out match weather icons

GitHub: [#161](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/161).

Deferred artwork follow-up requested in comment 4: add a TODO.md entry for complete MUTP-style weather icons covering Nice, Blizzard, Rain, Heat and Sunny. Replace interim desktop sprites with cohesive readable art, transparent exports, canonical provenance and runtime synchronization in a future artwork task. This ticket records future work; do not generate the new artwork as part of the current HUD refinement.

Part of #145, related to #127. Branch: `codex/fix-new-match-ui`. Owner browser comments, 2026-10-06. Preserve unrelated local changes; delivery remains local/uncommitted unless publication is requested.

## Game Menu and event broadcast refinement — 2026-10-06

The next two owner comments are tracked under #145 on `codex/fix-new-match-ui`. Changes are implemented locally and uncommitted. Both tickets remain open for review/merge. [Verification](adr0003-menu-event-verification.md).

### Apply MUTP typography and palette throughout Game Menu

GitHub: [#162](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/162).

Comment 1: apply the current MUTP font and palette to headings, body instructions, buttons, tabs, panels and borders across Game Options, Interface, Key Bindings and Game Log. Keep existing actions, disabled states, focus handling and log text sizing. Verify actual computed styles, desktop/short-window fit and keyboard behavior without submitting a game action.

### Restrict game-step broadcasts to drive setup and kickoff events

GitHub: [#163](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/163).

Comment 2: use the prominent broadcast only for team setup, kick placement, Quick Snap, Charge, High Kick, Solid Defence and Touchback. Routine actions, pre-match choices and saved/finished notices use their existing dedicated UI. Required action decisions temporarily suppress any retained kickoff banner; kickoff instructions return once the decision completes. This narrows the original #134 and #160 scope. Verify both coaches/spectators, native action states and required decision controls.

## Fourth match UI round — 2026-10-06

Rollup [#166](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/166) contains 13 child tickets #167–#179. [Full scope and acceptance criteria](adr0003-fourth-ui-round.md). Work remains on `codex/fix-new-match-ui`. #174's three-view vertical dugout and expanded-container drag/drop are implemented and verified locally; the other twelve tickets remain scoped. The reserve-to-occupied-square swap behavior in #172 is awaiting the already-asked owner clarification.
