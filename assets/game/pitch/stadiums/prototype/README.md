# Stadium study source artwork

Canonical prototype PNGs live here; the normal `assets:sync` workflow copies them to
`browser-client/public/assets/game/pitch/stadiums/prototype/`. These remain development
study assets pending the owner's visual review.

## Original-style walls without crowd

- [Stone material atlas](reference-wall-materials-v1.png): two straight-on stone face
  panels and two overhead coping materials. Stone faces map to vertical world planes;
  coping maps to independent horizontal surfaces. Dimensions: 1536 × 1024.
- [Full stone generation prompt and source record](reference-wall-materials-v1.provenance.json).
- [Accessory atlas](reference-wall-accessories-v1.png): blue/ivory and rust-red/gold
  banners, torch timber upright and plain timber upright. Dimensions: 1254 × 1254.
- [Full accessory generation prompt and source record](reference-wall-accessories-v1.provenance.json).

Generated with built-in imagegen from the owner's approved `stadium-v1.png` wall style.
Both images preserve generated alpha and pixels. Measured source rectangles and shaft
pivots live in `browser-client/src/stadium-wall-study.ts`; they do not assume a uniform
grid. Each atlas is reusable on either long sideline. No people or spectators are part
of these assets. Torches and banners are independent of masonry and crowd.

See [the requirements and implementation](../../../../../docs/verification/stadium-wall-art-study.md)
and [actual browser captures](../../../references/stadiums/modular-wall-review/README.md).

## Earlier crowd experiment

`human-groups-v1.png` and `provenance.json` retain the earlier intact-group crowd test.
That artwork is available only through its historical comparison variant; the latest
wall-only default does not mount any spectators.
