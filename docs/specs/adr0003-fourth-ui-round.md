# Remaining fourth-round UI tickets — implementation and verification

Snapshot: implementation verification before publication; the closing pull request records subsequent merge status.

Date: 2026-10-06. Rollup: [#166](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/166).
Branch: `codex/ui-overhaul-remaining`, isolated at `.tools/publish-dugout-174`, based on remote main `cd70f87a5205b6ddce0c7fc92659ae87e19ec725`.

The requested twelve tickets (#167–173, #175–179) are implemented together. #174 was already merged through PR #181. Changes are local and reviewable; no new merge or service rollout is claimed. Original dirty work and generated site/update artifacts are not part of the scoped change.

The owner resolved #172: only two players already on the pitch can swap. Reserve onto occupied rejects; neither player may be an opponent or ineligible. The rollup and #172 information blockers are cleared. Other confirmed decisions: board clicks add waypoints and Confirm commits; opacity backgrounds only, default 30%; perspective setup faces the opponent, top-down does not change direction; expanded dugout accepts pitch/reserve drag/drop.

Implementation details and the older outstanding requests are reconciled in [the retrospective](ui-overhaul-retrospective-20261006.md).

## Affected checks

| Area | Check |
| --- | --- |
| Native setup swaps/errors/retry/recovery | `SetupSessionPlacementTest` — 2 scenario tests, both coaches, authoritative setup reasons and illegal placement matrix |
| Public protocol contracts and art/storage rules | Browser unit suite — 162 tests, including bounded legacy/V2 setup error fields, pitch-only swaps, opacity storage and tactical art |
| Selection, opacity, prompts, debug placement, dice | `round-four-ui.mjs` — real held mouse selection, 0/30/100% backing, persistence, exact choice IDs and responsive controls |
| Setup drag/drop and corrected invalid formation | `setup-drag-ui.mjs` — two-coach pitch/reserve round trips, pitch swap, rejection, correction, keyboard and Solid Defence |
| Camera, art anchors, scenery layers, ball pulse | `projected-pitch-ui.mjs` — both ends/all modes; first left click after pan; reduced motion; crowd removal and turf tiling |
| Route construction and reconnect | `site/test/m5h-route-browser.test.mjs` — board-only waypoints, truncate/undo/clear, expired preview reauthentication and exact Confirm command |
| Existing gameplay/input coverage | Smart pitch, push choice/artwork, pass workflow/ranges, dice choices, reroll choices/accounting, end action, coach HUD and playback browser checks |
| Window lifecycle and shared board | `site/test/play-browser.test.mjs` — separate window/fallback, menu Exit, two coaches/spectator, reconnect and console confidentiality |
| Build | TypeScript and production play/site build; client-logic Maven package; native setup Maven test reactor |

These are local native tests and controlled browser fixtures. They do not claim a new signed-in real-server full-match acceptance, owner foreground GPU/performance verification, observed screen-reader acceptance, or remote CI/merge. The earlier 30-degree hardware symptom remains explicitly unclosed in the retrospective.

## Reproductions and integration repairs

Held selection and setup direction had red-capable reproductions before their fixes. Switching wheel to zoom required migrating the common square-targeting helper to real right-button pan. That revealed stale click suppression: a right pan consumed the next left click. The pointer regression failed first and now passes. Escape handling now respects the route's consumed event, so clearing waypoints keeps the selected active player available for another route.

The new top-right menu overlapped the old Exit/Fullscreen row. Removing that row and retaining its controls in Interface fulfills the prior request (#158) and keeps normal pointer Exit coverage. Passive setup coaches and spectators no longer render a confirmation button.

Native setup diagnostics remain bounded public strings; neither protocol decoder accepts that field on unrelated response types. Independent native/contract review found the initial legacy decoder mismatch and approved the repair. ChangeList includes user-facing entries, and TODO plus the team creation asset factory prompt capture future per-team crowds and production turf/weather artwork.
