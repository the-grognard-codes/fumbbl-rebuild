# Play setup and match UI cleanup

Scope: [#224](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/224). Branch `fix/play-setup-cleanup`, base `6384db02bd4834a57ecc1c7ce60ca78de26d0c93`.

## Intended outcome

Play opens with Create a game. Its owned unfinished games appear last, using the same matchup cards and team nameplates as Spectate. Activated games offer Resume and guarded Concede; unfinished preparations retain Continue setup. The obsolete Spectate redirect panel is removed.

Account sign-in and game transport are separate. Routine Connected / Disconnect controls are removed from setup, while connecting/disconnected feedback, reconnect and transferred-window recovery remain. Match/result connection recovery is preserved.

The hosted pitch has no setup placement disclosure. Numeric placement remains available in Debug for keyboard/touch access; ordinary board keyboard and drag/drop placement remain intact. The live pitch log has no preference checkboxes. Game Menu > Game Log owns Debug, Movement and Roll modifiers; changes update the live log immediately and persist. Other log views retain their controls where no Game Menu is available.

PR #223 already anchors Confirmed! and hides the empty setup command bar. Verify that the button stays centered at its normal height across setup/play and hidden/reappearing states, without an empty background bar during setup.

## Verification

- Build and TypeScript validation passed. Static site check (17 inputs), site unit checks (10) and native log/preferences unit checks (3) passed.
- Hosted Play/result journeys (8), owned-current-games and Spectate journeys (2) passed. Current games remain last for human/computer modes; status, paging, lifecycle refresh, same-tab Resume, guarded/uncertain concession and disconnect/reconnect remain covered. Cards fit at 1224 and 360 pixels with long names, expanded IDs and concession confirmation.
- Setup drag/drop and keyboard placement passed. Debug retains numeric placement; ordinary placement and server-owned eligibility are unchanged.
- Confirmation remains centered at the same coordinates across setup, play, proposals, pending, hidden and reappearing states for both coaches at five viewport sizes. Setup has no empty command bar.
- Menu/live-log preference updates and reading position passed across three viewport sizes, including reload and denied storage. Standalone log paging/history replacement passed. The existing menu journey now runs in `test:interaction`, which the Static delivery CI job invokes.
- Synthetic desktop/mobile and setup/menu captures were visually inspected. Committed evidence: [Play page](../../.notes/overhaul-analysis/verification/play-setup-cleanup/current-games.png), [mobile stress case](../../.notes/overhaul-analysis/verification/play-setup-cleanup/current-games-360.png), [setup pitch](../../.notes/overhaul-analysis/verification/play-setup-cleanup/confirmation-setup.png), [Game Log menu](../../.notes/overhaul-analysis/verification/play-setup-cleanup/menu-game-log-1237-617.png). Shared nameplates preserve Spectate's appearance; no new raster artwork was required.
- Local Firebase preview assets were refreshed. All thirteen pre-existing generated-file baselines were restored byte for byte. Hosted deployment is outside this task.

## Standards

Independent review approved the scoped change with no actionable findings. Shared matchup markup, the user-facing ChangeList entry and issue mirror follow repository conventions; guarded game actions remain intact.

## Spec

Independent review approved the scoped change with no actionable findings. All six requests are covered, including abnormal transport recovery, placement accessibility, synchronized log preferences and the existing confirmation dock.

Standards: 0 findings. Spec: 0 findings. Final exact-head CI is pending before merge.
