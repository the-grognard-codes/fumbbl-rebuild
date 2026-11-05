# Dice event artwork: revision 2

Tracks #450. Revised all eight samples in response to the user's mole-character reference and feedback that revision 1 was too light and abstract.

- Deep navy #080f20 / #0b1630, blue #183566 with #387cb5 highlights, warm gold #d89a22, dark ink #091222.
- Added restrained shading and gold trim, sharper corners and dark keylines.
- Redrew the Pass football with a pointed prolate silhouette, brown leather panels, end stripes and ivory lacing.
- Redrew Catch with articulated glove fingers, thumbs, palms and navy/gold cuffs.
- Redrew Dodge/Rush boots with plated toes, lacing, gold trim and cleats.
- Darkened Tentacles, Weather, Deviation and Scatter to match the set.

## Artifacts
- [Review page](art-samples/index-v2.html)
- [Desktop sample sheet](art-samples/review-v2-1200.png)
- [Phone sample sheet](art-samples/review-v2-390.png)
- Eight individual `*-v2.svg` files in art-samples/. Revision 1 remains intact.
- Reproducible source: create-art-samples-v2.mjs. These are native SVG revisions, not raster generation.

## Validation
Ran `node .notes/dice-readability/create-art-samples-v2.mjs` and `node .notes/dice-readability/render-art-samples.mjs --v2`. At 1200px and 390px: eight cards, all SVG images decoded, no horizontal overflow. Visually inspected both screenshots including 48px/32px icons and dark, green, and pale backgrounds. No application runtime changes; live-pitch checks remain part of integration after approval.

Awaiting art approval or further revisions before completing the remaining assets and UI integration.
