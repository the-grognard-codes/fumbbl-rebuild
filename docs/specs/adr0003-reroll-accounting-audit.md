# BB2025 reroll accounting audit

Audit before correction for #118, at merged main `00570af7000819aee372fd6ef3948e8bdae807c2`.

`bb2025/RollMechanic.useReRoll` treats only `TEAM_RE_ROLL` as the guaranteed team family. The default path consumes Brilliant Coaching, then other native drive sources, Leader and ordinary rerolls. Mascot is tried only for an explicitly selected Mascot source, so the generic team path skips it. Named special/Leader selections can bypass higher-priority sources; some named sources are not recognized as team-family uses at all. The team-resource report also receives the initial false success value before the Loner check.

`StateMechanic.updateLeaderReRollsForTeam` adds/removes an unused Leader reroll according to a registered Leader's pitch availability. `StepEndTurn.removeReRollsLastingForDrive` expires Brilliant Coaching and other drive sources; `StateMechanic.startHalf` replenishes ordinary training rerolls, resets Leader registration and Mascot use during the first two halves. Existing native conditions, Team Captain preservation and Loner checks must remain.

`TurnData.reRolls` already includes guaranteed Brilliant Coaching, Leader and ordinary sources. `SetupSession` projects that count to both coaches and spectators, and `hudResources` displays it directly. Mascot has separate inducement uses and a conditional success check. It will remain outside the guaranteed total; the owner's single combined total is permitted, not required. Pro remains a separate skill choice.

The correction must enforce **Brilliant Coaching > Mascot > Leader > Team** among the four requested sources. Native Pump up the Crowd/Star of the Show drive sources retain their existing precedence after Brilliant Coaching and before Mascot/Leader; Mascot choices are suppressed until these higher-priority drive sources are unavailable. Coexistence scenarios verify that a choice's label and report identify the same source. A Mascot success spends only its conditional attempt; failure may consume the next guaranteed source only through a permitted fallback. Decline, wrong actor, stale intent and exact retry must not spend extra resources.

Verification and final outcome are recorded in the delivery ledger and retrospective.
