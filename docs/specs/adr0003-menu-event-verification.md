# Game Menu and event broadcast verification — 2026-10-06

> Historical local-work evidence, recovered on 2026-10-07. The reconciliation report in [completed-work-recovery.md](completed-work-recovery.md) records current verification and superseded designs. Earlier results below are not a fresh live-server acceptance run.

[#162](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/162) and [#163](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/163) are children of #145. Branch: `codex/fix-new-match-ui`. Changes remain local and uncommitted; tickets remain open for review/merge.

| Ticket | Result | Evidence |
| --- | --- | --- |
| #162 | Game Menu uses MUTP typography, navy panels, blue borders, cyan title/selected tabs and yellow section headings. Existing log entry sizing remains adjustable. | Computed fonts and colors across all four tabs at 1237×617, 640×330 and 375×300; vertical scrolling without horizontal overflow; focus wrap, Escape/opener focus, all three log sizes and disabled spectator actions. Actual local menu styles and screenshot also checked. |
| #163 | Broadcast is limited to drive setup and kickoff instructions. Ordinary action/target states, pre-match choices and suspended/finished notices produce no banner. Required action decisions suppress retained event instructions until the interruption ends. | All eight required decision kinds, native Blitz journey states, setup/kick placement and kickoff instructions covered by unit tests; browser checks across coaches/spectators and intact follow-up/coin-toss controls. Actual regular-turn page has no banner. |

This supersedes the broader broadcast policy described in the earlier #134/#160 evidence. Required decisions still use existing dedicated dialogs, dice or pitch controls; save/resume and completed-result UI are unchanged.

Completed checks:

- Browser unit suite: **169/169 passed**.
- `game-menu-events-ui.mjs`: all menu/theme/keyboard/responsive and event/decision contracts passed. No game actions submitted.
- `coach-hud-ui.mjs` and `hud-comments-ui.mjs`: existing resource, clock, turn, inspection, confirmation, chat/log, cancellation and responsive checks passed.
- `match-adjustments-ui.mjs`: log, kickoff placement, Quick Snap, status and debug groups passed.
- `dice-ui.mjs`: native d6/block dice and required choices, including follow-up, passed for its existing coach/spectator/replay fixtures.
- TypeScript and production play/site build passed; site checks passed for all 13 public-site inputs. `git diff --check` passed.

Evidence directory: `browser-client/test-output/menu-events-162/` (12 menu tab/viewport captures plus `live-menu-162.jpg`); unit output: `browser-client/test-output/menu-events-unit-tests.log`. The local preview bundles were refreshed with a cache-busted loader, preserving runtime configuration. Live verification only opened/closed Game Menu and read presentation; it submitted no gameplay action. Fixtures establish presentation contracts, not new live-playability evidence. No server gameplay code changed in this batch.
