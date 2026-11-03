# Lineman animation checkpoint

Approval update: the user approved this animated sample on 2026-11-03 ("All looks perfect"), unlocking the halfling/ogre stage. The remaining text records the original checkpoint; the complete proof outcome supersedes its pending-work notes.

Generated with image_gen using the established Human lineman front45/back45 originals, not procedurally drawn. Exact prompts are in prompts.json. Source sheets contain four columns and three rows: idle, move, contact/fall. Magenta is an authoring sentinel for secondary uniform material, rendered through the approved palette in the review page.

The initial front45-generated.png contains unwanted background haze; front45.png is the transparency correction. back45.png is the opposite-view source. All originals are retained. export-v1 is an incomplete attempt with a too-small fit reference; export-v2 is the selected export. No master assets are replaced.

The standard exporter uses a shared 362-source-pixel fit reference for these frames, preserving scale across all clips instead of fitting each pose independently. Each exported frame is 64x64, nearest-neighbor, bottom centered with transparent margin. This is the animation-specific exception to per-player fitting. Cutouts and exported native/3x sheets are retained. Fixed scale does not guarantee perfect anatomical consistency from generated artwork; idle proportions and the fall transition remain visual approval items.

The animation pack builder records source hashes and material indices. Blue and magenta authoring colors identify uniform regions; neutral gray steel, brown leather, skin and outlines stay fixed. Source and runtime palettes are separate. All 256 pairs across all 24 frames pass alpha/fixed-material invariance tests. The runtime does not infer materials from colors.

Inspected both source sheets, all exported frames in the 3x sheet, and the recolored browser sample. The back fall is a grounded pose seen from behind, not a separate approved prone-state illustration. No 22-player performance, projected-pitch placement, halfling or ogre claim is made here. Those remain later proof work. First animated-sample approval is pending.

Preview: http://127.0.0.1:5182/test/sprite-proof.html#animation-proof
