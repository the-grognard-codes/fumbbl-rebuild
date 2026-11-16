# Old World Classic: rendering investigation

Issue [#566](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/566), 2026-11-16.
This is a development gallery. No visual acceptance or live integration is implied.

## Existing renderer and lessons

`LivePitch` uses immutable `PitchProjection` instances. World x runs along the
26-square length, y across the 15-square width; player centers add 0.5 to both.
30/40/50 are elevation angles in degrees, not scaling percentages. Overhead is
90 degrees. Focus travels along x, zoom changes the common lens scale, and coach
end reverses orientation. `projectRaised` handles height and lens clipping;
`surfaceImage` supplies clipped CSS projective transforms for authored surfaces.
The SVG cell polygons and DOM player anchors share this projection.

Player art loads through `resolvePlayerArt`, with 64px standard/small canvases
and 80px big-player canvases. Pose catalogs carry measured foot/body/ground
anchors. `playerArtPlacement` selects feet in perspective and body centers in
overhead. Human blue/gold and Orc russet/olive are the reference palettes;
oversized readable heads, clustered shading and dark outlines establish scale.
`TeamColorArtProvider` and `team-color-art` supply cached palette-ramp recolouring.

The renderer supports separately ordered DOM surfaces, clipped atlas crops,
camera-facing sprites, independent gesture overlays and reduced-motion handling.
`PitchScenery` now mounts turf only: this remains untouched. Vite's DEV route
table can load a review scene without adding it to the production library.

Earlier #198/#211 work confused mathematical compatibility with assembled visual
quality. Small repeated fan cards lost the densely packed standing crowd; broad
empty tiers and thin walls lost depth; a near-end cutaway broke the continuous
bowl. Whole-group motion moved the architecture's apparent anchors. Mapping an
upright painting to the ground flattens heads; stretching a crop to a slot changes
their proportions. The jigsaw revision retained large paintings and split side
banks into camera-facing rows, but its older composition and 50/50 ownership are
not this round's authority. Source atlases alone cannot validate joins or scale.

## Proposed slice

Reuse production projection and the jigsaw surface registration/clipping path
for the first geometry checkpoint, explicitly labelled historical placeholder
art. Keep a single immutable camera per render for every layer. Reserve the
30 × 19 apron around the unchanged pitch and the established 38 × 27 outer bowl.
Use fixed world section IDs: only north-away is the visitor, approximately 15%
of the rectangular crowd footprint. Camera, half and viewing end never assign
ownership. The other nine slots use the home population.

Separate authored stone/timber walls and coping, crowd banks, cloth and apron
props. Ground textures map to world planes; crowd heads use uniformly scaled
camera-facing artwork, not a flattened stadium warp. Overhead has dedicated
authored counterparts. Depth-sort raised pieces by camera-space depth. Large
sections with distinct internal faces avoid repeated individual fan cards.
Production-quality replacements must be inspected at native game scale before
replacing the labelled historical candidates.

The gallery exposes camera, travel, zoom, visitor, colour pairs, layer switches,
reduced motion, seam bounds and concept comparison. A calm turf-strength control
affects only the playing surface; apron detail remains independent. Real player
pose assets and movement/highlight specimens establish readability. Automated
checks compare all 390 polygons and player anchors with production projection.

Cloth uses primary and secondary shadow/base/highlight ramps. Prefer exact indexed
colours; if generated RGBA cannot preserve indices, use explicit authored region
masks and document that fallback. Never infer cloth from blue pixels globally:
skin, timber, metal, outlines and masonry must be immutable. Unfinished cloth
must be labelled and must not be represented as working recolouring.

Animation changes only small gesture/flame/pennant regions, with staggered steady
frame timing and static base images. OS reduced motion overrides the gallery
switch. No whole-bank translation or bobbing is allowed.

## Authority conflicts and extension

The concept is a close view, not a geometrically valid full-pitch diagram: retain
the production camera and grid when composition conflicts. The older 50/50 team
split yields to the smaller fixed visiting section. The concept's busy turf yields
to the owner's calmer-pitch instruction. Prior live-integration instructions yield
to gallery-only scope. The overnight instruction explicitly permits proceeding
without the earlier brief's intermediate owner acceptance gate.

The four reference images were opened before implementation. Gothic, Elven and
Lustrian architecture can supply the same slots; their stone, foliage, banners
and crowd populations are separate future bundles. League selection is venue
configuration, team selection is crowd/cloth configuration; neither belongs in
rules or protocol. No second League is implemented here.

## Implemented findings

The gallery retains `PitchProjection`, jigsaw registration, depth sorting, team
colour ramps and the crowd gesture scheduler. It does not change the production
renderer. Repeated full-atlas DOM images caused missing wall surfaces in Chromium
under the assembled crowd load. `StadiumMockupSurface` paints only each clipped
source rectangle to a small canvas before applying the production homography.
This retains original source pixels and fixed world anchors while reducing
compositor work. Decoding failures install the successful images independently.

The production turf component returns no scenery when a viewport edge looks
above the horizon. The valid gallery 30-degree camera exposed this condition.
`StadiumMockupTurf` instead projects a finite 30 × 19 grass plane with the same
grass sample. No live turf changes were made. Chalk uses clipped world segments,
so a segment remains visible when its other endpoint is behind the lens.

Crowd material masks are generated offline from reserved blue/magenta authoring
colours because the image generator provides RGBA rather than palette indices.
The original PNG and mask are hash-bound and runtime uses the player recolouring
function. Mask invariance tests cannot certify semantic boundaries: an artist
still needs to inspect cloth/skin/metal assignment in the colour contact sheets.

The current art is a review candidate, not a finished concept match. Orthogonal
wall joins, repeated source rows, imperfect crowd transparency, incomplete
overhead cloth edges and limited gesture orientations remain. See the
[outcome report](old-world-classic-stadium-mockup-outcome.md) for evidence and the
exact remaining assets. Architecture and visitor factories are independent, but
a second League would still require a new measured art bundle and factory entry.
