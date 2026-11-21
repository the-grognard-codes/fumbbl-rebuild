# Old World Classic gallery asset contract

Review candidates for [#566](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/566).
These are not owner-approved production assets. Original generated PNG bytes are
preserved; rendering crops do not resample or rewrite originals.

## Inventory and provenance

`provenance.json` records exact requests, leading references, parent edits,
dimensions and SHA-256 hashes. `build-stadium-mockup.mjs`, invoked by both
`assets:sync` and `assets:check`, rejects changed or uncatalogued PNG sources.
Earlier candidates and their rejection reasons live in
`../../../references/stadiums/old-world-classic-mockup/candidates/`.

| Source | Purpose |
| --- | --- |
| architecture-v2.png | Separate masonry/timber wall, top coping, columns, bench frames, barrels and corner candidates |
| cloth-v1.png | Banner, pennant, perspective awning, overhead awning |
| human-sides-v2.png | Static fallback; left/right dense Human profile banks and true overhead counterparts |
| orc-sides-v1.png | Compatible Orc/Goblin visitor banks and overhead counterparts |
| human-ends-indexed-v2.png | Clean-alpha wide front, back and overhead Human end banks |
| *-indexed-v1.png | Crowd sources with blue primary and magenta secondary material markers |
| human-sides-gesture-v1.png | Alternate mug/scarf patch; only the documented source rectangle is used |
| *-indices.bin.gz | Deterministically generated per-pixel material/shade indices |

## Materials

Image generation exports RGBA, not stable palette indices. Consequently the
authoring path uses reserved marker colours and generates a separate byte mask.
This is the documented mask fallback, not runtime recolouring by visual guess.
`cloth-v1` is cloth-only with blue/gold reserved regions. Crowd edits reserve
blue/magenta for fabric so blond hair and brass are not secondary cloth.
The generator classifies these reserved colours at build time and writes:

- 0: protected RGBA, including transparent pixels and dark outlines.
- 1–16: primary ramp, darkest to lightest.
- 17–32: secondary ramp, darkest to lightest.

Runtime uses the existing `recolorTeamImage` player-art function and its 16-shade
ramps (including shadow/base/highlights). It never reclassifies pixels. Tests
check every protected channel and every alpha byte against the source, including
extreme white/black colours. The generated art still requires semantic mask
inspection: passing byte checks is not proof that an artist assigned every
fabric/skin boundary correctly.

## World regions and camera contract

Use `stadium-mockup-architecture.ts` and `stadium-mockup-crowd.ts` for measured
atlas crops and world registration. Coordinates use production pitch squares.
The playable rectangle is x=[0,26], y=[0,15]. Walls sit outside x=[-2,28],
y=[-2,17]; props sit entirely outside playable cells. Crowd slots use the shared
38 × 27 jigsaw footprint. Only `north-away` belongs to the visitor, independently
of coach end. Home banks, end banks and corners remain home-owned.

Walls have vertical facade and horizontal coping planes. Bench/barrel art is
uniformly scaled, camera-facing in perspective, and switches to overhead art.
Side and corner crowds use 0.5-square scan bands from large authored banks;
their screen-facing vectors retain equal pixel scale in both dimensions.
End banks use large intact front/back paintings. Overhead uses dedicated tops.
Atlas crops, rounded corner clipping and camera-space sorting reuse the existing
jigsaw registration math. Small clipped canvases replace full-atlas DOM layers
after the latter intermittently lost surfaces in Chromium. Ground and all raised
surfaces share one camera. The gallery's finite grass plane also handles a horizon
above the viewport; production `PitchScenery` is unchanged.

## Known authoring limitations

The atlas corner stone sprites are retained as source candidates but are not
mounted; current walls meet as orthogonal planes. Banner/pennant overhead uses a
narrow ground-plane projection rather than a separately authored edge view.
Some row repetition, low-alpha crowd backing and joins remain visible. Only the
home-facing `north-home` section has a gesture patch (source x=100, y=890,
width=250, height=120); other orientation/section gesture frames remain needed.
The whole generated alternate is preserved for provenance, but changed pixels
outside that patch are deliberately never mounted. These are open visual
requirements, not accepted substitutions.

## Next League

Author the same facade/coping, perspective/overhead furniture, crowd orientations
and reserved cloth regions at compatible density. Keep the world slots unchanged.
Add source/provenance entries and measured crops, select the new venue bundle in
the gallery's module factory, then run the same camera/material/visual matrix.
The visitor crowd bundle and cloth palette remain independently selectable.
Do not integrate with live play without a separate approved issue.
