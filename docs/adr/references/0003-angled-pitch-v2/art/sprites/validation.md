# MUTP camera reference cutouts

Reviewed on 2026-10-03 against the approved v1 match-screen artwork, team sprite standard 1.1, native 64px pitch-green contact sheet and integer 3× enlargement.

Six reference illustrations: human front/back, orc front/back, Alden front/back. All retain the approved navy/ivory human and olive-skin/rust/charcoal orc kits, chunky pixel contours, complete feet and readable silhouettes. Alden retains the orange mohawk/beard and blue kit. The neutral human back has no repeated jersey number; Alden retains number 3. Front/back poses are the user-required exception to the standard three-quarter pose. This is a cutout pack for documentation, not a full roster or promoted runtime artwork.

The standard exporter verified true transparent corner margins, full-body bounds, 64×64 canvases, and artwork contained within the canvas. Nearest-neighbor reduction can discard faint source-alpha pixels, leaving the visible baseline short of the nominal `(32,63)` export anchor. The reference renderer therefore uses canvas-center `x=32` and the manifest's alpha-bound bottom edge for `y`; all displayed feet meet the projected square center without a baseline gap.

All 24 reference captures verify 390 unique squares, 22 unique players in assigned squares, 11 per team, and both coach ends. Independent polygon-diagonal intersection checks confirm the displayed anchor, within a 0.001px tolerance for SVG point storage. Full-pitch captures expose every row and column; match framing reserves headroom beneath the approved scoreboard. Gallery/viewer checks cover desktop/narrow layout, full-pitch switching, pan extremes, canonical-square inspection and coordinate/feet markers.

Original PNG copies, source hashes, exact image-generation prompts, exporter metadata and contact sheets accompany these reference exports. Elevation/yaw-specific sprite artwork, animation, gameplay targeting and performance are outside this reference correction.
