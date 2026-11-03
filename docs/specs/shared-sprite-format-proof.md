# Feature: Prove the shared sprite format

Date: 2026-11-01.

Scope clarified: 2026-11-03.

Tracker: [#393](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/393).

Implementation slices: [palette checkpoint #432](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/432), [sample artwork #433](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/433), [playback and final evidence #434](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/434).

Status: bounded proof implemented and validated, ready for final review. The user approved the static palette/player/bust/helmet and first animated lineman on 2026-11-03; halfling/ogre production followed that approval. See [the implementation outcome and slice tracker](shared-sprite-format-proof-outcome.md) and [the recommended format contract](shared-sprite-format-contract.md).

Planning reference: `docs/specs/graphics-enhancement-sequencing.md`.

## Abstract

Prove that reusable player-art sources can support 16 primary × 16 secondary team-color combinations for animated pitch sprites and static player busts while preserving fixed materials, transparency, placement and readability. Busts may use separately authored portrait artwork, but must share palette definitions and material-recoloring rules with pitch sprites. Deliver a bounded working demonstration, representative artwork, validation evidence and a recommended format before broad sprite production begins.

## Objective

Resolve the shared asset-format risk for team colors and animated players. The outcome is a demonstrated authoring/export/rendering contract, not a complete team-color feature or a complete animation system.

This fits one feature because all work serves one acceptance outcome: demonstrate that recoloring and animation coexist in the same reusable format. Full roster coverage and gameplay integration are independent later features.

## Context / Existing Behavior

- Accepted player masters are flattened transparent images. Existing pose catalogs contain directional standing views, prone/stunned poses, portraits, bounds and reviewed body, foot and ground anchors.
- The player-art resolver already selects poses and mirrors standing views. Perspective and Top-down view use different placement anchors without changing Pitch square identity.
- Player cards, dugouts and interception/secret-weapon choices use the shared portrait resolver. The team builder selects separate legacy images; the proof must demonstrate a route for it to consume the same recolorable bust assets.
- Canonical art and generated browser delivery already have synchronization and validation tooling.
- Existing Match playback presents confirmed movement and ball changes. This proof must not introduce new game rules or infer outcomes from visual motion.
- Indexed color ramps are a candidate, not an accepted architectural decision. Masks/layers remain an alternative. Browser display of an indexed PNG alone does not implement runtime recoloring.

## In Scope

- Three established Human roster designs: lineman (standard), halfling (small) and ogre (big), preserving their established designs. Obtain approval of the first recolored, animated sample before producing the other two.
- One static recolorable bust per sample design, with development-only previews of player cards, team-builder entries, dugouts and interception choices at their actual display sizes. Exercise the shared portrait-resolution path and demonstrate how the builder can consume those same assets.
- The static Human team helmet used beside the team name and in turn-start, turnover and touchdown splashes. Apply the same primary/secondary ramps to its painted shell/crown stripe while preserving fixed equipment and transparency. Demonstrate all four uses and all 256 combinations in the proof; no helmet animation is required.
- Three short clips per design: idle, movement and contact/fall, including a stable final ground pose.
- One authored three-quarter direction for all three designs, plus the opposite three-quarter direction for the standard player to exercise direction selection. Exercise mirrored display for these clips; no complete eight-direction art set is required.
- Sixteen explicit reusable color ramps, each containing 16 shades from shadow to highlight, independently selected as primary and secondary, including all 16 same-color pairs.
- Use stronger saturation for chromatic colors rather than pastel ramps; retain meaningful neutral choices. Record all shade values. Obtain approval of a static recoloring sheet before animation production.
- The proof uses two visible 4×4 color-picker grids with names, clear selection indicators and keyboard/touch operation. For the subsequent static-site team-builder integration, use separate primary and secondary grids, each **8 columns × 2 rows**. Do not show color names inside those grids: place the selected color name beside its grid with the Primary/Secondary label, retaining accessible names on each swatch. Production persistence and rollout remain outside this proof.
- A repeatable browser review fixture using the existing player-art and projected-pitch presentation boundaries where practical.
- A versioned sample asset pack, repeatable export, format documentation, visual evidence and a decision report.

## Out of Scope

- Full rosters, all positions, all facings, all action animations, bust animation or portrait production beyond the three sample busts.
- Product color-picker UI, saved team persistence, Match team schema changes or server/protocol changes.
- Production action-to-animation routing, Match replay/reconnect integration, possession/pass/catch animations or animation-driven input gating.
- Stadium artwork, stadium recoloring and supporter customization.
- Arbitrary RGB selection, a renderer migration, general-purpose animation tooling or automatic conversion of every existing flattened sprite.
- Replacing accepted production art or changing default Match presentation.
- Production rollout of recolorable busts to product screens, including changing the live team-builder asset path; this belongs to the subsequent team-colors feature.
- Automatic kit substitutions or local color overrides such as red versus blue or black versus white; these are a separate future enhancement.

## Functional Requirements

1. Identify primary, secondary and fixed-material pixels explicitly. Skin, fur, metal, leather and outlines must not change when team colors change. Preserve alpha and intended shading.
2. Support all 256 ordered primary/secondary pairs from the same authored source per design/clip and per static bust. Generated caches are allowed; separately hand-authored palette variants are not. Apply the same selected ramps and material-recoloring rules to each design's pitch sprites and bust.
3. Record exact color values and shading ramps. Equal primary/secondary selections and similar or identical opposing kits are valid. Deliberate blending of primary/secondary details is acceptable; silhouettes, poses and fixed materials must remain readable against the pitch or the relevant UI background. Document limitations rather than silently reducing supported combinations or substituting team colors.
4. Use frame metadata that records clip identity, frame order, duration, loop/one-shot behavior, direction, bounds and the placement anchors required by the existing presentation. Allow per-frame anchors for intentional motion.
5. Demonstrate idle/movement looping and a contact/fall one-shot with a stable end pose. Keep frame counts deliberately small; record the chosen counts and timing rather than imposing a full action catalog.
6. Allow the review fixture to select a design, palette pair, clip, direction and coach end; pause/step frames; and compare perspective with Top-down view on the existing Pitch background. Controls remain development-only.
7. Demonstrate stable placement, uncut extremities and fixed-material colors across frames. Intentional movement is allowed; unintended anchor jumps, color flicker and ground sliding are defects.
8. Provide deterministic paused captures and a reduced-motion/static presentation. Missing clips or unsupported facings must retain an existing static fallback without inventing gameplay outcomes.
9. Compare indexed ramps and masks/layers against authoring effort, shading quality, alpha handling, export reliability and compatibility with the current renderer. Implement the preferred candidate first; build a minimal alternative comparison only if needed to resolve a concrete failure or tradeoff. Two complete pipelines are not required.
10. Preserve editable sources and provenance, explicit palette/material assignments, export settings and a versioned manifest. Store derived browser assets through established delivery conventions without promoting the proof to the accepted production pack.
11. Allow the fixture to preview static busts with the selected palette pair in representative UI consumers at actual display sizes. Reuse the shared portrait-resolution path rather than hand-coloring independent previews. Inventory other portrait consumers and document their compatibility or remaining integration work. Preserve each bust's own geometry and bounds; pitch frame anchors do not apply to busts.

## Acceptance Criteria

- [x] The three size classes have the scoped clips and directions in a reproducible local review fixture.
- [x] Automated validation renders/checks all 256 palette pairs for every sample frame and all three static busts; changing a pair does not change fixed materials, transparency or geometry.
- [x] All three busts use the same palette definitions and material rules as their pitch sprites. Development-only previews demonstrate player cards, builder entries, dugouts and interception choices at actual display sizes, including a working route from builder entries to the shared bust assets. Record other discovered consumers and any remaining production integration work.
- [x] Bust contact sheets cover all palette pairs; visual review at native size, integer enlargement and actual UI display sizes confirms readable artwork, preserved shading and transparency, and no clipping. Bust animation is not required.
- [x] The Human team helmet shares the selected player/bust ramps in team-name and all three splash previews. Its 256 pairs preserve fixed equipment, alpha and source geometry. Retain the atlas source/crop metadata and verify other atlas icons remain unchanged.
- [x] Native-size contact sheets cover all palette pairs on representative frames. Animation evidence includes light/light, dark/dark, strongly contrasting, equal-color and similar-opponent palettes.
- [x] Visual review covers all sample clips at native size and integer enlargement, both coach ends, mirrored views, perspective and Top-down view. Record readability, shading, bounds and anchor findings, including any unresolved defects.
- [x] Frame order/duration, looping, one-shot completion, pause/step, reduced motion and static fallback behave as documented.
- [x] Existing accepted static sprites and their placement remain unchanged; existing player-art and catalog checks pass.
- [x] A repeatable export regenerates the delivered sample, and source/delivery checks pass for any integrated sample assets.
- [x] A recorded 22-player synthetic scene demonstrates the chosen path, with asset size, frame timing, memory/cache behavior and observed runtime cost compared with static sprites on a named environment. Repeatable stutter or uncontrolled memory growth blocks acceptance. Record limitations; no fixed frame-rate threshold or all-device performance certification is required for this proof.
- [x] The decision report recommends a format with evidence, explains tradeoffs and identifies any blockers before broad production. Do not call the format proven if material visual or rendering defects remain.
- [x] Incorrect recoloring, color flicker, lost shading, clipping and unintended anchor movement block acceptance. Deliberate blending of similar uniform colors and identical opposing kits do not, subject to the readability requirement above.

## Constraints

- Follow the team-pixel-sprites skill and current sprite standard. Retain standard/small 64×64 and big 80×80 geometry unless an evidenced animation requirement justifies a documented exception.
- Retain the separate portrait geometry for busts; the existing Human portraits are 160×160. Do not force bust artwork into pitch-sprite dimensions or placement-anchor semantics.
- Preserve MUTP pixel-art readability, palette discipline, transparency and existing body/foot/ground anchor semantics. Do not bake pitch art, shadows, names, numbers or selection markers into frames.
- Respect the accepted coach-oriented pitch ADR and bounded Match transcript model. The proof is presentation-only and must not mutate authoritative Match state.
- Use the current renderer. A format requiring a renderer migration fails this bounded proof's compatibility requirement and should be reported as a separate proposal.
- Create a new branch for implementation; preserve unrelated working-tree changes. Do not commit, push or deploy without explicit authorization.
- Design for existing Android, Windows and Linux browser targets; record actual environments validated and remaining coverage.

## Implementation Guidance

Prefer the existing asset catalog/resolver-to-pitch-renderer boundary as the principal test seam. Extend existing manifests and review tooling only where the demonstration needs it. Keep the proof pack explicitly separate from accepted production packs.

Existing reference points include `assets/game/standards/team-sprite-standard.md`, `assets/game/README.md`, `browser-client/src/player-art.ts`, the projected-pitch review harness, and the asset synchronization tooling. Existing player-art, player-art-catalog and playback-motion checks provide test patterns.

Use representative art to make the decision; do not mass-produce assets before the first sample passes native-size review. A palette or mask export must be demonstrably usable by the current browser renderer, not merely valid in an art editor.

## Validation

- Test observable rendered output and exported contracts rather than private implementation structure. Focus automated checks on material invariance, complete palette coverage, frame behavior, valid geometry and delivery consistency.
- Reuse existing player-art/catalog tests and the projected-pitch browser harness. Add focused coverage only for new behavior or failure cases.
- Inspect every sample clip visually; automated pixel/metadata checks do not establish art quality.
- Run asset synchronization/checks when delivery changes, focused player-art tests, relevant browser interaction/motion checks and the production browser build. Complete repository-required broader checks for implementation and record exact commands/results; do not imply unchanged server behavior was verified by browser checks.

## Completion Notes

Deliver the sample sources (including editable busts), manifest, shared palette definitions, generated frames and bust exports, review instructions, native-size sheets, UI preview captures, short animation captures and decision/validation report. Link the evidence from the GitHub issue and this local mirror. List remaining risks and the next feature's inputs without expanding into full production.

The agreed roadmap remains sprite-format proof → team colors → one finished stadium → core animations → expanded coverage. Later incremental releases should cover complete team rosters. Old World Classic is the single stadium intended for the MVP, outside this proof. Production animations should preserve match pace, follow confirmed outcomes and finish or skip cleanly when playback advances without adding waits solely to display a clip; detailed integration remains a later feature.

This request records future implementation acceptance criteria. Documentation publication alone does not satisfy them.
