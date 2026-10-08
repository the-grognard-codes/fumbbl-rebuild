# Fifth UI round: additional movement checks

Issue #193 adds named checks to native movement guidance. Dodge/rush colors retain the stronger translucent palette approved during T08. Pickup and jump show native successful d6 targets, including the fixed 2+ base for Secure the Ball; Diving Tackle, Tentacles and Shadowing show possible reactions without a fabricated target. Steady Footing is explicitly conditional on falling. Players unable to pick up the ball see ball-scatter guidance instead of a pickup roll.

The browser marks additional checks with a compact exclamation mark inside the square. A named key and full square descriptions show every applicable check and native target for the pointed or keyboard-selected square, without crowded neighboring labels. Adjacent native jumps use their own target. Route planning tracks the first ball contact through all waypoints, so a subsequent visit does not promise another pickup after a successful first pickup. Actual native commands remain authoritative and interrupt the plan on failure.

Route version 3 and adjacent forecast version 2 carry bounded public checks. Legacy versions still decode; recovery regenerates and compares the old forecast instead of trusting saved labels. Frozen transcript states continue to omit live movement guidance.

## Evidence

- Six native movement-check tests export 24 cases: destination tackle zones, rain, Extra Arms/Big Hand, carried/out-of-play ball, inability to hold the ball, repeated ball crossing, overlapping dodge/rush/pickup/reactions, exhausted Shadowing, prone reactors, native jumps and conditional Steady Footing. A separate regression checks Secure the Ball in dry weather and rain with destination tackle zones. Coach and spectator views agree; previews leave the native state unchanged. Failed native pickup stops the route, retains the report and deduplicates retries.
- Recovery covers current metadata, the prior forecast format, omission and tampering. Existing strict fixture comparisons are retained. Fixture refreshes are checked after stripping only the added versioned metadata.
- Client tests validate native fixtures and reject unknown, private, duplicate or inconsistent checks. The browser journey uses loaded Human/Orc sprites for all 24 cases, both coach ends, four camera presets and adjacent/planned movement. Reviewed screenshots include overlapping targets, native jumps, ball scatter and a repeated ball square. Geometry assertions keep the additional-check markers inside their own projected squares. Pointer inspection hides an unrelated callout outside offered checks; keyboard inspection restores the correct named pickup/reaction targets. Offscreen clipped polygons skip marker rendering.
- Local screenshots and logs: `.tools/fifth-round-evidence/T09`, `.tools/t09-ui.log`, `.tools/t09-node.log`, `.tools/t09-native-focused.log`. Final validation results are recorded in the pull request.

No deployment or database migration is included.
