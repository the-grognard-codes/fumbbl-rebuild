# issues

These are untriaged ideas. When one becomes scoped work, create a GitHub issue
and add its URL here alongside the local notes.
- dump off + pass block
- sketches for games
- spec interaction for games

# season 3

## Re-Rolls
- Team Captain
- Mascot (with optional TRR)
- TRR for Pro on Block die (with Mascot)

## ADR0003 follow up tickets

Owner observations from 2026-10-05. Detailed scope and acceptance criteria are in
[the ticket mirror](docs/specs/adr0003-follow-up-tickets.md).

- [ ] [#111 Compare the live coach view with the accepted ADR0003 reference](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/111) — `needs-triage`.
- [ ] [#112 Add selectable 30 and 50 degree perspective coach views](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/112) — `ready-for-agent`.
- [ ] [#113 Preserve player sprites during pushback square selection](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/113) — `ready-for-agent`.
- [ ] [#114 Make pass declaration movement and target confirmation work together](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/114) — `ready-for-agent`.
- [x] [#115 Color pass ranges on the pitch and account for weather](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/115) — `ready-for-agent`.
- [x] [#116 Show dice directly over the pitch without enclosing boxes](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/116) — `ready-for-agent`.
- [x] [#117 Show every eligible reroll option beside the current roll](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/117) — `ready-for-agent`.
- [x] [#118 Verify reroll totals and consume sources in the requested priority](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/118) — `ready-for-agent`.

Reroll consumption priority: **Brilliant Coaching > Mascot > Leader Reroll > Team Reroll**.

## Second match UI adjustment batch

Owner observations from 2026-10-05. Rollup:
[#127 Match UI adjustment batch: kickoff, pitch rendering, dice and diagnostics](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/127).
Recovery integration branch: `recovery/completed-local-work-20261007`. Scope, acceptance criteria and confirmed
product decisions are mirrored in
[the second ticket batch](docs/specs/adr0003-follow-up-tickets.md#second-match-ui-adjustment-batch-2026-10-05).
Implementation and per-ticket evidence are in [the verification report](docs/specs/adr0003-ui-adjustment-verification.md). All 17 child tickets remain open for review; #129 also needs confirmation of the reported black pixels on the owner's display. GitHub retains the canonical `ready-for-agent` label pending delivery/review.

- [ ] [#128 Fix Quick Snap player selection, square highlights and movement counter](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/128) — `ready-for-agent`; observation 1.
- [ ] [#129 Fix black or missing pitch and scenery regions in the 30 degree view](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/129) — `ready-for-agent`; observation 2.
- [ ] [#130 Use held right mouse button for pitch travel and the mouse wheel for zoom](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/130) — `ready-for-agent`; observation 3.
- [ ] [#131 Add projected player ground shadows matching the approved design](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/131) — `ready-for-agent`; observation 4.
- [ ] [#132 Correct player square alignment across every pitch viewing angle](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/132) — `ready-for-agent`; observation 5.
- [ ] [#133 Explain touchbacks and the required receiving-player choice in game-status text](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/133) — `ready-for-agent`; observation 6.
- [ ] [#134 Add a general current-game-status text area to the match UI](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/134) — `ready-for-agent`; observation 7.
- [ ] [#135 Remove follow-up screen fading and compact the MUTP decision prompt](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/135) — `ready-for-agent`; observation 8.
- [ ] [#136 Place rolled dice nearer the center of the visible pitch](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/136) — `ready-for-agent`; observation 9.
- [ ] [#137 Make the game-log font size selector change the displayed text](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/137) — `ready-for-agent`; observation 10.
- [ ] [#138 Fit block dice and their choices without display scrollbars](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/138) — `ready-for-agent`; observation 11a.
- [ ] [#139 Use the existing inducement reroll icon for the roll's reroll button](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/139) — `ready-for-agent`; observation 11b.
- [ ] [#140 Add distinct MUTP icon buttons for Pro, Brawler, Dodge and other reroll skills](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/140) — `ready-for-agent`; observation 11c.
- [ ] [#141 Keep successful d6 rolls visible for about one second without a decision](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/141) — `ready-for-agent`; observation 12.
- [ ] [#142 Move camera options, server actions and movement-plan details into a debug drawer](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/142) — `ready-for-agent`; observation 13.
- [ ] [#143 Select the ball's kickoff target square directly with the mouse](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/143) — `ready-for-agent`; observation 14.
- [ ] [#144 Keep standing sprites direction-independent in top-down and retain prone/stunned art](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/144) — `ready-for-agent`; observation 15.


- [#145 Third match UI adjustment batch](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/145): 11 child tickets #146–#156 cover the 14 annotated comments; recovered on `recovery/completed-local-work-20261007`. [Scope](docs/specs/adr0003-follow-up-tickets.md#third-match-ui-adjustment-batch--annotated-comments) and [verification](docs/specs/adr0003-ui-comment-verification.md). Open pending review/merge.


- [#157–#160 HUD refinements](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/157): equal resource height, removed window-controls row, short unboxed weather and quiet regular turns with narrower required banners. Implemented locally; [verification](docs/specs/adr0003-hud-refinement-verification.md). [#161 weather artwork](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/161) is deferred in TODO.md.

- [#162 MUTP Game Menu](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/162) and [#163 setup/kickoff-only broadcasts](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/163): implemented locally on `codex/fix-new-match-ui` under #145; [verification](docs/specs/adr0003-menu-event-verification.md). #163 narrows the broadcast scope in #134/#160. Open pending review/merge.

- [#166 Fourth match UI round](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/166): 13 child tickets #167–#179; [scope and acceptance criteria](docs/specs/adr0003-fourth-ui-round.md). #174 was merged in PR #181; the remaining fourth-round changes, including atomic friendly setup swaps, were merged in PR #182. All fourth-round tickets are closed. Those newer behaviors take precedence over older archived UI prototypes.

## Fifth match UI round

Approved 2026-10-07. [Scope and acceptance criteria](docs/specs/adr0003-fifth-ui-round.md). Each slice is delivered through a separate reviewed, validated, committed and merged PR before continuing. Stadium work is in its separate design chat; unfinished setup storage remains deferred in TODO.

- [ ] [#185 List my unfinished matches on the game setup page](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/185).
- [ ] [#186 Concede an activated match from the game setup page](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/186) — blocked by #185.
- [ ] [#187 Open matches in the current tab and verify authenticated direct resume](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/187).
- [ ] [#188 Check activation traits before Throw/Kick Team Mate movement and confirm teammate selection](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/188).
- [ ] [#189 Use one skill reroll icon and test Pro before selecting the die](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/189).
- [ ] [#190 Revise the pixel ball and its persistent pulsing highlight](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/190).
- [ ] [#191 Correct residual player body and shadow centering](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/191).
- [ ] [#192 Color movement squares by native dodge and rush checks](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/192).
- [ ] [#193 Show additional movement checks as labeled pitch indicators](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/193).
- [ ] [#194 Use team-only coach chat labels and numbered spectator speakers](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/194).
- [ ] [#195 Streamline action and committed-movement logs with persistent Game Log controls](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/195).
- [ ] [#196 Log activation checks, follow-up rolls, and reroll attempts chronologically](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/196) — blocked by #195.
- [ ] [#197 Explain block dice choices, skill use, pushes, and knockdowns in the log](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/197) — blocked by #196.

## Opposing player threat markings

Approved 2026-10-10. [Scope, decisions, screenshot, and acceptance criteria](docs/specs/opposing-player-threat-ticket-plan.md).
Branch: `feature/opposing-player-threat-tickets`. Implementation, focused checks and code self-review are complete. Owner manual validation accepted the original feature; the combined rushing/Tackle marker refinement passed automated checks and awaits owner recheck. The owner authorized one delivery PR for all three tickets, including the parallel local browser runner, with merge after passing checks. The delivery PR closes these tickets; GitHub records their final state and PR link. [Verification and manual-review handoff](docs/verification/opposing-player-threat-markings.md).

- [ ] [#247 Show opposing tackle-zone colors with Game Settings controls](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/247) — no blockers.
- [ ] [#248 Mark opposing Tackle zones with rounded T warnings](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/248) — blocked by #247.
- [ ] [#249 Stripe opposing movement-skill zones with per-skill controls](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/249) — blocked by #247 and #248.

Markings appear during the selecting coach's regular turn or Charge! kickoff event.
The stripe skills are Prehensile Tail, Diving Tackle, Tentacles, and Shadowing; Tackle uses a hollow white triangle with a red T. Arm Bar is excluded.
Use one shared diagonal pattern, neutral hatching when colors are off, and persistent controls enabled by default.
