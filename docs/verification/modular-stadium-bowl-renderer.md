> Superseded visual evidence: the owner rejected these repeated-card captures. The current large-piece implementation and review images are [here](../../assets/game/references/stadiums/human-reference-revision/jigsaw-review/README.md). Earlier technical passes do not establish acceptance of the replacement.

# Modular bowl renderer verification

Issue [#211](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/211). Asset slice merged in [#212](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/212). Renderer base: 747bf57f950cea9bc4a7249342f53f3f3a36837d.

The approved [art brief](../../assets/game/references/stadiums/human-reference-revision/README.md) remains the acceptance target. The newly supplied assembled-bowl screenshot is archived as [live-behavior-target.png](../../assets/game/references/stadiums/human-reference-revision/live-behavior-target.png).

## Runtime composition

- The original grass is registered to the existing pitch lens. A grass sample fills the apron and furniture recesses.
- Wall faces and standing ground are projected world surfaces. Crowd banks use directional front/back/profile sprites at raised, fixed supporter anchors; overhead uses its own artwork.
- Both venues use the shared 38×27 envelope around the unchanged 26×15 pitch. The two-square apron, x=6 north/home and x=20 south/away portals, adjacent benches and pavilion footprints come from the validated catalog.
- Both side stands split at x=13. Each gets a timber partition confined to its crowd area. Canonical ownership is independent of image pose, drawing order, scrolling and halftime.
- Ground draws below upright artwork. Crowds stay packed and fixed. All four end/side stands, including the near backs of heads, remain available; lens/viewport clipping omits only off-screen pixels.

## Evidence

- Focused projection, scenery and identity tests passed, including clipping a source surface across the lens.
- Real Chrome renderer/input checks passed 48 combinations: two hosting assignments × two coach ends × four viewing elevations × three travel positions.
- Wheel zoom, right drag, narrow view, 390 cell targets, player/shadow anchors, native intent selection, dice and failed-atlas fallback passed.
- Four motion observations showed fixed banks/anchors, zero DOM mutations, stable input and reduced-motion freezes. Visible torch/pennant motion stayed below 0.2px in these short captures. This is limited headless local evidence, not a general GPU benchmark.
- Individual fan gestures and authenticated native acceptance are the final slice.

Representative captures in [renderer-evidence](renderer-evidence/); the harness emits the full camera matrix when PITCH_SCENE_EVIDENCE_DIR is set. Artwork is still judged against the assembled reference, not only atlas isolation or test results.
