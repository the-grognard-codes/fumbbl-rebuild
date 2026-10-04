# Angled-pitch reference screens

Historical artwork references. The approved MUTP UI is retained in the [corrected v2 gallery](../0003-angled-pitch-v2/index.html), which supersedes these images for exact 26-by-15 dimensions and player placement. Use v2 for the current ADR examples.

Created on 2026-10-03 with the built-in `image_gen.imagegen` tool for [ADR 0003](../../0003-coach-oriented-angled-pitch.md). Open [the gallery](index.html) in a browser; it works from disk without a server or network resources. Each image opens at full size when selected.

The twelve primary PNGs cover every camera-study row, including separate perspective/parallel lower and higher views, both signs of deferred yaw under both projections, and the default from opposite coach ends. The supplied end-on perspective remains the default direction. Fixed isometric is the preferred parallel-view alternative to review; end-on orthographic remains a comparison candidate. Adjustable yaw is deferred.

## Shared art direction

- Use the public site's [portal reference](../../../../.notes/art-preview/molesunderthepitch-first-draft.png), [brand package](../../../../site/src/assets/brand-package-v4/preview.png), and [character illustration](../../../../site/src/assets/grognard-troll-slayer.jpg). The site's [CSS](../../../../site/src/assets/site.css) provides the navy, cyan, gold, square-frame and pixel-heading context. The MVP pitch is not an art or UI reference for this batch.
- Keep layered green turf and original fantasy-athlete pixel art, blue/ivory home kits and rust/charcoal away kits, a reddish-brown American football, and mole branding.
- Float compact navy HUD panels over the pitch, with turf/grid visible beneath their backing surfaces. Keep text and control glyphs opaque. Production code should apply translucency to the surface rather than reducing opacity of an entire panel and its descendants; it must verify contrast over changing backgrounds.

## Reference inventory

| Camera | Projection | Image |
|---|---|---|
| Default, home end; 55° target | Perspective | [Home](perspective-55-home.png) |
| Default, opposing end; 55° target | Perspective | [Away](perspective-55-away.png) |
| End-on parallel; 55° target | Orthographic | [Parallel](parallel-55-home.png) |
| Lower; 45° target | Perspective / orthographic | [Perspective](perspective-45-home.png), [parallel](parallel-45-home.png) |
| Higher; 65° target | Perspective / orthographic | [Perspective](perspective-65-home.png), [parallel](parallel-65-home.png) |
| Left yaw; 55° / −15° targets | Perspective / orthographic | [Perspective](yaw-left-perspective-home.png), [parallel](yaw-left-parallel-home.png) |
| Right yaw; 55° / +15° targets | Perspective / orthographic | [Perspective](yaw-right-perspective-home.png), [parallel](yaw-right-parallel-home.png) |
| Fixed classical isometric; 35.3° / 45° targets | Orthographic | [Isometric](isometric-home.png) |

## Provenance and review limits

[prompts.json](prompts.json) records the default prompt, each selected view's final edit prompt, style references, intended camera settings, and generated original filenames. All images were generated with the built-in tool; no CLI/API fallback was used. Each variant began with the default scene or a relevant projection/yaw reference. The `iterations/` directory retains four earlier drafts corrected for parallel geometry, opposite-view human facing/banner orientation, or yaw direction/strength.

Visual review checked the site palette and framing, upright HUD, field-first composition, opposite team placement/facing, the visible distinction between the projection families, and panel translucency. Generated angles and foreshortening are approximate, especially in the small yaw studies. Tile geometry, formation, player counts, details and scale can drift; these are appearance references rather than exact same-state captures. The isometric example is a classical-isometric target, not proof of equal axis foreshortening in its pixels. The renderer's mathematical projection must supply those guarantees.

These are flattened screen illustrations, not sprite atlases, legal-action fixtures, or accepted production roster assets. This batch does not change the team sprite standard, deploy a site, replace the live pitch, or establish browser/accessibility/performance acceptance. The camera prototype still needs paired canonical-state captures, crowded normal/large/prone/stunned sprite checks, and input verification.
