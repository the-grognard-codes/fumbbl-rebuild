# issues

Backlog review completed **2026-10-28**: 29 completed and six superseded issues
were closed at the owner's request, each with a dated review note. Exactly 25
issues remain open for owner manual review. See the
[issue-by-issue audit and closure outcome](docs/reviews/open-issue-audit-2026-10-28.md).
Historical implementation notes below retain their original validation limits.

These are untriaged ideas. When one becomes scoped work, create a GitHub issue
and add its URL here alongside the local notes.
- [x] [#384 Java 21 baseline](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/384): owner accepted the implementation and authorized CI-gated publication; see the [outcome and validation evidence](docs/specs/java21-baseline-outcome.md).
- [ ] [#383 Optional Java source modernization](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/383): deferred until after the focused Java 21 migration. See the [candidate inventory, risks and validation plan](docs/specs/java-modernization-inventory.md).
- dump off + pass block
- sketches for games
- spec interaction for games

## Bug fix roundup #4

Follow-up [#355 Offer a bribe after declining Argue the Call on a spotted foul](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/355)
tracks the newly reported stalled foul decision on the same working branch.
Implemented and automated validation is recorded in the follow-up report and
issue. The owner could not resume the specific live game. Keep #355 and #347
open after merge for manual validation when their kickoff events occur.
The owner has confirmed Multiple Block now works as expected (#351).

Owner observations from 2026-10-24. All ten reports have individual issues on
the single working branch `fix/bug-fix-roundup-4`. Scope, acceptance criteria,
and validation plans are mirrored in
[the roundup ticket plan](docs/specs/bug-fix-roundup-4.md).
The owner resolved #344, #346, #348, #349, #350, #352 and #353.
#345, #347 and #351 remain open; the owner has confirmed #345 works as expected.
[#354](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/354)
tracks the requested bottom-aligned log-dice preview. See the
[review follow-up](docs/specs/bug-fix-roundup-4-followup.md). For item 10, the owner confirmed that an
equal-length ball-free route must add no risk or distance: no additional or
harder Dodge, Rush, Jump, or Leap rolls. Implementation, review and validation
are recorded in [the outcome report](docs/specs/bug-fix-roundup-4-outcome.md).
The apothecary timing report did not reproduce; its current behavior is protected
  by new regressions. CI-gated PR delivery is authorized; review servers are stopped.

- [x] [#344 Keep apothecary-saved KO players stunned through their next active-team turn](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/344).
- [ ] [#345 Allow unactivated standing and prone players to Blitz adjacent opponents directly](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/345).
- [x] [#346 Prevent position-changing hover effects from oscillating under a stationary pointer](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/346).
- [ ] [#347 Allow Solid Defence players moved to reserves to redeploy legally](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/347).
- [x] [#348 Scale game-event-log dice with the selected text size](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/348).
- [x] [#349 Center log d8 values and use a triangular d16 face that fits every value](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/349).
- [x] [#350 Display each armor and injury roll once with both d6 on one row](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/350).
- [ ] [#351 Resolve BB2025 Multiple Block in selected target order with clear targeting guidance](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/351).
- [x] [#352 Start every drive with players facing the opposing end zone](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/352).
- [x] [#353 Prefer equal-length safe movement routes that avoid the grounded ball](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/353).

# season 3

## MUTP site and match fixes

Owner observations from 2026-10-11. Ten tickets, one per reported item,
are prepared on `fix/mutp-site-match-issues` in
[the ticket plan](docs/specs/mutp-site-match-fixes-ticket-plan.md).
The original nine drafts are approved and the owner requested the additional
adjacent-Block/distant-Blitz ticket. All ten GitHub issues are published with
`ready-for-agent` and have no ticket blockers. Confirmed scope includes a fifteen-minute idle window in local and
deployed environments and permanent removal of obsolete saved teams across all
environments while preserving current valid teams and existing match records.

Implementation and self-validation are recorded in the
[manual validation handoff](docs/verification/mutp-site-match-fixes.md).
The owner accepted the changes on 2026-10-12 and requested a scoped commit,
pull request and merge after successful GitHub checks. The completed items below
record that acceptance; GitHub tickets close with the merging pull request.
The saved-team cleanup completed in the actual local-review database on
2026-10-12: 36 obsolete teams deleted, five current teams preserved, and all
non-target table checksums unchanged. The owner's hosted DEV and PROD inventories
both found zero saved teams, so no hosted deletion is needed. Current-team
selection and match resume/replay remain for manual UI validation. Timeout
deployment and the live fifteen-minute boundary also remain for runtime validation.

- [ ] [#256 Show sign-in state as one account link in the MUTP top bar](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/256).
- [ ] [#257 Fit every Game Menu option without horizontal scrolling](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/257).
- [ ] [#258 Award and display both Get the Ref kickoff bribes](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/258).
- [ ] [#259 Allow Throw Team Mate targets on occupied squares](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/259).
- [ ] [#260 Prefer straight movement routes when paths are equivalent](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/260).
- [ ] [#261 Extend idle match connections to fifteen minutes](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/261).
- [ ] [#262 Permanently remove obsolete saved teams from earlier scaffolds](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/262).
- [ ] [#263 Deselect a player with right click while preserving waypoint undo and pitch travel](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/263).
- [ ] [#264 Show Throw Team Mate and Kick Team Mate difficulty ranges](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/264).
- [ ] [#265 Default adjacent opponent targets to Block in the streamlined declaration flow](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/265).

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
Implementation and per-ticket evidence are in [the verification report](docs/specs/adr0003-ui-adjustment-verification.md). The 2026-10-28 review closed the completed and superseded tickets selected in the audit. #129 remains open for confirmation of the reported black pixels on the owner's display; historical validation limits still apply. GitHub remains authoritative for issue states and labels.

- [x] [#128 Fix Quick Snap player selection, square highlights and movement counter](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/128) — `ready-for-agent`; observation 1.
- [ ] [#129 Fix black or missing pitch and scenery regions in the 30 degree view](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/129) — `ready-for-agent`; observation 2.
- [x] [#130 Use held right mouse button for pitch travel and the mouse wheel for zoom](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/130) — `ready-for-agent`; observation 3.
- [x] [#131 Add projected player ground shadows matching the approved design](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/131) — `ready-for-agent`; observation 4.
- [ ] [#132 Correct player square alignment across every pitch viewing angle](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/132) — `ready-for-agent`; observation 5.
- [x] [#133 Explain touchbacks and the required receiving-player choice in game-status text](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/133) — `ready-for-agent`; observation 6.
- [ ] [#134 Add a general current-game-status text area to the match UI](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/134) — `ready-for-agent`; observation 7.
- [x] [#135 Remove follow-up screen fading and compact the MUTP decision prompt](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/135) — `ready-for-agent`; observation 8.
- [x] [#136 Place rolled dice nearer the center of the visible pitch](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/136) — `ready-for-agent`; observation 9.
- [x] [#137 Make the game-log font size selector change the displayed text](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/137) — `ready-for-agent`; observation 10.
- [x] [#138 Fit block dice and their choices without display scrollbars](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/138) — `ready-for-agent`; observation 11a.
- [x] [#139 Use the existing inducement reroll icon for the roll's reroll button](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/139) — `ready-for-agent`; observation 11b.
- [x] [#140 Add distinct MUTP icon buttons for Pro, Brawler, Dodge and other reroll skills](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/140) — `ready-for-agent`; observation 11c.
- [x] [#141 Keep successful d6 rolls visible for about one second without a decision](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/141) — `ready-for-agent`; observation 12.
- [x] [#142 Move camera options, server actions and movement-plan details into a debug drawer](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/142) — `ready-for-agent`; observation 13.
- [x] [#143 Select the ball's kickoff target square directly with the mouse](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/143) — `ready-for-agent`; observation 14.
- [x] [#144 Keep standing sprites direction-independent in top-down and retain prone/stunned art](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/144) — `ready-for-agent`; observation 15.


- [#145 Third match UI adjustment batch](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/145): 11 child tickets #146–#156 cover the 14 annotated comments; recovered on `recovery/completed-local-work-20261007` and merged through PR #184. [Scope](docs/specs/adr0003-follow-up-tickets.md#third-match-ui-adjustment-batch--annotated-comments) and [verification](docs/specs/adr0003-ui-comment-verification.md). Closed as completed after the 2026-10-28 review; later stadium criteria are superseded, while #161 weather artwork remains open independently.


- [#157–#160 HUD refinements](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/157): equal resource height, removed window-controls row, short unboxed weather and quiet regular turns with narrower required banners. Implemented locally; [verification](docs/specs/adr0003-hud-refinement-verification.md). [#161 weather artwork](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/161) is deferred in TODO.md.

- [#162 MUTP Game Menu](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/162) and [#163 setup/kickoff-only broadcasts](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/163): recovered with #145 and merged through PR #184; [verification](docs/specs/adr0003-menu-event-verification.md). #163 narrows the broadcast scope in #134/#160. Both closed as completed after the 2026-10-28 review.

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

## Miscellaneous match fixes - batch 6

Twelve observations on branch `fix/misc-fix-rollup-6` are tracked individually in GitHub issues #279-#290. [Ticket scope](docs/specs/misc-fix-rollup-6.md) and [verification](docs/verification/misc-fix-rollup-6.md). Fixes and follow-ups are accepted; Get the Ref and computer-player apothecary support are verified without additional production changes. The owner requested commit, PR publication, merge after passing CI and local branch removal. Deployment is outside this request.
