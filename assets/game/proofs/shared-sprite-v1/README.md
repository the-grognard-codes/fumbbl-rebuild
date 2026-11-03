# Shared sprite format proof

Development-only, three-size proof of reusable team colors, animated pitch sprites, static busts and the Human team helmet. It does not replace accepted production art. The user approved the 16-color/16-shade static checkpoint and the first lineman animation; the remaining scoped samples and validation followed.

See the [format contract](../../../../docs/specs/shared-sprite-format-contract.md) and [outcome report](../../../../docs/specs/shared-sprite-format-proof-outcome.md) for exact acceptance evidence, measured costs and limitations.

## Sources and exports

- `source/palettes.json`: 16 shared color choices, each with 16 explicit shade values.
- `source/materials.json`: editable fixed/primary/secondary shade assignments for the original lineman, all three established 160px portraits and Human helmet crop; source PNG hashes included.
- `source/animation-authoring.json`: editable assignments and complete frame metadata for 48 animation images. Generated seeds are retained as explicit maps; runtime never infers materials from RGB.
- `source/shade-grading.json`, `helmet-authoring.json`: original static grading and atlas crop provenance. The helmet is x=64, y=106, 336×317 from the unchanged original atlas.
- `delivery/pack.json`: five static images; `delivery/animation.json`: 12 clips and 48 frames with shared raster/index semantics; `delivery/frames/`: original exported native PNGs.
- `archive/three-shade/`: earlier palette, maps and export retained without changing approved sixteen-shade output.

Generated animation sources, exact prompts, transparency corrections, full-size cutouts, native/3x previews and exporter manifests are in `teams/human/batches/{lineman,halfling,ogre}-animation-proof-v1/`. Lineman and ogre use `export-v2`; halfling uses `export-v1`. Earlier failed/partial exports and source sheets remain provenance, not selected delivery. Accepted masters and catalogs were not modified.

All frames use the standard PowerShell exporter with `-FitReferencePixels 362`: one shared source-space scale prevents independently enlarging poses. Standard/small canvases are 64px (60px/46px fit); big is 80px (76px fit). `source/animation-authoring.json` records bounds and per-frame body/foot/ground anchors. Full-size generation is nondeterministic; deterministic export from saved sources was independently re-run and SHA-compared.

The static bust maps were seeded by `scripts/author-proof-busts.mjs`, using bounded trim regions to exclude skin/steel/hair. Do not rerun it over reviewed assignments casually. The animation builder's `--author` option likewise reseeds maps/anchors and is an authoring operation, not a normal build. Review changed maps before exporting.

## Reproduce

```powershell
npm.cmd --prefix browser-client run proof:sprites:export
npm.cmd --prefix browser-client run assets:sync
npm.cmd --prefix browser-client run proof:sprites:check
npm.cmd --prefix browser-client run review:sprites
node browser-client/test/sprite-proof-full-ui.mjs
npm.cmd --prefix browser-client run assets:check
```

Serve Vite from `browser-client`; open `/test/sprite-proof.html`. The review server was stopped after approval; restart Vite on port 5182 to use <http://127.0.0.1:5182/test/sprite-proof.html#animation-proof>. Source/delivery validation rejects stale JSON or PNG bytes. The existing sync copies only the proof's delivery namespace into browser assets, retaining accepted catalogs.

The fixture exposes design/clip/direction selection, both coach ends, mirroring, perspective/Top-down projection, pause/restart/step, reduced motion, static fallback and a 22-player synthetic Pixi scene. The standalone canvas provides native/integer frame review. Bust selection changes all four shared-identity consumers and its 256-pair sheet. Primary/secondary controls apply to all preview artwork.

Static caches use an LRU capped at 32 data URLs. The scene owns at most 96 recolored Pixi textures, clears them on palette/configuration changes and releases them on unmount. Nine accepted fallback textures are owned separately. Actual measured performance, memory estimates and their limits are in the outcome; do not treat these Windows/Chrome results as Android/Linux certification.

## Bust and helmet consumers

The proof reuses `resolvePlayerPortrait` for all designs. Preview sizes match the current card (76px), builder recruitment (48px), interception (66px), and dugout (27px). Other production consumers to preserve during rollout are the 50px compact card, 3.4rem builder roster image and secret-weapon choice. These are representative preview layouts; production screens and builder persistence remain unchanged.

The Human helmet preserves its independent geometry and fixed equipment. Team-name rendering is 28×36, and all three splash previews use actual `MatchSplash` components with the recolored icon slot. No other atlas icon changes.

The proof retains the approved two 4×4 radio grids with names. Future static-site builder integration must use separate **8×2 primary/secondary grids**, with selected names beside their grids and accessible swatch names, no visible color names inside cells.

## Evidence and limits

`qa/full-proof/` contains native sheets for all three busts and representative animation frames, each frame at 3x, native samples, actual bust consumers, both coach ends/projections/mirror states, palette extremes, measured results and `playback.webm`. Randomly named videos include earlier test runs; the named playback is the successful full run. `qa/sixteen-shade/` and `qa/helmet/` retain approved static checkpoints; `qa/checkpoint-outcome-history.md` preserves their chronology.

All 256 palette pairs are automatically checked on every frame and bust, including fixed-pixel/alpha invariance. Semantic material selection and readable animation still require visual inspection. The approved sixteen-shade treatment deliberately quantizes finer gradients, and identical colors can blend trim. Layered source authoring can export these explicit indices; no shader or renderer migration is required. Full rosters, live team colors, gameplay/replay animation routing and default-art promotion remain later work.
