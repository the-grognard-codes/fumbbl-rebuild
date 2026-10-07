# League stadium artwork

Tracking spec: [league stadium MVP](../../../../docs/specs/league-stadium-mvp.md) and [#198](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/198).

This folder owns unchanged transparent atlas originals and source records. Runtime delivery is generated with `npm --prefix browser-client run assets:sync`; `assets:check` verifies source bounds, generated TypeScript and byte-identical browser copies. Do not edit delivered copies.

## Independent identities

`catalog.json` maps League names to venue atlas IDs and roster IDs to supporter atlas IDs independently. Multiple teams may share one League venue while retaining different supporters, banners, bench and mug details. A Match freezes its home League before browser rendering. Missing identities use the Human placeholder and emit an actionable console diagnostic; a failed atlas retains turf and simple scenery.

## Atlas roles and anchors

Each atlas has 16 equal cells, row-major in the catalog role order. Alpha bounds are computed from original RGBA pixels; sprite feet use bottom-center anchors in perspective and center anchors overhead. All size values are world squares. Stone is a world-plane pattern; elevated terraces, risers and furniture use the shared camera height projection.

Venue roles: stone, timber, gate/gateTop, pavilion/pavilionTop, torch/torchTop, pennant. Participating-team roles: crowd/crowdSide/crowdTop, banner, bench/benchTop, mugs. Perspective crowd front and side forms and independently authored overhead crowd/bench/pavilion/torch/gate forms are separate cells. Banner and mug cells are shared small-detail forms; overhead composition must keep them subordinate to the playable pitch.

Normal margin: 1.5 world squares. Four stand rows rise 0.3 square per row. Large benches and the shared pavilion occupy two-row recesses outside the margin. Seats exclude recesses and corner junctions. Camera travel, viewer end and halftime never change seat ownership. Perspective hides the near raised end; overhead retains the enclosure.

## Art direction

Human / Old World Classic: stone and timber, canvas, blue and ivory, warm torchlight, ale cups and wooden benches. Orc / Badlands Brawl: battered masonry, rough timber, riveted iron, orange/charcoal, olive/tusked supporters, patched pavilion, dented tankards and fire. Vanilla Barrens/Orgrimmar inspire materials and atmosphere; emblems are original two-tusk football designs. Keep the SNES background character and restrained ambient motion.

## Authoring and extension

1. Add a complete atlas and source/provenance record; retain the exact generation call, reference roles, original accepted output, hash and dimensions.
2. Add or reuse the independent venue and team mappings. Preserve roles and transparent padding; reject empty cells with assets:check.
3. Preview both hosting arrangements, coach ends, 30/40/50-degree and overhead views, and near/mid/far travel. Inspect recesses, corner seams, pitch readability and native detail size.
4. Save representative QA under assets/game/references/stadiums and record which views were authored independently or composed.

The original generator requested 1024x1024; the accepted Human output is 1254x1254. Runtime regions use actual dimensions, without resampling. Source calls are retained verbatim; absolute paths in historical calls record their provenance, not portable build dependencies.

Slice 1 QA: production browser build, native projection/recovery/replay checks, browser camera interaction checks for both coach ends, 30/40/50 and overhead, and manually inspected Human perspective/overhead captures. Orc profile and ambient motion follow in separate slices.
