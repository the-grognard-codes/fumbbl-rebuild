# League stadium artwork

Tracking spec: [league stadium MVP](../../../../docs/specs/league-stadium-mvp.md) and [#198](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/198).

This folder owns unchanged transparent atlas originals and source records. Runtime delivery is generated with `npm --prefix browser-client run assets:sync`; `assets:check` verifies source bounds, generated TypeScript and byte-identical browser copies. Do not edit delivered copies.

## Independent identities

`catalog.json` maps League names to venue atlas IDs and roster IDs to supporter atlas IDs independently. Multiple teams may share one League venue while retaining different supporters, banners, bench and mug details. A Match freezes its home League before browser rendering. Missing identities use the Human placeholder and emit an actionable console diagnostic; a failed atlas retains turf and simple scenery.

## Atlas roles and anchors

Each atlas has 16 equal cells, row-major in the catalog role order. Alpha bounds are computed from original RGBA pixels; sprite feet use bottom-center anchors in perspective and center anchors overhead. All size values are world squares. Stone is a world-plane pattern; elevated terraces, risers and furniture use the shared camera height projection.

Venue roles: stone, timber, gate/gateTop, pavilion/pavilionTop, torch/torchTop. Participating-team roles: crowd/crowdSide/crowdTop, banner, bench/benchTop, mugs, pennant. Perspective crowd front and side forms and independently authored overhead crowd/bench/pavilion/torch/gate forms are separate cells. Banner and mug cells are shared small-detail forms; overhead composition must keep them subordinate to the playable pitch.

Normal margin: 1.5 world squares. Four stand rows rise 0.3 square per row. Large benches occupy two-row recesses; the shared pavilion occupies a three-row recess so its whole overhead footprint fits outside the margin. Seats exclude recesses and corner junctions. Camera travel, viewer end and halftime never change seat ownership. Perspective hides the near raised end; overhead retains the enclosure.

## Art direction

Human / Old World Classic: stone and timber, canvas, blue and ivory, warm torchlight, ale cups and wooden benches. Orc / Badlands Brawl: battered masonry, rough timber, riveted iron, orange/charcoal, olive/tusked supporters, patched pavilion, dented tankards and fire. Vanilla Barrens/Orgrimmar inspire materials and atmosphere; emblems are original two-tusk football designs. Keep the SNES background character and restrained ambient motion.

## Authoring and extension

1. Add a complete atlas and source/provenance record; retain the exact generation call, reference roles, original accepted output, hash and dimensions.
2. Add or reuse the independent venue and team mappings. Preserve roles and transparent padding; reject empty or boundary-touching isolated cells with assets:check.
3. Preview both hosting arrangements, coach ends, 30/40/50-degree and overhead views, and near/mid/far travel. Inspect recesses, corner seams, pitch readability and native detail size.
4. Save representative QA under assets/game/references/stadiums and record which views were authored independently or composed.

The original generator requested 1024x1024; the accepted Human output is 1254x1254. Runtime regions use actual dimensions, without resampling. Source calls are retained verbatim; absolute paths in historical calls record their provenance, not portable build dependencies.

Slice 1 QA: production browser build, native projection/recovery/replay checks, browser camera interaction checks for both coach ends, 30/40/50 and overhead, and manually inspected Human perspective/overhead captures. Orc profile and ambient motion follow in separate slices.

## Role contract and paired-profile review

The catalog's shared `layout` records view, normalized perspective/overhead anchor, intended ground footprint, world width, raised-layer treatment, cutaway and motion role for every cell. The renderer consumes world widths and anchors from that contract. Footprints describe reserved ground space; upright pixel silhouettes can rise above it. The explicit bench and pavilion recesses remain the placement authority.

Both accepted v2 atlases are unchanged 1254×1254 transparent RGBA originals with broad cell gutters. Superseded v1 originals and the unsuccessful narrow-gutter Orc revision are retained under source, excluded from delivery. Catalog validation rejects isolated sprites within roughly 3% of a cell boundary. Their source hashes are verified during catalog generation. The rejected first Orc output is retained under source with its rejection reason; it is excluded from runtime delivery. Only the accepted original tusk/football design ships.

Paired visual evidence is under `assets/game/references/stadiums/{human-v2,orc-v2}`. The Orc directory contains the complete 48-view contact sheet; both directories include mixed-team 40-degree and overhead captures from both coach ends. These captures use the production shared pitch harness, with reduced motion for reproducibility.

Native acceptance: start the existing isolated acceptance profile using `tools/acceptance-local-server.mjs`, then run `node tools/stadium-acceptance.mjs` from the repository root. It uses the profile's three synthetic acceptance identities, a production-component host on 127.0.0.1:5173, and the actual /browser/v2 backend on 22235. Firebase web config is read from deployment/firebase/hosting/firebase-web-config.js; set STADIUM_FIREBASE_CONFIG to point at the existing DEV assembly when using an isolated worktree. It creates two synthetic teams and two matches, legally places both rosters, captures all 48 views, reconnects both coaches and the spectator, changes the spectator end, and completes only its newly created matches by concession to verify stored First/Last replay. Credentials and detailed native evidence stay under ignored `.tools`; the command refuses ordinary coach identities. Set `STADIUM_EVIDENCE_DIR` to choose a local capture folder.

This is decorative scenery. No extra pitch squares or interactive bench rules are introduced. Multi-League onboarding remains the future team's responsibility before freezing a selected League.

Earlier captures in the v1 QA directories document superseded exports only; current accepted art evidence uses the v2 directories.

## Ambient motion and reproducible review

The catalog assigns static, sparse-sway, fire-flicker or wind to each role. World coordinates deterministically select about one in seven crowd groups and stagger their phases; each selected group makes a brief tiny movement in a 6–8 second cycle. Torches use small stepped brightness variation and pennants use bounded stepped pixel movement. Camera-projected anchors, seat ownership and native Match state stay fixed. Hidden near-end fans and unavailable-atlas fallbacks remain static. No game-event reactions, scene timers or animation-driven React updates are added.

`prefers-reduced-motion: reduce` disables all ambient transforms and filters. Static matrix captures use that preference, which fixes a documented readable phase. The shared production scene and actual native acceptance both use `browser-client/test/stadium-motion-helper.mjs` to observe visible motion, bounded displacement, stable anchors/seats/cells, zero world DOM mutations and reduced-motion behavior. Native acceptance also verifies an unchanged authoritative revision and outgoing setup-command count.

Small overhead pennants are an original modular composition: team-colored cloth triangle and pole cap at the same world anchor, recorded as `overheadComposition` in the role contract. They are not upright front banners rotated into the plane. Front pennants use unchanged atlas pixels.

Both v2 QA directories contain `ambient-motion.webm`, reduced-motion captures and current mixed frames. `orc-v2/motion-review.json` records short foreground frame observations. These are instrumented headless desktop measurements, including probe overhead; they do not certify sustained GPU performance, mobile layout or all hardware. Set `PITCH_SCENE_EVIDENCE_DIR` when running the existing projected pitch harness to regenerate the matrix and clips. Clip capture requires the repository-pinned Playwright ffmpeg binary (`node browser-client/node_modules/playwright/cli.js install ffmpeg`); ordinary interaction checks do not record video.
