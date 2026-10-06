# ADR0003 follow up tickets

Owner observations from 2026-10-05 are split into eight focused GitHub tickets. These extend or correct the completed coach-oriented match UI from [ADR 0003](../adr/0003-coach-oriented-angled-pitch.md) and [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101). GitHub owns ticket state; this file mirrors the agreed scope and acceptance criteria.

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
