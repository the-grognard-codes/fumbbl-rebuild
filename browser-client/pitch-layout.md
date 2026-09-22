# Pitch Preview MVP

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

The MVP uses the Human and Orc 64px chibi v1 packs supplied in
`.notes/art-preview/*-team-64px-chibi-v1/*.zip`. All 32 sprite PNGs are copied
unchanged to separate versioned public/preview folders; the older sprites remain
available to Draft v2. Team, role and artwork stay aligned in the crowded view.

## Confirmation contract for game-engine integration

Space confirms a pinned, valid action through the same handler as the Commit
button. Hovering a destination alone never commits. Held-key repeats, modified
shortcuts, text entry, action menus, player details and modal/End Turn dialogs
must not send game actions. Other focused buttons retain native keyboard behavior.
When replacing the simulation, route both confirmation methods through the same
server-validated command and pending-command protection; do not add a separate
keyboard-only execution path. Escape cancels the preview.

## Assets

The MVP bundles Alegreya SC Medium/Bold and Barlow Semi Condensed Regular under
`public/preview/fonts`, including their OFL licensing material. The icon atlas
and its provenance are under `public/preview/mvp-art`.

## Verification

Run `npm run build`. With `npm run dev` serving the preview, run:

```
node test/pitch-preview-demo.mjs
node test/pitch-sizing-demo.mjs
node --experimental-strip-types --test test/pitch-demo.test.ts
```

The browser check records review screenshots in `test-output/pitch-preview/`,
including 1080p, crowded-pitch, and route views.
