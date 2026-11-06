# Bug fix roundup #6: implementation outcome

## Delivery

- Branch: `bug-roundup-6`, based on `ee3496917`.
- Worktree: `.tools/roundup6-worktree` under the primary checkout.
- The user accepted the implementation and authorized commit, PR, successful validation CI, merge, branch cleanup, completed-feature tracking and dev-local shutdown. The original checkout's unrelated edits are preserved.
- Scope and issue links: [approved specification](bug-fix-roundup-6.md).

## Acceptance results

| Issue | Implemented behavior | Evidence |
| --- | --- | --- |
| [#454](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/454) | Score stays at its previous value during scoring movement, updates when the TOUCHDOWN splash starts, and stays updated afterward. Drive tracker follows the completed announcement, including a late transcript and a pending setup decision. | roundup6-presentation-ui covers home/away scoring, full time without a new drive, spectator view and recovery; ordered playback regression. |
| [#455](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/455) | Mandatory prompts keep Game Menu/concession accessible. Native integration checks passed before production changes; they now protect setup/kickoff priority checkpoints, both coaches, spectators, retry and recovery. | concession-priority-ui; StartOfDriveConcessionTest; existing concession and publisher tests. |
| [#456](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/456) | Confirmed Pass shows a small targeting toggle next to Pass. Movement is default; toggling preserves routes. Coach can target empty, opponent or friendly squares from a route endpoint or after completing movement, then confirm. Server validates every target and preserves pending plans through interruptions/recovery. Existing teammate shortcuts stay intact. | pass-square-target-ui (both orientations); 28 SetupSessionMovement tests; 30 adapter tests; native square-pass fixtures and protocol tests. |
| [#457](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/457) | Failed Loner/Pro preserves original dice, including a separate decline decision and uphill-block priority changes for coaches/spectators. Actual same-face rerolls still animate. | roundup6-presentation-ui and unit checks; native Pro/reroll/playback interaction suites. |
| [#461](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/461) | Proposed block dice remain above prerequisite rolls through pending rerolls, are replaced when the block rolls, and fade only on definitive cancellation. | roundup6-presentation-ui covers ordering, retention, replacement and cancellation. |
| [#458](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/458) | Bogruk participates legally in Charge!, Quick Snap and Solid Defence with simple choices, then finishes the event. | ComputerCoachNativeDecisionTest.bogrukParticipatesInEveryOfferedKickoffEventAndFinishesLegally; computer-player policy regressions. |
| [#462](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/462) | Bogruk accepts Apothecary/Bribe/Argue the Call; Random accepts independently 50/50. Both select the least harmful Apothecary result. | 49 computer-player tests; ComputerCoachNativeDecisionTest feeds actual native resource offers through the shipped Node policies and checks both injury orderings. |
| [#459](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/459) | Removed the inherited black outline behind both turn strips; numbered tiles and active-turn styling remain. | Computed-style and desktop/390px visual checks. |

## Review

The issue map now has one ticket per original bug item. The original combined dice issue #457 was narrowed and prerequisite ordering split into #461; the original combined computer issue #458 was narrowed and resources split into #462. Their summaries, fix evidence and scope-split comments are synchronized on GitHub. Existing combined implementation history is preserved and cross-linked. Delivery is authorized; the merged PR supplies issue closure and the delivery follow-up records CI and merge evidence.

Self-review checked authoritative legality, backward-compatible request/recovery shapes, actual versus repeated dice reports, future state exposure, decision accessibility, and unrelated changes. Independent review found a cross-record failed-Pro continuation gap; a new failing UI regression reproduced it, then the history-aware fix passed. Broader checks preserved distinct original/new dice results and narrowed touchdown deferral to native drive-number changes. Self-review also caught Space on the new targeting button committing movement; the corrected button toggles mode without sending a command. A final uphill-block probe reproduced loss of unchanged dice when priority returned to the opponent; explicit retention now survives that sequence change. Six Pro/Loner × coach/spectator cases preserve original nodes and faces. The reviewer checked these corrections and reported no remaining actionable findings.

## Validation

- Browser unit suite: **496 passed**, no failures or skips.
- Computer-player suite: **49 passed**, no failures or skips, including process/daemon tests on the host.
- Final focused native contract suite: **61 passed**, no failures or skips. An earlier combined run also covered concessions and terminal publisher behavior.
- Browser production build: passed.
- Full pinned Maven verification: **passed**, all modules. Surefire recorded 960 tests: **948 executed successfully**, 12 existing opt-in skips, zero failures/errors. The skipped isolated JDBC/schema and retained-dev-fixture checks require separately configured environments; none of the new regressions were skipped.
- Full browser validation: **66 interaction suites and 10 hosted suites passed**, with no failures/skips. After its browser phase, the final narrow uphill-priority correction was checked with the complete 496-test unit suite and the affected presentation, Pro/reroll, Multiple Block, dice, playback and readiness suites. The served artifact is rebuilt after that correction.
- Dev-local readiness: **ready at http://localhost:5000/play**, managed from this worktree. The game server and database report healthy; the proxy reaches the real V2 authentication gate on initial connection and reconnect; the computer daemon reports ready with capacity four.
- Final live smoke check: a fresh browser follows the normal sign-in redirect with **zero uncaught browser errors**. The served game bundle matches the final local artifact, SHA-256 `ba6cc9ec9e88b6d40606dd35ab97f268c66ead54806f27613d4426d0fda3b40a` (checked 2026-11-06 04:24:02 UTC).

The new native computer-policy regression requires Node in every Maven test environment. CI now sets up Node 26; the Docker build stage installs checksum-verified Node 26.12.0 with its required libatomic library, checks the executable before Maven, and admits only the required policy sources/test runner into its build context. The full container build and its native policy regression pass. The final server image remains Java-only. `computer-player/README.md` documents the host test dependency and executable override.

Logs and visual evidence are under this worktree's `.tools/roundup6-*` and `.tools/roundup6-ui/`. These are local review artifacts, not publication assets.

## Final touchdown-score adjustment

The user requested that the scoreboard wait until the TOUCHDOWN splash before displaying a touchdown score. The extended real-GameView regression first failed because it displayed 1–0 while the transcript was still pending. GameView now takes its displayed scores from pitch playback; the playback queue updates both authoritative score fields in the same render as the touchdown announcement. The next-drive tracker remains deferred until the announcement ends. A score increase also defers missing-transcript catch-up at full time, where the drive number may not change; snapshot/reconnect recovery still restores the current score immediately.

The expanded roundup presentation suite passes all eight checks, including home scoring, away scoring for a spectator at full time, before/during/after splash timing, late transcript and recovery without stale replay. All 496 browser unit tests pass again. The affected match-announcements, playback, coach-HUD and reconnect browser suites pass. Production TypeScript/Vite build and local-dev artifact assembly pass; the live smoke check confirms that the refreshed artifact is served with zero uncaught browser errors. Logs: `.tools/roundup6-scoreboard-red.log`, `.tools/roundup6-scoreboard-green.log`, `.tools/roundup6-scoreboard-unit.log`, `.tools/roundup6-scoreboard-*-ui.log` and `.tools/roundup6-scoreboard-artifact.log`. Self-review checked both score fields, per-record score boundaries, full-time catch-up, snapshot recovery and continued next-drive deferral. The prior full Maven and broader browser validation remain the evidence for unaffected code; this adjustment changes only browser presentation.

## Separate pre-existing finding

[#460](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/460) tracks an existing recovered failed-Dodge continuation that may still execute a planned pass after the reroll is declined. The failure reproduced with the existing recipient-targeted request, without the new square-target field. No common engine-step changes were made here. Successful Dodge/recovery and failed pickup cancellation/recovery are covered by the new square-pass tests.

The reported intermittent native concession lock did not reproduce in the phase-by-phase integration checks. The concrete reproduced concession defect was mandatory modal prompts blocking access to Game Menu. That UI defect is fixed, native terminal results/observer projections are verified, and the user subsequently reported that the delivered concession change passed manual validation.

## Manual validation

The user confirmed that the original changes passed manual validation except Bogruk kickoff participation (#458), which still needs the relevant randomly occurring events. Its deterministic native-offer integration tests have passed. The user subsequently accepted the regression-tested touchdown-score adjustment (#454) and authorized delivery.

Remaining manual coverage: validate Bogruk participation when Charge!, Quick Snap or Solid Defence occurs. Dev-local was available throughout acceptance and will be stopped as part of the authorized delivery cleanup.

Final evidence: `.tools/roundup6-maven-summary.json`, `.tools/roundup6-browser-summary.json`, `.tools/roundup6-runtime-ready.json`, `.tools/roundup6-dev-local-verified.log`, `.tools/roundup6-final-artifact.log`, and `.tools/roundup6-accepted-*.log`. The final queue correction's complete browser unit rerun is `.tools/roundup6-browser-unit-complete.log`. The primary checkout still has precisely its original unrelated edits; generated test previews were removed only from this worktree.
