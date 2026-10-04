# Corrected MUTP camera references

Historical geometry study. The [v3 lower parallel gallery](../0003-angled-pitch-v3/index.html) and [viewer](../0003-angled-pitch-v3/viewer.html) supersede this fixed-backdrop presentation for the latest review: parallel stadium/pitch edges and whole-world pan. The v2 exact formation, HUD and player cutouts are retained in v3.

The [gallery](index.html) revises all twelve views in [ADR 0003](../../0003-coach-oriented-angled-pitch.md), retaining the approved MUTP artwork, compact navy/cyan/gold HUD and translucent supporting panels. Both the gallery and [pannable viewer](viewer.html) open directly from disk without a server or network resources.

Each view has a 1672 × 941 width-fit match capture and a matching capture under `full-pitch/` showing **every square**. Width fit displays a slice of the finite surface; it does not add or omit rows from the pitch model. Switch the gallery to **Full pitch** to inspect the entire surface. In the viewer, enable **Square coordinates / feet** to identify canonical squares and foot anchors, click a square to read its identity, or pan to either end.

## Geometry and fixture

- 26 squares along canonical `x=0..25`; 15 across canonical `y=0..14`: **390 squares**.
- One-square end zones at `x=0` and `x=25`, included in the 26 rows. The halves each contain 13 rows; the midfield line lies on the `x=13` boundary.
- Wide/central/wide divisions are **4 / 7 / 4** columns, with boundaries at `y=4` and `y=11`.
- Exactly 11 players per team, 22 unique occupied squares, from one shared [scene fixture](scene.js). Alden is at `(9,7)`; the ground ball is at `(12,7)`. This is an illustrative in-progress arrangement, not a kickoff setup or server-issued legal-action fixture.
- A player occupying square `(x,y)` has a bottom-center foot anchor at the projected world point `(x+0.5,y+0.5)`. Shadows, selection and coordinates share that ground plane. Upright sprites may overhang neighboring squares; their occupied square is determined by their feet.
- The away camera rotates the ground-plane viewpoint by 180 degrees, reversing both axes without mirroring the HUD or actor identities. Front/back artwork changes with coach end. The decorative stadium backplate is flipped separately to exchange the team banners.

All elevations/yaws now drive the actual projection rather than being image-generation targets. Perspective uses a pinhole projection with a distance of 60 square units; parallel views use orthographic projection. Classical isometric uses `atan(1/sqrt(2))` elevation and 45° yaw. The lower/higher and deferred yaw variants all retain the same scene. Perspective scales upright sprites by their anchor depth; orthographic views keep their size constant. Match captures fit both touchlines and reserve sprite headroom for this shared midfield formation, keeping the far row below the scoreboard even in the higher view.

## Artwork and scope

The built-in `image_gen.imagegen` tool separated the approved v1 home screen into an empty pixel stadium and transparent HUD, and extracted reference-only front/back human, orc and Alden illustrations from the approved home/away concepts. A follow-up removed the repeated line-player jersey number. [Exact prompts and provenance](art/prompts.json) retain all nine calls; selected originals are stored locally, along with the earlier numbered draft. The accepted v1 concepts remain in [the previous directory](../0003-angled-pitch-v1/README.md).

The reference cutouts use [team sprite standard 1.1](../../../../assets/game/standards/team-sprite-standard.md) and its nearest-neighbor exporter: 64px canvases, export anchors `(32,63)`, fitted artwork up to 60px. The reference renderer aligns each image's actual alpha-bound bottom edge to its ground point; this removes blank baseline gaps left when reduction drops faint source pixels. Horizontal anchors remain at canvas center. [Sprite exports and original copies](art/sprites/manifest.json), native/enlarged contact sheets, [validation notes](art/sprites/validation.md), provenance and a [cutout ZIP](art/mutp-camera-standins-v1.zip) accompany the reference assets. User-required front/back poses are recorded exceptions to the usual three-quarter pose. Repeated neutral line-player artwork represents different fixture IDs; this is not a complete roster commission or accepted runtime asset pack. No live client assets or match behavior are changed.

`renderer.js` supplies the exact grid and placement in SVG; Chrome/Playwright exports its rendered screen to PNG. Image generation supplies the retained raster artwork, rather than guessing grid counts or positions. The backdrop is decorative, and sprites remain the same upright illustrations across elevation/yaw studies; directional/elevation-specific production art and gameplay acceptance remain work for the integrated camera study.

## Reproduction and checks

With the browser client's existing dependencies installed and local Chrome available, run from the repository root:

```powershell
node docs/adr/references/0003-angled-pitch-v2/render.mjs
```

This regenerates all 24 captures and [geometry.json](geometry.json), checking 390 unique projected cells, end-zone/width-zone counts, 22 unique actors, both coach orientations, constant orthographic scale, full-pitch bounds, and forward/inverse coordinate round trips at both pan extremes. An independent screen-space check intersects each occupied polygon's diagonals and compares that point with the actual displayed sprite's bottom-center anchor; tolerance is 0.001px for SVG's float32 point storage. This catches misplaced feet without relying solely on the renderer's forward/inverse functions agreeing with one another.

The viewer and gallery are documentation tools. Checks here establish reference geometry and square placement, not authoritative gameplay, accessibility, browser-zoom or foreground-performance acceptance for the future live pitch.
