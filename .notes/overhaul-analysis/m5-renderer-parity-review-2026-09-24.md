# M5 renderer parity: initial implementation review

Status: **first local slice implemented; DOM/SVG selected provisionally for M5 on 2026-09-25**. Branch: `codex/m5-renderer-parity`. Initial review date: 2026-09-24 (America/New_York); decision recorded 2026-09-25.

## What is ready to inspect

Run `npm run dev` in `browser-client`, then open `/pitch-parity`. The independent `/pitch-preview` route remains available. The new route has one immutable Human/Orc fixture and reducer for a local movement-then-block Blitz; the DOM/SVG and Pixi pitch receive the same state and emit square intents. Scoreboard, dugouts, action strip, and sidebar remain DOM. Select Alden then Rhea, commit the preview, and choose a mock block result. The displayed route, risk colors, and result are illustrative; no rules engine or `/browser/v2` command is involved.

The route offers side-by-side, DOM-only, and Pixi-only modes, a sparse or 11-v-11 scene, Fit/1.5×/2× in-app zoom, and drag panning when zoomed. It uses the existing Human/Orc PNGs and one shared 26×15 SVG field. On Pixi initialization failure or context loss it shows a functional labeled 390-square DOM grid and retains action controls. A missing player sprite becomes a labeled token.

Generated captures live in `browser-client/test-output/pitch-parity/` after `node test/pitch-parity-demo.mjs`; the directory is ignored by Git. Paired starting views include `1920x1080-dom-100.png` and `1920x1080-pixi-100.png`, plus corresponding 1280×720, in-app 2×, sparse, side-by-side, Blitz preview, and failure captures. These are full-page Chrome headless captures. The labels `100` and `200` refer to **in-app** Fit/2× controls, not browser zoom.

## Initial visual inspection

The field geometry, cell positions, and player ordering appear aligned in the paired 1920×1080 captures. The shared SVG field looks softer after Pixi rasterizes it into a WebGL texture and scales it to the fitted board; DOM/SVG retains sharper vector lines. DOM player bases are curved borders while the Pixi bases are straight line segments, and text badges differ slightly. These are visible differences for the owner and independent reviewer to classify as acceptable, fixable, or blocking. Pixi sprite height and ball layer order were corrected during inspection. This inspection is an agent's visual check, not the agreed human review.

Owner feedback: the DOM/SVG view is notably crisper and looks better than the Pixi view. The owner reports a unanimous DOM/SVG choice after review. This resolves the renderer comparison for M5; it does not mark the integrated browser, accessibility, or performance checks as passed.

## DOM/SVG animation capability

The DOM/SVG board can animate sprite sheets. Keep the existing player element as the interaction target, and show a clipped sheet frame within it using stepped CSS/WAAPI timing. Move its wrapper along the route with transforms while playing walk frames; play a finite block animation on the action event; use a resting pose, frame loop, or composable status badge for distracted, prone, and stunned states. Frame dimensions, sequence, anchor, timing, and status priority should be explicit asset metadata so large players and overlapping statuses remain predictable. The supplied character art is a style reference; a static character image or grid of different characters is not itself a ready movement/block animation sequence.

SVG can animate a planned route with a moving dash pattern or marker along a `<path>`, plus destination arrowheads and square labels. Keep the route and its probabilities in renderer-neutral presentation data. The renderer can show a server-projected per-step target/percentage and, if defined, cumulative route success; it must not invent Blood Bowl odds from the illustrative local risk colors. Distinguish a dice target such as `3+` from a percentage and state whether the percentage includes rerolls. Pause or simplify the visual motion for reduced-motion users when accessibility work is integrated.

These capabilities remove the need to choose Pixi solely for future sprite or route animation. A representative DOM animation still needs visual and crowded-board performance checks during M5 integration.

## Automated evidence and limits

- `npm run build` passed; Vite reports the existing large-chunk advisory.
- The focused model tests passed, including the scripted Blitz transition and deselection.
- `node test/pitch-parity-demo.mjs` passed in Chrome headless at 1280×720 and 1920×1080: static assets, shared DOM/Pixi Blitz actions, 2× overflow, startup/context failure grid, and sprite fallback. The existing `node test/pitch-preview-demo.mjs` passed in full, compact, and mobile layouts.
- `node test/pitch-parity-projection.mjs` inventoried independent server-generated `supported-actions-v1.json` cases. A before-block projection advertises `blitz`, and a separate revision has pending `blockDie`. Those cases do **not** establish a continuous movement-then-block Blitz or matching acting-player/spectator views. The saved projection has no sprite identity or renderer-ready path/risk descriptor; the integration must map approved roster art and use server-issued actions without inventing legality.
- `node test/pitch-parity-measure.mjs` recorded three headless runs of each single-renderer 900 ms Blitz at each viewport in Chrome 153.0.8010.53 and Edge 153.0.4234.48 on Windows x64, 16 logical CPUs, 16 GB RAM. Chrome 1920×1080 p95 rAF intervals were 24.1/24.4/36.5 ms for DOM and 12.2/12.2/12.2 ms for Pixi; Edge at that viewport was 18.3/18.5/18.3 ms for DOM and 12.1/12.1/12.2 ms for Pixi. These are exploratory headless figures, not a foreground same-machine benchmark or evidence of 60 fps on a 60 Hz display. The raw report includes frame counts, first rAF latency, and JS heap samples; the heap samples do not establish a memory trend or total GPU use.

## Remaining M5 integration checks

1. Map `/browser/v2` snapshots and legal actions to the selected DOM/SVG presentation. Capture one secret-free authoritative movement-then-block Blitz sequence at the three agreed points, with same-revision actor and spectator projections; the current local mock is not this evidence.
2. Test representative DOM player/action and SVG path animation on a crowded board in a foreground browser. At both viewport sizes and actual 100% and 200% **browser** zoom, check input response, frame pacing, memory trend, overlap, and readable odds labels. The current captures only exercise the route's in-app zoom. Optimize measured DOM issues before reconsidering the board choice.
3. Run Firefox when installed. Current Chrome and Edge checks were headless. Mac Safari/VoiceOver and iPad touch tests await devices. Build the agreed keyboard/text companion now that the renderer is chosen; the existing failure grid is not screen-reader acceptance.
4. Complete the separate setup/match routes, authorized two-player and spectator flows, prompt/retry/reconnect checks, and R6 browser/accessibility/provenance matrix before integrated M5 acceptance. Record any product minimum for iPad only after device and support-scope testing.

See [the agreed plan](m5-renderer-parity-plan.md) and [the prior handoff](fumbbl-renderer-parity-handoff-2026-09-24.md).
