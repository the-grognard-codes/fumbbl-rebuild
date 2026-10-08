# Fifth round: ball presentation

T06 / issue #190. Native snapshots now publish optional version-one ball metadata: carrier identity plus the native in-play/moving flags. The public ball coordinate remains canonical. Old snapshots/checkpoints remain readable; unknown legacy possession keeps a highlight without claiming a loose sprite. Out-of-play retained coordinates produce no marker.

The original 16 by 20 SVG uses a pixel grid, leather browns, ivory laces and a dark outline. The circles and four arrows share one 1.5-second animation. Opacity stays at least 0.25; reduced motion retains a static visible highlight. A carried ball has no loose sprite. Asset provenance and hash live beside the source; browser asset sync delivers the same bytes.

Playback consumes actual native array coordinates and legacy object coordinates, including native ball coordinate/moving/in-play changes. It shows every confirmed movement and possession transition in order, including pickup followed by more movement in one committed route and a carrier falling on a failed rush. No movement or dice is executed by the renderer.

## Evidence

- 35 focused native checks pass: 34 state tests covering ball transitions, strict projection fixtures and recovery, plus the completed-replay metadata validation. All eight stored full-state native fixtures were updated only for additive ball metadata, and the exact recipient contract includes its four public fields. Older v1-v4 checkpoints remain accepted and modified current metadata is rejected.
- 200 client tests pass; TypeScript, static-site build and 177-asset validation pass.
- Four real native route transcript journeys cover pickup and failed carrier rush for both coaches. Pure and production-hook browser checks require carried positions at 9, 8 and 7, native drop, out-of-play removal, unknown legacy state and reduced motion.
- Projected-pitch browser checks cover occupied loose/carried states at 30/40/50 degrees and top-down from both ends, plus existing pan/zoom/camera, crowded player, read-only and artwork fallback regressions. Existing ordered playback, prompt interruption, seek and reconnect checks pass.
- Local screenshots under `.tools/fifth-round-evidence/T06/` show the pixel ball and carried highlight among Human/Orc artwork. The author inspected the native and crowded scenes at their delivered scale.

## Review and limits

Standards: APPROVE, zero actionable findings. Spec: APPROVE after fixing intra-route possession playback, native array coordinate parsing and out-of-play rendering. An apparent missing native first square was a test injection cursor collision; the test now continues the seed transcript cursor as durable recovery does.

The route fixture is captured from the native state-test engine; the browser transport/render harness does not claim to be a live deployed match. Stadium/crowd artwork is supplied by the separately maintained stadium work. No rules or deployment changes are included.
