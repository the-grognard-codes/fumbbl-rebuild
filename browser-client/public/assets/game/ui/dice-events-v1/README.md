# Non-block dice event icons

78 standalone transparent SVGs on a 48 × 48 view box: eight approved samples, 62 additional event identities, and eight directional indicators. `manifest.json` records labels, report families, approved versions, and skill-art reference motifs. Report IDs are coverage metadata, not a complete runtime resolver: shared reports require native discriminators (skill, specialEffect, bomb/hailMary flags).

Approved sample selection: Catch v3, Weather v1, Dodge/Rush/Pass/Tentacles/Deviation/Scatter v3. All eight are byte-for-byte copies of their selected review assets. Other icons follow the selected blue/gold palette, with ivory, leather, red or green used where the subject needs them.

The existing animated armor, injury and casualty graphics in `DiceOutcomeGraphic.tsx` remain the source for those outcomes; no replacement animations are introduced here. Unknown events omit an icon. Missing direction metadata uses the Scatter event motif, never an inferred direction. Direction arrows must follow the displayed pitch orientation.

Art source/review tooling:
- `.notes/dice-readability/build-remaining-art.mjs`
- `.notes/dice-readability/validate-complete-art.mjs`
- `.notes/dice-readability/complete-art/index.html`

These assets are delivered by `sync-browser-assets.mjs` and selected by `dice-event-presentation.ts`. The Game Menu Interface controls apply to live play, replay, and recovery. Deviation uses typed kickoff direction/distance reports; older untyped kickoff reports retain Kick direction. Player scatter/bounce values are not a deviation pair.

Validation covers SVG parsing, static/self-contained content, image decoding, geometry, all 49 scalar report IDs, exact preservation of approved samples, and responsive review sheets. Two pre-existing approved-sample edge overhangs are recorded in the review validation JSON (Pass bottom, Catch top); their approved files are preserved rather than silently redrawn. Final pitch placement should account for their bounds.
