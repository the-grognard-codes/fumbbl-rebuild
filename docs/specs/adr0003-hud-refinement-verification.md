# HUD refinements — 2026-10-06

> Historical local-work evidence, recovered on 2026-10-07. The reconciliation report in [completed-work-recovery.md](completed-work-recovery.md) records current verification and superseded designs. Earlier results below are not a fresh live-server acceptance run.

Later owner clarification [#163](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/163) supersedes #160's broader broadcast policy below: only drive setup and kickoff events now broadcast; action decisions and saved/finished notices retain their dedicated UI. See [the later verification](adr0003-menu-event-verification.md).

The five follow-up browser comments are tracked by [#157](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/157), [#158](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/158), [#159](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/159), [#160](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/160) and the deferred artwork [#161](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/161), under #145. Branch: `codex/fix-new-match-ui`. Implementation remains local and uncommitted; issues remain open for review/merge.

| Ticket | Change | Acceptance evidence |
| --- | --- | --- |
| #157 | Home/away resource vertical padding reduced from 5px to 2.5px, retaining icon size. Resource buttons use block layout to remove inline baseline spacing found on the live page. | Browser assertions measure both single-row resource panels at 52px, equal to clocks/team bar at 1224×604 and 1920×1080. The actual live page was measured as well. Narrow layouts retain wrapping. |
| #158 | Entire Match window controls overlay removed from match rendering and its coach-specific layout CSS removed. | Browser checks confirm the row and its Fullscreen/Exit match buttons are absent; Game Menu and other interaction checks pass. Existing initial disconnected recovery remains separate. |
| #159 | Labels are Nice, Blizzard, Rain, Heat and Sunny. Weather container has no outline, border, background or shadow. | Unit mapping checks; browser checks all five labels and loaded interim sprites, plus actual computed container styles. |
| #160 | Ordinary regular play returns no broadcast, including during player activation. Required decisions and exceptional game steps retain a centered banner capped at 420px. | Unit coverage for quiet regular play and visible required decisions; browser checks quiet idle/active play, Touchback centering/width and wrapped Charge instructions, plus existing Quick Snap/status/decision fixtures. |
| #161 | Future fully fleshed-out MUTP weather icons recorded in `TODO.md`, including all five conditions, transparency/provenance and runtime synchronization. | TODO and GitHub mirror present. New artwork intentionally remains deferred as requested. |

Completed verification:

- Browser unit suite: **167/167 passed**.
- TypeScript and production play/site build passed; site input checks passed.
- `hud-comments-ui.mjs`: resources, removed controls, all weather labels/styles, quiet regular turns, narrower required banners, existing cancellation/docking contracts and five viewport captures passed.
- `coach-hud-ui.mjs`: existing resource/clock/turn, inspection, confirmation, chat/log and responsive contracts passed.
- `match-adjustments-ui.mjs`: log, kickoff placement, Quick Snap, exceptional status and debug groups passed.
- `dice-ui.mjs` and `push-choice-ui.mjs`: required decision rendering and exact authoritative choices passed.
- Actual local match: both resource panels, both clocks and the central team bar measured **52px**; weather displayed **Nice**, with no regular broadcast or window-controls row. `git diff --check` passed.

Evidence directory: `browser-client/test-output/hud-refinement-157/`. The HUD fixture images show Charge in the narrowed banner at five viewport sizes; `live-match-refined-157.jpg` verifies the actual regular-turn layout. Fixtures establish presentation and intent contracts. No new live game action was submitted for this verification, and this batch changes no server game logic.
