# Lower parallel MUTP pitch

The [v4 travelling perspective study](../0003-angled-pitch-v4/index.html) supersedes this interpretation after the owner's 2026-10-04 clarification: pitch and crowd edges are parallel in world space and converge on screen. The original stadium artwork is restored there, with moving crowd/stands and fixed camera settings during travel. This gallery preserves the earlier orthographic experiment.

Open the [gallery](index.html) or [live reference viewer](viewer.html). Both work directly from disk. The viewer opens at **40° elevation, zero yaw, orthographic projection**; **35°** supplies a lower comparison. Each has home and opposing-coach captures plus full-pitch companions.

The latest review requires parallel pitch edges and scrolling the entire pitch. The v2 grid and actors previously moved over a stationary perspective stadium image; this version replaces that arrangement with one shared SVG world layer. Its turf surface, exact grid, markings, player/ball anchors, walkway strips, continuous parallel rails and modular pixel-art stands all move under the same parent pan transform. The approved HUD remains outside that layer, in screen space.

Use the mouse wheel, drag the pitch, use up/down arrow keys with the pitch focused, or adjust the slider. Panning is bounded to reveal either end zone. Return to midfield restores the comparison formation. Full-pitch framing exposes every square and disables pan. Square coordinates and feet markers remain available; click a square to read its canonical identity.

The shared [v2 fixture](../0003-angled-pitch-v2/scene.js) retains 26 length rows, 15 width columns, 390 squares including both one-row end zones, midfield at boundary x=13 and 4/7/4 zones at boundaries y=4/11. All four new views reuse the same 22 canonical players and ball; the approved HUD and player cutouts are reused unchanged. Lower views compress ground rows by `sin(elevation)` without perspective taper or distance scaling. Both camera axes reverse for the away coach; sprites and UI stay upright.

The built-in `image_gen.imagegen` tool produced three scenery assets using the approved MUTP stadium as reference: a repeatable grass texture and transparent blue/rust stand modules. [Exact prompts and provenance](art/prompts.json), local PNG originals, alpha bounds and hashes accompany them. The turf pattern is attached to the projected ground plane. Stand modules are upright illustrations anchored outside the touchlines; continuous rails provide mathematically parallel edges. Repeated stand bays are scenery stand-ins, not a completed stadium asset pack or elevation-specific 3D model set. No new player art or production assets are promoted.

Reproduce the PNGs and [geometry/pan evidence](geometry.json) with the existing browser-client Playwright dependencies and local Chrome:

```powershell
node docs/adr/references/0003-angled-pitch-v3/render.mjs
```

Checks cover 390 unique cells, zone counts, 22 centered foot anchors, constant orthographic scale, opposite-end orientation, full-pitch bounds and coordinate round trips. Pan checks at both ends and intermediate positions compare the actual SVG screen transforms of turf, grid, a stand/torch module and a player. Every component must move by the same world offset while HUD bounds remain unchanged. Displayed foot anchors must still match the projected square centers after panning. The 0.001px tolerance accounts for float32 SVG points/matrices.

Chrome interaction checks passed for wheel, pointer drag, up/down arrows, return to midfield and full-pitch framing in both coach orientations. Dragging preserved the fixture and did not trigger square selection; clicking Alden's square after pan still reported canonical `(9,7)`. The gallery and viewer had no horizontal overflow at 1440px and 390px viewport widths, and both gallery framings loaded all images without page errors. Narrow-width layout checks do not establish readable mobile gameplay.

The viewer is documentation-only and sends no game actions. Live interaction, sprite-state coverage, browser zoom, accessibility and foreground performance remain integration checks under ADR 0003.
