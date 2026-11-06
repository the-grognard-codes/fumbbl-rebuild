# Bug fix roundup #6

Approved 2026-11-05. Branch: `bug-roundup-6`, based on `ee3496917`. The user accepted the implementation and authorized commit, PR, successful CI, merge, branch cleanup, completed-feature tracking and dev-local shutdown. Unrelated changes in the main checkout are preserved.

## Issues and acceptance

| Issue | Scope | Acceptance |
| --- | --- | --- |
| [#454](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/454) | Touchdown presentation | Endzone movement, TOUCHDOWN splash, then drive tracker/sequence. Keep the previous score during movement and reveal the new score when the splash starts. |
| [#455](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/455) | Concessions | Any priority decision, including drive setup, completes concession and synchronizes coaches/spectators. |
| [#456](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/456) | Pass targeting | Explicit confirmed Pass exposes small movement/throw toggle beside Pass. Default movement; preserve route; target from endpoint or after completed movement; empty, opponent and friendly targets; confirm throw; normal teammate shortcuts preserved. |
| [#457](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/457) | Failed Loner/Pro | Preserve original dice faces, positions and rendered identity without replaying the roll; genuine rerolls still animate. |
| [#461](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/461) | Block prerequisites | Proposed block dice remain above prerequisites/reroll decisions, replaced on block roll or fade only on definitive cancellation. |
| [#458](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/458) | Bogruk kickoff participation | Always participate legally in Charge!, Quick Snap and Solid Defence using simple weak choices. |
| [#462](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/462) | Computer coach resources | Bogruk accepts Apothecary/Bribe/Argue the Call; Random accepts each independently 50/50. Both choose least harmful Apothecary result. |
| [#459](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/459) | Turn counters | Remove confirmed stray black rectangular outline, preserving tiles and active-turn highlight. |

## Constraints

Browser V2, BB2025, replay/recovery compatibility, existing authoritative legality and UI conventions. No additional optional resources or unrelated redesign. Deliver through a PR after successful validation CI, then remove the working branch and stop dev-local. No remote environment deployment is requested.

## Validation manifest

- Focused browser playback/presentation and pass interaction regressions, then browser unit tests and build.
- Focused native concession and computer candidate/policy regressions, then pinned Java/server validation.
- Real dev-local startup, readiness checks, browser smoke and screenshots at desktop and compact widths.
- Self-review against each issue. Record results and gaps in bug-fix-roundup-6-outcome.md and on GitHub issues.

## Status

Each of the eight original bug items now has a separate issue, in the original list order above. Initially grouped dice and computer-coach work was split: #457 retains failed Loner/Pro, #461 tracks block prerequisites, #458 retains kickoff participation, and #462 tracks resources. GitHub bodies and cross-linked comments record the individual fixes and validation; earlier combined comments remain as history.

The user manually verified the original changes except #458, whose kickoff events require random occurrence, accepted the final #454 score-timing adjustment and authorized delivery. Bogruk kickoff participation has deterministic native-offer integration coverage; random-event manual validation remains outstanding. CI and merge status are recorded in the delivery follow-up.

See [the implementation outcome](bug-fix-roundup-6-outcome.md) for acceptance evidence, startup verification, optional test skips, and the separately tracked pre-existing recovery finding.
