# Completed-work recovery — 2026-10-07

The missing match refinements remained uncommitted in the main checkout at `08f211c50`. PRs #181–#183 were created from separate worktrees. The scoreboard source was unchanged across those merges; the local edits were never part of them.

All seven original worktrees were preserved before reconciliation: 197 dirty tracked/untracked files, hash-verified copies, original indexes, patches, seven local `rescue/20261007-*` snapshot branches and portable Git bundles. Five older stashes also have rescue refs and a supplemental bundle. The preservation manifest lives locally in `.tools/worktree-preservation-2026-10-07T04-49-46-547Z/manifest.json`. Rescue snapshots include unfinished prototypes and generated output and should not be merged wholesale.

## Reconciliation

| Work | Result |
| --- | --- |
| Root checkout's missing match UI | Recovered on refreshed `origin/main` (`247762d79`): aligned timers/resources, weather presentation, compact controls, chat/log sizes, kickoff guidance, grounded shadows and retained rolls. |
| Newer fourth-round UI | Preserved: atomic setup swaps, setup validation, board routes, opposing setup facing, opacity setting, boxed quarter-field dice, ball pulse, three-state dugouts and separate stadium structure/crowd. |
| Older flat endstand prototype | Archived; superseded by PR #182. Its geometry and test harness are excluded. |
| Website, Spectate, development tooling | Already merged; latest source retained. Dirty distribution outputs and screenshots archived as artifacts. |
| m6 investigation note | Copied to canonical TODO under #49; the long stress-run investigation remains open. |
| Older stashes | Preserved separately. Computer-opponent work already exists in merged #90; older acceptance/deployment and M43 drafts remain historical snapshots, not new deliverables. |

The older ticket mirrors and verification documents are recovered as historical evidence. Current fourth-round tickets #166–#179 are closed. #161's original weather artwork remains deferred; the restored display uses provenance-recorded desktop sprites. #129's reported black pixels still need owner-display confirmation. No new live-server gameplay or deployment acceptance is claimed by this recovery.

## Verification

- Browser unit suite: 174 tests passed; TypeScript compilation passed.
- Play production build passed, with canonical art synchronization.
- Focused native target-toolchain tests: 52 passed across adapter, action source, kickoff guidance, concession, setup and recovery scenarios, including older checkpoint compatibility.
- Browser fixture checks passed for equal-height resources, HUD responsiveness, current fourth-round behaviors, kickoff adjustments, dice, playback, independent chat/log sizing, menu events and three-state dugouts.
- Measured desktop timer, resource and central team boxes: all 52px high, top 10px, bottom 62px at 1224×604 and 1920×1080. Before recovery the committed timers were about 61px high and resources started at 34px.
- Responsive reconciliation also removes legacy 16% menu-button width caps that caused Debug/Game Menu overlap on a 375px viewport.

Browser checks exercise recorded fixtures and intent contracts. They do not establish fresh live gameplay acceptance. Local Node is 26; package/CI declares Node 24. Java checks use the pinned Temurin 21.0.11+10 and Maven 3.9.9 target toolchain.
