# ADR0003 follow up delivery

The owner approved implementation of ready tickets #112 through #118 on 2026-10-05, including a separate branch, implementation, review, validation, standard commit, PR, automated checks and merge cycle for each slice. Ticket #111 remains a separate triage investigation.

Baseline: merged main at da413b945. The existing feat/ui-perspective-change branch and its unmerged dev-local/computer commit 9a2fdf6bb are preserved separately. The ticket index and [scope mirror](adr0003-follow-up-tickets.md) enter repository history with the first slice.

## Slice plan and affected checks

| Slice | Ticket | Required evidence |
| --- | --- | --- |
| Camera presets | #112 | Projection round trips and travel invariants at 30/40/50 degrees; both coach ends; staged input retained; reference captures; browser build and projected-pitch interaction |
| Pushback artwork | #113 | Reproduced placeholder state; ordinary/chain push rendering and legal destination submission; unavailable-art fallback; player-art and push interaction regressions |
| Pass workflow | #114 | Declare Pass, move, pickup, select recipient, confirm; native pass/pickup outcomes and browser staging/actor guards |
| Pass distance and weather | #115 | Native range boundaries and weather restrictions/modifiers; strict versioned projection; colored grid in each camera; movement refresh and forbidden-target rejection |
| Unboxed dice | #116 | Revealed d6/block choices, focus/selection, reduced motion, spectator/replay; visual captures and dice/playback interactions |
| Reroll choices | #117 | Concurrent Pro/team options, skill-only/team-only, exact offered choices, actor/retry guards; native prompt and browser regressions |
| Reroll accounting | #118 | Brilliant Coaching > Mascot > Leader > Team source priority, conditional Mascot, eligibility, expiry/reset, native counts/log and browser projection |
| Integrated acceptance and retrospective | All seven | Real-server journeys covering the changed behavior, CI results and requirement-by-requirement assessment against ADR0003 and the ticket mirror |

Use focused checks first and broaden only for concrete cross-stack risks. Each slice records its tests, PR and merge revision here. Validation failures receive corrections before merge. Retain the 40-degree default, 90-degree tactical view, canonical input, server authority and existing match capabilities.

## Slice ledger

Camera presets (#112): implementation ready for review. The new regression first failed with `40 !== 30`, then passed for both ends and five travel positions. All 141 browser units, 12 focused projection/scenery checks, the production play build and projected-pitch interaction passed. Reference follow-up rendering verified 390 cells and 22 anchors in eight captures plus fixed calibration and scenery registration over 20 camera positions. Screenshots are retained under `test-output/adr0003-follow-up/camera/` and the v4 reference gallery. PR/checks/merge remain pending.

The other six implementation slices are pending. Completion requires evidence and a merged PR for each; checkboxes in the scope mirror remain future acceptance requirements until verified.
