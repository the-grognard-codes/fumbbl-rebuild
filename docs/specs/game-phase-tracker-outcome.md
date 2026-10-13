# Game phase tracker outcome

Delivery: [PR #255](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/255), closing [#252](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/252), [#253](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/253) and [#254](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/254). The [approved design](game-phase-tracker-ticket-plan.md) contains the clarified behavior and detailed validation record.

The BB2025 browser HUD now shows a stacked start-of-drive tracker beneath the receiving team's resources. It follows authoritative native steps and current-drive public results, uses existing turn-counter styling, and disappears when ordinary player actions become available.

| Approved requirement | Delivered behavior and evidence |
| --- | --- |
| Ordered phases and current/completed styling | Optional validated projection feeds ordered rows with current-step semantics; phase/protocol checks and native tests cover the sequence. |
| Receiving-team side beneath resources | Canonical home/away identity controls placement for coaches and spectators; browser checks cover both sides and four viewports. |
| Skip inapplicable automatic checks | Current-drive reports establish secret-weapon and KO applicability; tests cover failed KO recovery, handled weapon checks and drive reset. Applicable rows arrive completed without engine pauses. |
| Four interactive kickoff rows | High Kick, Solid Defense, Quick Snap and Charge! insert an indented row and receive the highlight; native and browser checks cover the events and passive viewers. |
| Hide before normal actions | Native integration checks every kickoff total (2–12); browser checks cover the ordinary-play handoff before submitting an action. |
| Recovery and permitted viewer projection | Optional metadata preserves older checkpoint readability; refresh/recovery and spectator checks pass. |
| Preserve gameplay and existing HUD access | No sequence or game-command changes; desktop/narrow checks cover menu, dugout, instructions and the current row. The latest change list includes the feature. |

Automated evidence includes 266 browser unit tests, the production play build, 64 focused server/native checks, tracker and existing HUD/menu browser checks, and 15 validation inventory checks. The reported reroll test race was reproduced with a controlled input delay and fixed in the fixture; all 56 choice and 22 accounting cases passed. Independent correctness review and self-review found no remaining actionable issue.

Full local Java 21 verification and the required GitHub checks form the final merge gate. GitHub retains their execution results and the PR's merge state. The owner authorized commit, PR publication and merge after passing checks on 2026-10-11. Manual UI validation remains owned by the user; no deployment is part of this delivery.

The validation fix records a reusable lesson: tests of duplicate input while a request is pending must control acknowledgement delivery, rather than assume two automation calls finish before a fixed reply timer.
