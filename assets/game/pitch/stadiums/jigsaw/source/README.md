# Stadium jigsaw asset contract

This is the production authoring contract for the bowl revision in [issue #211](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/211). The [approved reference](../../../../references/stadiums/human-reference-revision/live-behavior-target.png) supplies materials, packed crowd composition and inward-looking poses. [The decision record](../../../../../../docs/specs/modular-stadium-bowl.md) owns layout requirements.

## Shared physical pieces

Coordinates are game-world squares. The pitch stays 26 × 15; the clear apron is [-2,28] × [-2,17]; every venue uses the same outer bounds [-6,32] × [-6,21].

| Piece | x bounds | y bounds | Supporters |
| --- | --- | --- | --- |
| north-home | -2 to 13 | -6 to -2 | Home |
| north-away | 13 to 28 | -6 to -2 | Away |
| south-home | -2 to 13 | 17 to 21 | Home |
| south-away | 13 to 28 | 17 to 21 | Away |
| home-bank | -6 to -2 | -2 to 17 | Home |
| away-bank | 28 to 32 | -2 to 17 | Away |
| home-north-corner | -6 to -2 | -6 to -2 | Home |
| home-south-corner | -6 to -2 | 17 to 21 | Home |
| away-north-corner | 28 to 32 | -6 to -2 | Away |
| away-south-corner | 28 to 32 | 17 to 21 | Away |

The ten slots cover the stand area exactly once. North and south are physical sidelines, independent of screen orientation. Timber dividers cross only the stand depth at x=13. Two locker-room portals remain at north x=6 and south x=20. Furniture cutouts reserve only the actual bench/pavilion footprints; each shallow pocket has its own floor.

The frozen home League chooses walls and shared props. Each participating team chooses crowd, bench, mugs and team flags. Camera travel, viewing end, acting coach, halftime, reconnect and replay preserve those assignments.

## Authored imagery and assembly

Each team family supplies eight distinct continuous crowd paintings: two side banks, four corner transitions, one front end bank and one back end bank. Its matching overhead sheet depicts crowns and shoulders. The same bank painting can populate either team-owned half, but individual fan sprites or small cards are not tiled through the stand.

Every original crowd sheet is 1122 × 1402. Measured regions in ../catalog.json are identical between Human/Orc and their view variants. Wall masters are separate 1835 × 857 originals. Four world-facing wall runs use the measured masonry face; overhead uses only the narrow rail/rim, not a flattened upright wall.

The renderer registers source pixels directly on the production PitchProjection. Internally, side banks and corners use overlapping camera-facing depth strips from their own continuous painting. These strips preserve upright heads while the camera travels; they are renderer subdivisions, not additional authored puzzle pieces. End banks remain intact. Head proportions use the artwork's 40-degree calibration while lens tilt changes row overlap. The near back bank stays raised and naturally covers most of its wall.

Retaining walls, crowd, portals, timber dividers, bench/mug pairs, pavilion, fire fixtures and flags are independent layers. Perspective props use upright art; benches, pavilion and fire have overhead variants. Overhead pennants are composed cloth, post-top and shadow shapes in team colors.

Human art follows the original weathered grey masonry, heavy dark rounded timber, blue/ivory clothing, warm firelight and lush green grass. Orc art uses olive skin, charcoal/russet clothing, rough timber, dark iron and battered warm stone, drawing atmosphere from Vanilla Barrens/Orgrimmar. The original reference remains the stylistic authority.

Original generated PNG bytes remain unchanged. Source rectangles, clipping, masking and projection happen at runtime. prompts.json records exact generation/edit prompts; catalog hashes verify the selected masters. Experimental full-scene paintings were rejected because a travelling camera stretched the figures.

## Section gestures

Each view supplies an alternate frame and eight measured local zones. Only the relevant zone can appear above the still base painting, so alternate-frame changes elsewhere cannot animate the crowd.

The local scheduler waits a random 3.5–15.5 seconds, chooses one eligible visible section, shows a two-second gesture burst and waits again. Selection reads current visibility without restarting the cadence when the camera moves. At most one section is active. The gesture can be a small fist, mug, head or mouth change; the whole bank has no movement animation.

Torch brightness changes and tiny flag movement run independently in CSS. Reduced motion or a hidden document cancels section gestures; reduced motion freezes fire/flags as well. The scheduler has no game transport or per-frame JavaScript callbacks.

## Adding a League or crowd family

1. Author a family from the existing sheet and approved reference, retaining all measured piece dimensions, poses and transparent gutters. Match density and corner/head scale at native game size.
2. Supply perspective, overhead and local gesture originals. Author venue wall and overhead rim treatment separately. Keep chalk, players and UI out of these images.
3. Add file dimensions, measured rectangles, local zones and SHA-256 hashes to ../catalog.json. Add profile-to-family mappings there; venue/team identity mappings remain in the modular stadium catalog.
4. Record exact prompts and parent references in source documentation. Preserve original PNG bytes.
5. Run npm run assets:sync --prefix browser-client, then npm run assets:check --prefix browser-client. Validation rejects missing roles, incompatible dimensions, overlaps, changed PNG hashes, excessive gesture zones and flattened overhead rims.
6. Run node tools/stadium-piece-review.mjs to create both venue/coach-end camera captures. Inspect near/mid/far at 30/40/50 degrees and overhead. Review the same assembled view against the reference; catalog tests alone cannot establish artistic fidelity.
7. Validate actual gameplay input, reduced motion and native reconnect/replay. Keep visual acceptance separate from technical checks.

Future multi-League eligibility is a team-factory onboarding decision outside this workstream.
