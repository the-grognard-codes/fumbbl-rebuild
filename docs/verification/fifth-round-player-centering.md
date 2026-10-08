# Fifth round: player body centering

Issue [#191](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/191), T07. The 2026-10-07 review covers 84 Human/Orc body poses and 12 portraits. It changes placement metadata, preserving all 96 canonical PNG hashes.

Standing bodies now use a reviewed horizontal torso/feet centerline, excluding extended arms and equipment. Perspective placement uses that line at the existing foot baseline. Top-down placement uses it at the existing vertical body midpoint. Ground poses retain their original ground-center anchors. Mirrors transform every anchor with the artwork. Canonical occupancy, player IDs, square hit targets, scale, depth sorting and camera behavior remain unchanged.

Shadows stay behind the entire player layer and follow rendered feet or ground-pose centers. In top-down mode this includes the offset below the upright body center. Missing images use centered tokens and centered shadows. ADR 0003 explicitly refines its former horizontal alpha-bounds centering decision.

Before: the Human blitzer front used x=32, the Orc thrower back x=32, and Troll side x=40, despite asymmetric bodies. After visual review their recorded centerlines are respectively 30, 27 and 34. These values are visual judgments against native sprites, not an alpha-mass or bottom-row heuristic. All 42 poses per team have native and enlarged guide sheets under their pack's `qa/`, with old cyan and reviewed gold lines.

Validation:

- 202 Node tests pass, including direction/mirror selection, asymmetric body placement and unchanged ground-pose placement.
- The strict asset check validates 177 delivered game files, catalog geometry, bounded reviewed anchors and exact delivery hashes. The historical export helper refuses to overwrite promoted schema-2 anchors.
- TypeScript and the static site build pass.
- The projected-pitch browser journey passes in both coach views at 30/40/50 degrees and top-down, including pan, zoom, canonical input, shadows beneath rendered feet and missing-art token shadows. The same run verifies 48 stadium/camera combinations and existing motion behavior.
- Native ordinary/chain-push artwork journeys pass with the revised body-anchor contract, preserving canonical positions and native prone transitions.
- Native transcript playback rendering passes, including ordered movement, ball pickup/movement, reconnect, reduced motion, replay seek and required prompts.
- Native-size and enlarged contact sheets and actual pitch captures were inspected. This is a placement correction, not approval of new artwork or a change to native game rules.

Reproduce from `browser-client`: `npm test`, `npm run assets:check`, `npm exec --offline -- tsc --noEmit`, `node --experimental-strip-types test/projected-pitch-ui.mjs`, and `node test/playback-ui.mjs`. Run asset generation/builds before browser journeys, so Vite does not reload generated catalogs during a test.
