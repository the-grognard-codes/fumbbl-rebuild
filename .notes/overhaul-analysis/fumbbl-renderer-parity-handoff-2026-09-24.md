# Renderer parity handoff — M5 first slice

## Purpose
Build a side-by-side parity experiment for the approved match-screen MVP and use its evidence to decide the desktop pitch renderer. The owner favors the hybrid boundary: Pixi for the pitch if the comparison supports it; React DOM for scoreboard, dugouts, player details, action controls, log/chat, setup, and accessible status. Animated player and other sprites are a future reason to evaluate Pixi. The renderer decision is open until the experiment; do not treat this preference as a completed ADR addendum.

## Canonical context (read these; do not recreate their content)
- `.notes/overhaul-analysis/06-roadmap-and-prototype.md`: M5 now owns desktop GUI/MVP integration and starts with the parity spike; former mobile/content M5 is M6. The 20–40 developer-day M5 range is provisional for the whole GUI integration, not a parity-spike estimate.
- `.notes/overhaul-analysis/04-technology-and-decisions.md`, ADR-002: accepted React/Pixi preference with DOM/SVG reconsideration allowed. Dated note addresses experimental Pixi Canvas support and the need to test the pinned build.
- `.notes/overhaul-analysis/m4-workstreams-reference.md`, R6-0 through R6-5: renderer decision, accessibility, fallback, browser matrix, asset rights, and later setup/live workflow acceptance. Distinguish current DOM live client, local MVP, and M1 Pixi evidence.
- `browser-client/pitch-layout.md` and `.notes/art-preview/pitch-and-ui-requirements-v2.md`: approved pitch geometry, sprite ratios, scaling, current MVP interactions, and existing preview checks.
- `browser-client/src/PitchPreview.tsx`, `usePitchInteraction.tsx`, `pitch-demo.ts`, `pitch-preview.css`, `DugoutPreview.tsx`: local DOM/SVG MVP. It has sample state and assumed-success actions; it is not the authoritative client.
- `browser-client/src/board.ts`: existing M1 Pixi `BoardView` at 36 logical pixels per square with neutral tokens and an explicit WebGL request. Its DOM failure path was verified in `.notes/overhaul-analysis/verification/m1c/README.md`, but its appearance is not MVP parity.
- `browser-client/src/play-entry.tsx`, `v2-client.ts`, `SetupPanel.tsx`: hosted `/play` DOM client and authoritative `/browser/v2` integration; not a source of mock rules for the parity spike.

## Next slice: implementation and evidence
Use one shared, immutable fixture/interaction model to drive both pitch renderers side by side. Keep the existing MVP route intact. A parallel route or toggle is fine for the experiment. Reproduce the 26×15 pitch, one-square end zones, 4/7/4 zones, crowded player overlap/order, 64:56 normal and 80:56 large sprite-to-square ratios, selected player, reachable-square risk overlay, movement path, hover/target/click-to-deselect, and Fit/zoom/pan. Preserve actual 64px Human/Orc image files. Keep the scoreboard, dugouts, action strip, tooltips, and sidebar in DOM; the comparison is primarily the pitch scene, not an all-canvas UI rebuild.

Use renderer-neutral coordinates and event intents so both presentations receive the same state. Pixi must not own rules, legal-action calculation, command state, or connection lifecycle. For this local experiment, retain the clearly labeled mock interaction model; do not connect it to `/browser/v2` or claim live-match acceptance. Check crisp pixel-art sampling, anchor/alignment, text/line/filter differences, hit areas when art exceeds square bounds, z-order in crowded formations, high-DPI/browser zoom, asset failure, renderer initialization/context loss, and screen-reader/keyboard companion controls. The existing visible controls and actionable DOM failure path must remain usable if Pixi fails. Treat Pixi Canvas rendering as experimental and unverified for this pinned build.

Capture comparable screenshots and measurements at 1280×720 and 1920×1080, 100% and 200% browser zoom, plus a crowded formation. Record browser/OS/version, CSS viewport, device scale, frame timing and memory observations, and any mismatch that is intentional or still open. Do not infer cross-browser or screen-reader acceptance from one automated browser. Produce a short decision record: parity results, maintenance/accessibility/performance tradeoffs, whether Pixi or DOM/SVG owns the production board, any condition attached to that choice, and the ADR-002 update needed. Full live `/browser/v2` handoff remains a later M5 slice.

## Questions for the Grill Me session
- What level of visual parity is required: pixel comparison, perceptual match, or preservation of layout and interaction invariants?
- Which animations/effects must the spike actually demonstrate, versus merely leave room for?
- What measured benefit would justify replacing the current DOM/SVG pitch, and what regression would veto Pixi?
- What is the minimum keyboard/screen-reader companion for the parity prototype, and what remains for R6 acceptance?
- Which browsers and hardware are available for actual measurements? How should untested Safari/AT combinations be recorded?
- Should the experiment use the current mock route only, or a read-only authoritative snapshot fixture as an additional contract check?

## Working-tree state
As of this handoff, the roadmap, ADR note, and M4 R6 reference have uncommitted planning edits. Preserve them and inspect the working tree before editing. No Pixi MVP parity implementation has been started in this conversation. The repository moved from the old `fumbbl-rebuild-chatgpt` directory to `fumbbl-rebuild`.

## Suggested skills
- `.agents/skills/grill-me/SKILL.md` for the owner's intended Grill Me refinement before scope is locked.
- `.agents/skills/prototype/SKILL.md` for the bounded side-by-side experiment, if its workflow fits the refined questions.
- `.agents/skills/implement/SKILL.md` once the experiment's acceptance criteria are settled and implementation starts.