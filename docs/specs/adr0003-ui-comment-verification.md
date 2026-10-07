# Third match UI batch — local verification

> Historical local-work evidence, recovered on 2026-10-07. The reconciliation report in [completed-work-recovery.md](completed-work-recovery.md) records current verification and superseded designs. Earlier results below are not a fresh live-server acceptance run.

Rollup [#145](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/145), related to #127. Branch: `codex/fix-new-match-ui`. The 14 annotated comments are grouped into 11 child tickets. Changes are implemented locally and uncommitted; tickets remain open for review/merge.

## Decisions

- Each condensed dugout retains its own team name and restores its previous presentation independently.
- Confirmed becomes shorter by reducing vertical padding.
- An empty-square click or selecting a different own player cancels a pending proposal. Plan path continues adding waypoints, as explicitly clarified by the owner.
- Weather uses existing repository artwork for all five conditions, with icon left and text right. This order is the working assumption after the optional order question received no answer.
- Desktop clocks align with the central team bar and share its height. Narrow layouts stack clocks to preserve readable team names and resources.
- Stadium end walls leave more than two clear ground rows beyond the end zones for future cheerleaders; no goalposts or cheerleaders were added.

## Ticket evidence

| Ticket | Comments | Implemented behavior | Evidence |
| --- | --- | --- | --- |
| [#146](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/146) | 1–2 | Independent title-only condensation and restoration; home dock above chat, away dock above log. | `dugout-ui.mjs`: condense/restore, previous modes, reserve selection. `hud-comments-ui.mjs`: docking at five viewport sizes. |
| [#147](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/147) | 3–4 | Clocks share the 52px score-bar height; desktop top/bottom alignment and contained BANK/TURN lines. | HUD layout assertions and rendered screenshots. An inherited flex-wrap rule was found visually and removed. |
| [#148](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/148) | 5–6 | Both resource panels start at the score-bar top; inherited section margins removed. | HUD alignment assertions at desktop, mobile and short viewport sizes. |
| [#149](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/149) | 7 | Game Menu sits below away resources and follows their measured height. | HUD placement assertions; existing Game Menu keyboard/short viewport checks. |
| [#150](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/150) | 8 | Weather icon/text follow the authoritative condition between turn tracks. Five existing PNGs promoted with source hashes. | Weather mapping/fallback unit tests; all five images loaded in browser; responsive screenshots; asset synchronization. |
| [#151](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/151) | 9 | Less command-bar padding/gap and shorter action buttons. | HUD size assertions and five viewport captures; all existing action fixtures pass. |
| [#152](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/152) | 10 | Confirmed retains its label/glyph with reduced vertical padding and shorter height. | HUD height assertion, actual mouse/keyboard confirmation in interaction fixtures. |
| [#153](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/153) | 11 | Cancel button removed; proposal cancellation clears selected player, targets, action/menu state, route preview and End Turn confirmation state. Player switches select the new player. | New HUD fixture checks no action mutation, empty-square/player switch behavior and End Turn reset. Smart route, setup, kickoff, pass, push and required-choice fixtures pass. |
| [#154](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/154) | 12 | Chat counter/header compose button replaced by independent persisted A/A/A text controls; body/hint, touch and keyboard open the composer. | `chat-ui.mjs`: rendered 12/14/18px text, independent chat/log persistence, incoming entries, draft Escape/restore, Enter send, mouse/touch entry. |
| [#155](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/155) | 13 | Reduced history top padding, with explicit zero section margin. | HUD padding assertion and visual captures. |
| [#156](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/156) | 14 | Matching crowd/wall strip projects behind both end zones, retaining empty ground for cheerleaders. | Geometry/scenery unit checks; 16 matching before/after camera captures covering 30/40/50/top-down, both coach orientations and both pitch ends. Alpha scan verifies clear ground; compositor-size assertion at 30°/3×. |

## Completed checks

- `npm --prefix browser-client test`: **166/166 passed**.
- `npm --prefix browser-client run test:ui-comments`: all four new browser harnesses passed.
- `npm --prefix browser-client run test:interaction`: all 13 existing interaction harnesses passed, including 56 native reroll-choice fixture cases and 22 reroll-accounting fixture cases.
- `npm --prefix browser-client run test:adjustments`: log, kick placement, Quick Snap, status and debug groups passed.
- Browser TypeScript/production builds, site build and site input checks passed.
- Asset synchronization check passed for **175** runtime files.
- User-visible changelist entries added in the latest `VersionChangeList`.
- `git diff --check` passed.
- The existing local match page was refreshed to the new build and visibly showed the Touchback banner, weather, aligned clocks/resources, smaller controls, relocated Game Menu and chat text controls. Both new dugout controls were exercised and restored without submitting a game action.

## Visual artifacts and limits

- `browser-client/test-output/hud-comments-145/`: HUD captures at 1224×604, 1920×1080, 640×330, 375×660 and 375×300.
- `live-match-145.jpg` and `live-match-condensed-145.jpg` in that directory: actual local match before/after using both condense controls. Local generated hosting files were refreshed, with cache-busting URLs confined to the local preview output; no remote deployment was performed.
- `browser-client/test-output/stadium-wraparound-156/`: 32 before/after PNGs at identical camera positions.
- `assets/game/pitch/endstand-v1.provenance.json`: generated asset prompt, source reference, dimensions and hash.
- `assets/game/ui/weather/provenance.json`: exact existing PNG sources and hashes.

Browser fixtures establish rendering and intent contracts. No native server game logic was changed in this batch, and no new live game action was submitted during verification. Native backend deployment, commit, push and merge are outside this local delivery.
