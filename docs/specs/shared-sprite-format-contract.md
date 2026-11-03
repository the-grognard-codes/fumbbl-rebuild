# Shared sprite format contract

Version: 1. Date: 2026-11-03. Status: recommended by the completed bounded proof; production integration is separate.

Evidence: [proof outcome](shared-sprite-format-proof-outcome.md), [source pack](../../assets/game/proofs/shared-sprite-v1/README.md), [recorded browser results](../../assets/game/proofs/shared-sprite-v1/qa/full-proof/results.json). Implementation slices: [#433](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/433), [#434](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/434).

## Decision

Use original RGBA artwork plus an explicit material/shade index plane, one shared palette definition, and a versioned animation manifest. Recolor once when a texture/palette combination enters the cache; render ordinary textures through the existing Pixi renderer and ordinary images for bust/helmet consumers. Do not infer materials from RGB at runtime. Do not author 256 separate kit variants.

This contract describes the semantics proven by the sample and the authoring handoff for further rosters. The current decoder intentionally validates the bounded three-design proof. Expanding its inventory limits and design types is a subsequent implementation task; the sample is not a general asset ingestion service.

## Raster and palette contract

| Field | Required meaning |
| --- | --- |
| `id` | Stable unique image identity; animation frames include design, direction, clip and zero-based frame number. |
| `kind` | `body`, `bust` or `helmet`. |
| `sourceUrl`, `sourceSha256` | Scoped canonical/delivered PNG identity and SHA-256 of the source PNG. A changed source requires renewed material review. The helmet identity includes `#human` and its separate crop metadata. |
| `width`, `height`, `rgba` | Exact native geometry and row-major, unpremultiplied RGBA8 pixels. Preserve original alpha, including fractional edge alpha. |
| `indices` | One integer per pixel: 0 = preserve RGBA; 1–16 = primary shades; 17–32 = secondary shades. Transparent pixels must use 0. No interpolation between materials. |
| `ramps` | Exactly 16 stable IDs/names, each with 16 explicit RGB hex colors ordered darkest to lightest. Primary and secondary use the same list. |

Replace RGB only where the index is nonzero; copy alpha unchanged. Skin, hair/fur, bare metal, leather, teeth, rivets and outlines remain fixed. Painted armor is distinct from bare metal. Preserve dark outlines and fine details through material authoring, not special-case palette substitutions. All 256 ordered pairs, including equal colors and identical opposing kits, are valid. Same-color trim can intentionally blend into the primary uniform.

Sources remain full-size transparent PNGs with exact generation prompts/references and editable material maps. The proof's `source/materials.json` and `source/animation-authoring.json` are authoritative editable assignments. Color selection helpers only seed those maps; review and correct them before export. Never overwrite accepted source art during proof production.

Standard/small bodies use 64×64 canvases; big bodies use 80×80. Fitted art limits are 60, 46 and 76 pixels respectively. Use nearest-neighbor export from full-size sources and one shared source-space scale across a character's clips. Do not independently fit every frame to the maximum size. Preserve transparent margins and uncut extremities. Busts retain their own 160×160 geometry; the Human helmet retains its 336×317 atlas crop.

## Animation manifest

The delivered envelope has `version: 1`, `palettePack` (the raster/index contract, currently `version: 2`) and `clips`. The raster pack's historical `status: palette-review` tag remains a strict wire discriminator; it does not indicate current approval status. Approval is recorded in the outcome/spec.

Each clip contains `design`, `direction`, `id`, `loop` and an ordered `frames` array. Each frame contains `imageId`, `durationMs`, visible-alpha `bounds`, `footAnchor`, `bodyAnchor`, `groundAnchor` and `pose`. Anchors use native image coordinates. Validate finite in-bounds anchors, positive bounded durations, unique identities, complete image references, transparent margins and bounds containing every visible pixel before rendering.

The proof uses four frames per clip:

| Clip | Frame durations (ms) | Behavior |
| --- | --- | --- |
| idle | 260, 260, 260, 260 | Loop at 1040 ms. |
| move | 140, 140, 140, 140 | Loop at 560 ms; movement is in place. |
| fall | 160, 160, 180, 300 | One shot; retain final grounded frame. |

Lineman supplies front45/back45; halfling and ogre supply front45. Additional clips, timings and directions require scoped art and validation, not a promise that all characters share four frames. Frame timing is read from metadata, not inferred from image count or filenames.

Use the existing direction resolver for coach-end orientation. Apply mirroring around the selected anchor. Perspective upright bodies use feet; Top-down uses body center; grounded poses use ground center. Per-frame anchors can describe intentional motion. Idle/move anchors stay stable; the sample fall anchors transition toward the final ground center. Reuse `playerArtPlacement` and `PitchProjection`; do not alter Pitch square identity.

Unsupported clips/facings retain an existing accepted static pose. Missing or invalid packs produce a visible review error and leave accepted product art available. Pause and frame-step must yield deterministic captures. Reduced motion uses the first looping frame or final one-shot frame. Animation never determines a game outcome or gates input.

## Rendering and cache lifetime

The proof uses CPU palette replacement into RGBA canvases and nearest-filtered Pixi textures. Static consumers use cached PNG data URLs through the shared portrait resolver. The helmet supplies the same recolored crop to team-name and all three splash uses. Busts do not inherit body anchors and do not animate.

The static cache is an LRU capped at 32 entries. The animation scene owns up to 48 frames × two kit pairs = 96 textures; changing palette/scene configuration destroys old owned textures. Unmount destroys the renderer and its owned textures. Accepted static fallback textures are retained separately for the fixture lifetime. Never destroy shared production textures when implementing the product adapter.

The proof deliberately ships inspectable JSON pixel/index arrays and native PNGs. This is useful for validation, but broad roster delivery must budget loading and decoding. Preserve these semantics if introducing compressed planes, atlases or binary payloads; validate round-trip pixel identity before changing the transport. The proof does not establish an indexed-PNG browser recoloring API or require a custom shader.

## Indexed assignments versus masks/layers

| Concern | Explicit indices (implemented) | Separate masks/layers (alternative) |
| --- | --- | --- |
| Authoring | One precise material/shade label per pixel; flattened art needs careful selection and visual correction. | Natural in layered art tools; still needs precise material boundaries and shade information. |
| Shading | 16 approved discrete shades per material; finer gradients are quantized. | Can preserve continuous shading, but tint/compositing math needs its own visual contract. |
| Alpha | One unchanged original alpha channel; no mask-edge compositing seams. | Multiple alpha edges/compositing order can produce halos if not aligned. |
| Export | Hash-bound maps, exact bounds and deterministic output are validated. | More files/layers and blend conventions to validate. |
| Renderer | Ordinary cached textures already work in current Pixi and DOM consumers. | Can also flatten into textures; a shader path is optional and unproven here. |

No concrete rendering failure required a second complete pipeline. Layers remain useful authoring inputs that can export explicit indices. Do not claim pixel-identical reproduction of arbitrary artwork with 16 shades; the approved palette deliberately simplifies fine gradients.

## Gates for scaling production

For each new design: retain sources/prompts, export at native size, review materials and all clips, verify all palette pairs byte-preserve fixed RGBA/alpha, validate timing/anchors, and inspect native/integer zoom plus actual bust consumers. Include light/light, dark/dark, equal, contrasting and similar-opponent kits. Check both coach ends and both projections. New art defects block its promotion even when the contract passes.

For the product adapter: reuse shared portrait identity for cards, builder, dugout, interception and other choices; preserve the existing static fallback; record a resource/performance budget on target devices. Static-site builder pickers must each be **8 columns × 2 rows**, primary and secondary separately, with selected color names beside the grids and accessible swatch names. No visible names inside the grids.

Production persistence, replay/reconnect routing, action timing, full roster/direction coverage, local kit overrides, Android/Linux validation and default-art promotion remain later work. Production animation must follow confirmed outcomes and finish or skip cleanly when playback advances, without adding waits solely to display a clip.
