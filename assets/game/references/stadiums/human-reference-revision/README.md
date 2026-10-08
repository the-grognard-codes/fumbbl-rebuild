# Human stadium revision — visual and geometry review

The user accepted the original-reference art treatment and the elevated stadium bowl. The current revision incorporates clarified locker-room entrances, more sideline space and independently replaceable Human/Orc supporter sections. These are review artifacts; live scenery code and shipping artwork remain unchanged.

## Current review material

- [Latest mixed-team mockup](06-locker-rooms-mixed-crowd-v3.png): Human stone/timber venue, dense Human and Orc sections, raised near crowd, two sideline player entrances, adjacent benches, a broader grass apron and wooden supporter partitions.
- [Approved bowl overview](04-full-wraparound-bowl-v2.png) and [approved closer bowl view](05-close-match-view-bowl-v2.png): the visual/elevation baseline before gate and supporter clarification.
- [Original reference](source-reference.png): exact material, connected pixel clusters, wall construction and packed head-and-shoulder crowd authority.
- [Measured proposed layout](layout-contract.json), [camera mathematics report](layout-check.json) and [scrolling-study browser report](layout-browser-check.json).
- [Latest image prompts](locker-room-revision.json), [earlier prompts](prompts.json), [bowl feedback/prompts](bowl-revision.json) and [file provenance](provenance.json).

A scrolling geometry study was presented in the conversation using the unchanged production PitchProjection. It uses schematic raised supporter markers, not finished raster art. The reports distinguish mathematical and schematic verification from production integration.

## Authoritative requirements

1. **Match the accepted first iteration.** Human architecture uses weathered grey stone, heavy dark timber posts and rounded rails, small metal fittings, rich dark outlines, warm torchlight and lush mottled green turf. Preserve this visual character while separating assets.
2. **Dense standing crowd.** Continuous shoulder-to-shoulder faces, heads, hoods and upper torsos fill the spectator area. No empty terrace bands, seated bleachers, sparse full-body rows or isolated repeated fan groups.
3. **An elevated bowl.** Side and far spectators stand above the pitch and look down into it. The near crowd makes a strong foreground rim, facing into the field; backs of heads and shoulders naturally conceal most of the near retaining wall. Do not expose the whole wall simply to display architecture.
4. **Two player locker-room entrances total.** One on each long sideline, leading from field level into locker rooms beneath/behind the stand. The user's confirmed count supersedes the earlier four-gate interpretation. No gates in the near or far end walls. Current proposed placement uses canonical x=6 on the north sideline and x=20 on the south sideline, in the corresponding team's half.
5. **Benches near their team's entrance.** Place each bench beside its entrance in a shallow pocket beyond the clear apron. Leave the doorway unobstructed. Benches and cups are independent team assets; a shared Human venue can have one Human bench and one Orc bench.
6. **Preserve the 26 × 15 pitch.** All 390 playable squares, goal lines, line of scrimmage, player coordinates and input geometry remain unchanged. Extra space is scenery, never extra playable squares.
7. **Two-square clear apron.** Start the stadium beyond a two-world-square margin on every edge: total grass footprint 30 × 19 squares. Place benches and pavilion in recesses beyond that clear margin. The current renderer's 1.5-square margin is a future implementation change, not already updated.
8. **Identical venue dimensions.** Every venue theme shares the same physical footprint, side lengths, corners, module seams, entrances and prop anchors. The proposed outer footprint is 38 × 27 squares. Confirm module separation against these world bounds; different review PNG dimensions and crops are not different venue dimensions.
9. **Independent crowd sections.** North and south are the two canonical long sidelines, not the top/bottom of the screen. Each consists of a home half and an away half. End-cap spectators belong to that end's team. In the illustrated matchup, the home/near half is Human and the away/far half is Orc; swapping team or viewing end must preserve physical section ownership.
10. **Midfield wooden partitions.** One timber wall traverses the depth of each long-side spectator area at canonical x=13. Each separates the two supporter sections and remains outside the apron. Nothing crosses or divides the playing field. Reproject this world coordinate with the camera; never place a divider at a fixed screen midpoint.
11. **Separate replaceable layers.** Static shell, crowd sections, partitions, locker-room portals, benches/cups, pavilion, torch fixtures, flags and individual gesture sprites use independent assets and fixed world anchors. The home League selects architecture; participating teams select their crowd and team details.
12. **Minimal individual animation.** Only a few fans raise a fist, shout, lift a mug or make another short gesture. Do not translate or bob entire groups or strips. Tiny torch/flag effects remain independent and reduced-motion aware.

## Scrolling and occlusion contract

Use the existing PitchProjection for ground, raised stadium surfaces, crowd bases and props. Artwork must be source-preserving modules registered in world space, not a single camera-specific painting stretched or scrolled behind the field. The live camera changes perspective scale with depth; a fixed full panorama cannot follow those changes correctly.

The present implementation hides the near stand and crowd entirely in perspective. That behavior does not reproduce the accepted foreground rim. Production work must replace that blanket cutaway with controlled foreground clipping/occlusion: retain the bowl and near spectators, permit them to conceal their own wall, and keep players and playable cells readable and reachable. The two-square apron creates separation but does not by itself prove every silhouette is safe.

Maintain fixed supporter identities and seams throughout full travel, both viewing ends, reconnect, replay and halftime. Use appropriate side, far, near-back and overhead artwork; do not warp an upright front crowd image into a different viewing angle. Clip raised geometry in world space at the camera lens boundary. Natural cropping of outer stands is acceptable; sliding scenery, disconnected corners, stretched upright walls, popping sections or crowd ownership swaps are not.

The generated mixed-team mockup illustrates the intended composition. Its chalk outline, supporter splits and timber-divider locations are not precise geometric registration. The measured contract and scrolling study place the midfield partitions exactly at x=13. Raster modules must be aligned to that contract during implementation.

## What was verified

The camera checker used the unchanged production projection through 7,560 camera combinations: both ends, 30/40/50 degrees and overhead, focus 0–26 in quarter-square steps, zoom 0.5/1/2, and desktop/medium/narrow viewports. Projected anchors remained finite or were correctly omitted behind the lens; visible ground coordinates round-tripped within numerical tolerance. A visible raised anchor had no discontinuity during quarter-square travel. The pitch remains 390 cells; entrances, benches and partitions have fixed proposed world coordinates.

The browser study checked wheel scrolling, both ends, four angles and near/mid/far positions across 24 interactions, with no script errors or invalid projected coordinates. Desktop and narrow controls fit; overhead uses visible ground footprints for entrances and partitions. The final browser report is saved with the review.

These checks cover the mathematical camera and schematic layout. Finished raster module seams, scrolling appearance, raised near-crowd occlusion, player interaction, native Match integration and performance still require validation after asset separation. No game regression tests were run for these review-only changes.

## Revision history

The original A/B/C mockups remain for comparison. Their four-gate layout is superseded. The conceptual layer board predates the accepted bowl elevation and contains imperfect gate rendering; use it only to explain independent layer/gesture authoring, not as an atlas or layout authority.

The earlier retrospective's visual-intent conclusion is superseded by the user's correction and subsequent approval of this reference-faithful direction. The technical identity/projection framework remains useful, but the prior sparse crowd composition and whole-group sway require replacement.
