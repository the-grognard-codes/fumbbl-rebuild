# Match UI adjustment verification — 2026-10-05

> Historical local-work evidence, recovered on 2026-10-07. The reconciliation report in [completed-work-recovery.md](completed-work-recovery.md) records current verification and superseded designs. Earlier results below are not a fresh live-server acceptance run.

Rollup: [#127](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/127). Implementation is local on `codex/fix-new-match-ui`, starting at `08f211c5018978b899b09329b393f50422aca3ca`. The pre-existing checkout changes were preserved. No commit, push, pull request or runtime deployment is part of this delivery. Tickets remain open for review of the local work.

## Accepted product decisions

- Touchback and current-step instructions share a prominent heading and instruction area below the turn tracks.
- Charge identifies the **kicking team**, matching the BB2025 server's decision owner.
- Held right-button drag pans; the wheel zooms.
- Successful d6 results accumulate through the action sequence and clear about one second after its final roll and movement. A same-sequence revision received during movement preserves the earlier results.

## Implementation and evidence

| Issue | Implementation | Verification |
| --- | --- | --- |
| #128 | Kickoff setup commands expose their moved player as the action source. Only that player's offered one-square destinations highlight; clicking submits that exact action. Optional public kickoff metadata carries native allowance/completed counts. | `ActionSourceTest`, `KickoffPresentationTest`, actual-engine `RecoveryScenariosTest#quickSnapCountsAcceptedPlayersAndRestoresLimitsAndEarlyFinish`, `match-adjustments-ui.mjs`. The native sequence covers single-square targets, moved-player exclusion, full allowance, early finish, wrong coach, stale request, duplicate retry, both coach/spectator counts, separate-JVM recovery and old checkpoint views. |
| #129 | Scenery uses three separately projected source-width tiles instead of one oversized strip. | At 30°/2×/near end the old surface measured 26,285px wide. Permanent browser assertions include old strip and new tiles, and require projected surfaces below 16,384px at near/far positions through 3×. Paired screenshots retained. **Headless Chrome did not reproduce black pixels; the reported visual failure still needs confirmation on the owner's display.** |
| #130 | Right-button capture pans, release/cancel/lost capture stop it; wheel zooms and pitch context menus are suppressed. | `projected-pitch-ui.mjs`: pan/zoom, cancellation, both coach ends, canonical targets, no gameplay intent, pending-decision preservation. |
| #131 | Projected ground polygons supply restrained shadows under players. | Projected browser harness checks shadow-to-square attachment across perspective/tactical views and both ends; sprite artwork is unchanged. |
| #132 | Perspective sprites use visible pose-specific foot/ground anchors. Tactical placement uses visible artwork bounds. | Player-art unit and projected browser checks cover normal/large sprites, standing/prone, zoom, camera angles and opposing ends. |
| #133 | Touchback banner says to assign the ball to an eligible receiving player. Own-player clicks can stage that offered target. | Browser status/target checks and native `highKickAndTouchbackUseNativeReceivingPlayerTargets`. |
| #134 | Current-step banner covers kickoff events, native required decisions, setup, normal play, saved games and full time. Interruptions take precedence over event context. | `match-status.test.ts` checks strict/public metadata, both coaches/spectator, server-owned Charge, interruptions and saved/finished states; browser checks place the banner below the turn track. |
| #135 | Compact MUTP follow-up dialog has a transparent backdrop. | Dice browser harness checks normal pitch brightness, compact dimensions, active-player clearance, focus and exact offered action in perspective/top-down. |
| #136 | Dice and choices center on the visible pitch with bounded positioning. | Projected browser checks cover three block dice and five accumulated d6 results. |
| #137 | Log-entry paragraphs inherit the selected log font size and line height. | Adjustment browser harness checks actual entry text at 12/14/18px and preference after reload; coach HUD responsive checks pass. |
| #138 | Block/reroll groups fit their offered choices without display scrollbars. | Dice and dense-viewport reroll harnesses check all offered options and scroll-free layout. |
| #139 | Resource rerolls use the existing `reroll-v1.png` icon. | Reroll browser checks require the PNG to load and retain each exact server choice. |
| #140 | Original repo-native SVG supplies distinct symbols for currently projected skill sources, with canonical provenance and synced runtime assets. | Native reroll-source inventory unit check, painted SVG browser checks, 56 fixture journeys and six dense-viewport journeys; asset-sync check. |
| #141 | Playback accumulates per-die labels/results, retains the action group briefly, and clears resolved decisions/reconnect/sequence boundaries. | Playback browser harness covers three dodges + rush, a fifth revision arriving during movement, final-roll retention, mandatory choices, reduced motion, replay seek and reconnect. |
| #142 | Debug drawer contains portalled camera options, the authoritative server-action list and movement-plan details. | Adjustment and coach HUD checks cover default closure, toggling without mutation, actual server options and proposal review; existing pass/push/reroll harnesses use the drawer. |
| #143 | Canonical pitch clicks pin kick squares independently of inspected players; projected target marker shows the choice. | Adjustment mouse-click/confirmation check, projected marker/canonical-click check and native kickoff scenarios. |
| #144 | Tactical standing sprites use a stable pose independently of facing; prone/stunned sprites remain state-specific. | Player-art unit checks and perspective/tactical projected browser checks. |

## Completed checks

- `npm --prefix browser-client test`: **162/162 passed**.
- TypeScript and browser/site builds pass; site input and 167-asset synchronization checks pass.
- New adjustment browser harness: all five behavior groups pass.
- Projected pitch, dice, playback, reroll choices (56 cases plus six dense cases), coach HUD, pass workflow/ranges, push choice/artwork browser harnesses pass.
- Smart action/route confirmation, setup drag/keyboard/Solid Defence, reroll accounting (22 native fixture cases) and immediate End player action browser harnesses pass.
- Native action source, kickoff presentation, concession/recovery JSON/transcript checks pass. The new actual-engine Quick Snap and High Kick/touchback sequences pass.
- Full native `RecoveryScenariosTest,SetupSessionTest`: **25/25 passed**, including separate-JVM checkpoints, halftime/full-time, the new kickoff flows and old Quick Snap projections.
- `git diff --check` passes.

Retained local evidence: `.tools/ui-adjustment-tickets/*-check.log`, native `native-quick-flow.log` / `native-kick-targets.log`, `browser-client/test-output/match-adjustments/`, and paired `browser-client/test-output/pitch-after/perspective-30-home-near-2x-{legacy-strip,tiled}.png`. These generated files are ignored by Git. Native verification uses the repo's exact Temurin 21 target toolchain; the sandbox's Windows JAR real-path denial required an approved local test run outside the sandbox.

The browser/site output is rebuilt locally. The existing running backend has not been replaced; exercising new kickoff counters/source metadata there requires a runtime built from this branch. The #129 GPU/display confirmation remains open, and no ticket is being claimed accepted solely from a rendering-size assertion.
