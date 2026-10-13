# Fifth round: ball presentation

T06 / issue #190. Native snapshots now publish optional version-one ball metadata: carrier identity plus the native in-play/moving flags. The public ball coordinate remains canonical. Old snapshots/checkpoints remain readable; unknown legacy possession keeps a highlight without claiming a loose sprite. Out-of-play retained coordinates produce no marker.

The original 16 by 20 SVG uses a pixel grid, leather browns, ivory laces and a dark outline. Ground balls show both this football sprite and the animated highlight; carried balls show the player and highlight without the football sprite. The ground sprite scales directly with projected square size: its unrotated image height is 20/75 of a square's projected width, matching the smaller owner-approved reference proportion. There are no minimum or maximum pixel-size clamps. It remains centered and tilted 18 degrees with a proportional stepped shadow underneath its lower tip; the shadow also disappears when carried. Asset provenance and hash live beside the source; browser asset sync delivers the same bytes.

`node test/ball-zoom-ui.mjs` reproduces the former size-clamp bug and verifies constant football/shadow proportions and centering across .75x, 1x, 1.5x, 2x and 3x zoom, both coach ends, and perspective 30/40/50 degrees plus top-down.

The October 13 marker revision replaces the pulsing screen-space circles with original 32-pixel stepped artwork in MUTP gold, ivory and navy. The outer ring turns once every 24 seconds; the four separated inward arrows turn in the opposite direction every 18 seconds. Both rotate inside the ground plane before the pitch camera transform, so the marker follows perspective and stays within its square through every rotation. Opacity and scale remain constant. Reduced motion keeps both parts visible and static.

Playback consumes actual native array coordinates and legacy object coordinates, including native ball coordinate/moving/in-play changes. It shows every confirmed movement and possession transition in order, including pickup followed by more movement in one committed route and a carrier falling on a failed rush. No movement or dice is executed by the renderer.

## Evidence

October 13 revision: the browser build and 18 focused ball-state, playback and projection tests pass. `ball-ui.mjs` verifies all four native pickup/drop journeys, sprite visibility, opposite rotations, reduced motion, and full-turn artwork bounds including outlines and the gap between arrows and ring. `projected-pitch-ui.mjs` verifies marker registration at every square corner and browser-painted bounds at 30/40/50 degrees and top-down, from both ends with occupied loose and carried balls; its existing camera/input/scenery regressions also pass. Screenshots are under `browser-client/test-output/ball-marker/`. These use local production components with controlled native fixtures, not a deployed match.

Original native-state integration evidence (before the October 13 artwork revision):

- 35 focused native checks pass: 34 state tests covering ball transitions, strict projection fixtures and recovery, plus the completed-replay metadata validation. All eight stored full-state native fixtures were updated only for additive ball metadata, and the exact recipient contract includes its four public fields. Older v1-v4 checkpoints remain accepted and modified current metadata is rejected.
- 200 client tests pass; TypeScript, static-site build and 177-asset validation pass.
- Four real native route transcript journeys cover pickup and failed carrier rush for both coaches. Pure and production-hook browser checks require carried positions at 9, 8 and 7, native drop, out-of-play removal, unknown legacy state and reduced motion.
- Projected-pitch browser checks cover occupied loose/carried states at 30/40/50 degrees and top-down from both ends, plus existing pan/zoom/camera, crowded player, read-only and artwork fallback regressions. Existing ordered playback, prompt interruption, seek and reconnect checks pass.
- Local screenshots under `.tools/fifth-round-evidence/T06/` show the pixel ball and carried highlight among Human/Orc artwork. The author inspected the native and crowded scenes at their delivered scale.

## Review and limits

Standards: APPROVE, zero actionable findings. Spec: APPROVE after fixing intra-route possession playback, native array coordinate parsing and out-of-play rendering. An apparent missing native first square was a test injection cursor collision; the test now continues the seed transcript cursor as durable recovery does.

The route fixture is captured from the native state-test engine; the browser transport/render harness does not claim to be a live deployed match. Stadium/crowd artwork is supplied by the separately maintained stadium work. No rules or deployment changes are included.
