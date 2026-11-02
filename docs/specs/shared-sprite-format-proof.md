# Feature: Prove the shared sprite format

Date: 2026-11-01.

Tracker: [#393](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/393).

Status: scoped feature request; implementation and artwork production have not started.

Planning reference: `docs/specs/graphics-enhancement-sequencing.md`.

## Abstract

Prove that one reusable player-art source per design can support 16 primary × 16 secondary team-color combinations and short pixel-art animations while preserving fixed materials, transparency, placement and pitch readability. Deliver a bounded working demonstration, representative artwork, validation evidence and a recommended format before broad sprite production begins.

## Objective

Resolve the shared asset-format risk for team colors and animated players. The outcome is a demonstrated authoring/export/rendering contract, not a complete team-color feature or a complete animation system.

This fits one feature because all work serves one acceptance outcome: demonstrate that recoloring and animation coexist in the same reusable format. Full roster coverage and gameplay integration are independent later features.

## Context / Existing Behavior

- Accepted player masters are flattened transparent images. Existing pose catalogs contain directional standing views, prone/stunned poses, portraits, bounds and reviewed body, foot and ground anchors.
- The player-art resolver already selects poses and mirrors standing views. Perspective and Top-down view use different placement anchors without changing Pitch square identity.
- Canonical art and generated browser delivery already have synchronization and validation tooling.
- Existing Match playback presents confirmed movement and ball changes. This proof must not introduce new game rules or infer outcomes from visual motion.
- Indexed color ramps are a candidate, not an accepted architectural decision. Masks/layers remain an alternative. Browser display of an indexed PNG alone does not implement runtime recoloring.

## In Scope

- Three representative player designs: one standard, one small and one big player, chosen from established roster/art references where feasible. Record the exact selections before production.
- Three short clips per design: idle, movement and contact/fall, including a stable final ground pose.
- One authored three-quarter direction for all three designs, plus the opposite three-quarter direction for the standard player to exercise direction selection. Exercise mirrored display for these clips; no complete eight-direction art set is required.
- Sixteen explicit reusable color ramps, independently selected as primary and secondary, including all 16 same-color pairs.
- A repeatable browser review fixture using the existing player-art and projected-pitch presentation boundaries where practical.
- A versioned sample asset pack, repeatable export, format documentation, visual evidence and a decision report.

## Out of Scope

- Full rosters, all positions, all facings, all action animations or new portrait production.
- Product color-picker UI, saved team persistence, Match team schema changes or server/protocol changes.
- Production action-to-animation routing, Match replay/reconnect integration, possession/pass/catch animations or animation-driven input gating.
- Stadium artwork, stadium recoloring and supporter customization.
- Arbitrary RGB selection, a renderer migration, general-purpose animation tooling or automatic conversion of every existing flattened sprite.
- Replacing accepted production art or changing default Match presentation.

## Functional Requirements

1. Identify primary, secondary and fixed-material pixels explicitly. Skin, fur, metal, leather and outlines must not change when team colors change. Preserve alpha and intended shading.
2. Support all 256 ordered primary/secondary pairs from the same authored source per design/clip. Generated caches are allowed; separately hand-authored palette variants are not.
3. Record exact color values and shading ramps. Equal primary/secondary selections are valid; document any readability limitations rather than silently reducing the supported combinations.
4. Use frame metadata that records clip identity, frame order, duration, loop/one-shot behavior, direction, bounds and the placement anchors required by the existing presentation. Allow per-frame anchors for intentional motion.
5. Demonstrate idle/movement looping and a contact/fall one-shot with a stable end pose. Keep frame counts deliberately small; record the chosen counts and timing rather than imposing a full action catalog.
6. Allow the review fixture to select a design, palette pair, clip, direction and coach end; pause/step frames; and compare perspective with Top-down view on the existing Pitch background. Controls remain development-only.
7. Demonstrate stable placement, uncut extremities and fixed-material colors across frames. Intentional movement is allowed; unintended anchor jumps, color flicker and ground sliding are defects.
8. Provide deterministic paused captures and a reduced-motion/static presentation. Missing clips or unsupported facings must retain an existing static fallback without inventing gameplay outcomes.
9. Compare indexed ramps and masks/layers against authoring effort, shading quality, alpha handling, export reliability and compatibility with the current renderer. Implement the preferred candidate first; build a minimal alternative comparison only if needed to resolve a concrete failure or tradeoff. Two complete pipelines are not required.
10. Preserve editable sources and provenance, explicit palette/material assignments, export settings and a versioned manifest. Store derived browser assets through established delivery conventions without promoting the proof to the accepted production pack.

## Acceptance Criteria

- [ ] The three size classes have the scoped clips and directions in a reproducible local review fixture.
- [ ] Automated validation renders/checks all 256 palette pairs for every sample frame; changing a pair does not change fixed materials, transparency or geometry.
- [ ] Native-size contact sheets cover all palette pairs on representative frames. Animation evidence includes light/light, dark/dark, strongly contrasting, equal-color and similar-opponent palettes.
- [ ] Visual review covers all sample clips at native size and integer enlargement, both coach ends, mirrored views, perspective and Top-down view. Record readability, shading, bounds and anchor findings, including any unresolved defects.
- [ ] Frame order/duration, looping, one-shot completion, pause/step, reduced motion and static fallback behave as documented.
- [ ] Existing accepted static sprites and their placement remain unchanged; existing player-art and catalog checks pass.
- [ ] A repeatable export regenerates the delivered sample, and source/delivery checks pass for any integrated sample assets.
- [ ] A recorded 22-player synthetic scene demonstrates the chosen path, with asset size, frame/caching behavior and observed runtime cost compared with static sprites on a named environment. Record limitations; this is not a claim of all-device performance certification.
- [ ] The decision report recommends a format with evidence, explains tradeoffs and identifies any blockers before broad production. Do not call the format proven if material visual or rendering defects remain.

## Constraints

- Follow the team-pixel-sprites skill and current sprite standard. Retain standard/small 64×64 and big 80×80 geometry unless an evidenced animation requirement justifies a documented exception.
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

Deliver the sample sources, manifest, palette definitions, generated frames, review instructions, native-size sheets, short animation captures and decision/validation report. Link the evidence from the GitHub issue and this local mirror. List remaining risks and the next feature's inputs without expanding into full production.

This request records future implementation acceptance criteria. Documentation publication alone does not satisfy them.
