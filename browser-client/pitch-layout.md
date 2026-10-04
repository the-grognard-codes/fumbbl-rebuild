# Pitch Preview MVP

The [2026-10-03 angled-pitch ADR](../docs/adr/0003-coach-oriented-angled-pitch.md)
sets the new presentation direction: opposing coach views, full-width framing,
and a travelling perspective camera along the pitch length with pixel sprites.
The 2026-10-04 clarification keeps height and lens fixed during travel, aligns
pitch and crowd edges to one vanishing point, and moves crowd/stands with the camera.
The selected default is 40-degree perspective with zero yaw. A selectable 90-degree
top-down view preserves square cells and parallel edges for crowded scrums, with
the same north–south scrolling. Switching projections retains the current camera
position and coach end. The reference viewer removes the full-pitch fit option;
complete-pitch captures remain geometry evidence.
The [current reference viewer](../docs/adr/references/0003-angled-pitch-v4/viewer.html)
demonstrates that framing. The layout below describes
the existing overhead preview and its historical geometry, not the new camera's
requirements or acceptance evidence.

`/pitch-preview` is the polished, isolated MVP. It is a local simulation only:
it does not connect to the game engine, send game commands, or calculate rolls.
The earlier Draft v2 study remains available at `/ui-ux-draft-v2`, with its
source copies under `src/draft-v2`.

## Layout and interaction

The temporary square-size slider has been removed. Fit, Detail, 1.5x and 2x
use the original responsive board scale, with sprites scaling alongside squares.
Fit measurements use floored content-box dimensions, and centering uses CSS
percentages rather than rounded viewport dimensions, preventing scrollbar
feedback loops. Layout modes use outer width so scrollbars cannot switch modes.

The field is a 26 by 15 grid. Squares remain 36 logical units for geometry and
hit testing. Fit uses 56px squares when space permits and 48px at 1080p; it falls back
to 40px and then uses fit-to-available-space. On mobile, the pitch supports
zoom and pan. Sprites use a 64:56 ratio (80:56 for large players), scaling with the grid.
At 48px squares they render at about 54.86px and 68.57px; at 56px squares
they render at native 64px and 80px. Original PNGs remain unchanged.
Interactive targets remain square-sized and artwork stays bottom-center anchored.

The scoreboard uses blue Humans and orange Orcs, arranged to match the visual
reference. The sidebar receives selection, turn, and event state from the
parent. It presents the selected player, supports an in-page end-turn
confirmation, and shows the game log. Coach chat is intentionally local to the
browser. Compare reference opens the original concept image in a modal dialog.

The MVP uses the accepted Human and Orc 64px chibi v1 masters under
`assets/game/teams/<roster-id>/master/`. All 32 sprite PNGs are synced unchanged
to `public/assets/game/teams/`; the earlier Human pack remains available to
Draft v2 under `public/assets/game/archive/`. Team, role and artwork stay aligned
in the crowded view.

## Confirmation contract for game-engine integration

Space confirms a pinned, valid action through the same handler as the Commit
button. Hovering a destination alone never commits. Held-key repeats, modified
shortcuts, text entry, action menus, player details and modal/End Turn dialogs
must not send game actions. Other focused buttons retain native keyboard behavior.
When replacing the simulation, route both confirmation methods through the same
server-validated command and pending-command protection; do not add a separate
keyboard-only execution path. Escape cancels the preview.

## Assets

The MVP bundles Alegreya SC Medium/Bold and Barlow Semi Condensed Regular from
`assets/game/ui/fonts`, including their OFL licensing material. The icon atlas
and its provenance are under `assets/game/ui/mvp-art`. Runtime copies are synced
to `public/assets/game/ui/`.

## Verification

Run `npm run build`. With `npm run dev` serving the preview, run:

```
node test/pitch-preview-demo.mjs
node test/pitch-sizing-demo.mjs
node --experimental-strip-types --test test/pitch-demo.test.ts
```

The browser check records review screenshots in `test-output/pitch-preview/`,
including 1080p, crowded-pitch, and route views.
