# Replay layout measurements — 2026-10-31

This measures geometric failure boundaries of the existing replay page. It does **not** establish a usability minimum, device support policy, or a display gate. Smallest tested passing pairs apply only to these fixtures, styles, loaded fonts, and browser.

## Result

At **734 × 343** and **863 × 360** CSS pixels, all exercised replay controls are reachable after document scrolling, and the replay controls do not overlap. The default compact dugouts have overlapping summary buttons, so the complete replay page fails an overlap-free criterion at both phone sizes. **1024 × 768, 1280 × 720, and 1920 × 945** pass the measured geometry and reachability checks in both fixtures. All five requested viewports require vertical document scrolling. [Measured results](../../.tools/hardware-research/replay-minima/refined.json)

| Viewport, CSS px | Replay actions, both fixtures | Page geometry, both fixtures | Normal / long-crowded document height |
| --- | --- | --- | --- |
| 734 × 343 | Pass | Fail: 6 compact-dugout button intersections | 2038 / 2126 px |
| 863 × 360 | Pass | Fail: 6 compact-dugout button intersections | 1933 / 2021 px |
| 1024 × 768 | Pass | Pass | 2075 / 2163 px |
| 1280 × 720 | Pass | Pass | 2016 / 2077 px |
| 1920 × 945 | Pass | Pass | 2211 / 2272 px |

The smallest tested width passing the complete measured page checks is **967 × 320** in both fixtures; **966 × 320 fails**, with two button intersections exceeding the 1-pixel tolerance. The colliding boundary pair is the **Knocked out / Casualties** compact-dugout summary buttons. This is a supporting layout constraint: the replay navigation itself passes at **320 × 320**, while the full page fails due to dugout collisions. Below 320 CSS pixels, the document remains at least 320 pixels wide because the existing site CSS sets `body { min-width: 20rem; }`. [Integer-edge data](../../.tools/hardware-research/replay-minima/edge.json), [site CSS](../../site/src/assets/site.css), [dugout grid CSS](../../browser-client/src/live-pitch.css)

The height sweep deliberately permits scrolling. The smallest tested heights passing the measured checks are **970 × 44** and **1280 × 44** in both fixtures, including the scrollable Game Menu fitting the viewport. **1280 × 42 fails** because the menu extends below the viewport: `y=12`, bottom `44`. The same clipping occurs at 40 pixels. This is a clipping failure despite successful center-point clicks. These tiny sizes have no asserted usability value. The width and height bounds were measured at the specified pairs; 967 × 44 was not tested. [Modal edge geometry](../../.tools/hardware-research/replay-minima/edge.json), [modal sizing source](../../browser-client/src/live-pitch.css)

At **980 × 2200**, both fixtures pass with no document scrolling. This is a tested simultaneous-page-fit example, not the smallest such height. The pitch has a viewport-dependent maximum height, so the document heights in the table cannot simply be reused as universal minimum viewport heights. [Tall-page result](../../.tools/hardware-research/replay-minima/refined.json), [pitch sizing source](../../browser-client/src/live-pitch.css)

## What was measured

The research harness renders the real `HostedResult`, `ReplayBoard`/`LivePitch`, `LiveDugouts`, `MatchHistory`, and `GameMenu` components. It reproduces the result route's `play-runtime setup-panel live-match-page` wrapper and heading, imports the existing site and product styles, and changes no product source. It supplies a local reactive fixture instead of starting a game server. Existing replay tests informed the harness construction. [Harness](replay-layout-minima-harness.tsx), [result component](../../browser-client/src/HostedResult.tsx), [result route](../../browser-client/src/play-entry.tsx), [existing reactive harness](../../browser-client/test/reactive-replay-harness.tsx), [site result tests](../../site/test/m5e-result-browser.test.mjs)

Both fixtures use eight transcript records, connected/nonpending state, event 4 initially displayed, result format 3, Log selected initially, compact dugouts, default home-facing 40° camera, default text sizes, and Skip animations initially checked. Geometry is captured on a fresh navigation after `document.fonts.ready`, pitch scene creation, and a 150 ms settling period. Every record needed by the fixture is supplied; there is no missing-transcript synchronization state. [Probe](replay-layout-minima-probe.mjs), [playback behavior](../../browser-client/src/use-pitch-playback.ts), [camera defaults](../../browser-client/src/camera-preferences.ts)

- **Normal:** short team/player names and four on-pitch players.
- **Long-crowded:** 57- and 54-character team names, long player names, 22 players grouped in adjacent pitch squares, plus one player in each of five off-pitch categories for each team; one long saved chat message.

These are synthetic layout states, not an exhaustive valid-match trajectory. Player sprites intentionally overlap in the angled pitch projection and are not counted as DOM panel collisions. The test does not require every projected player to have a separate visible rectangle. [Fixture generation](replay-layout-minima-probe.mjs), [projection and marker implementation](../../browser-client/src/LivePitch.tsx)

The automated checks cover:

- Pairwise replay button/input/select intersections; replay controls extending beyond viewport width; document horizontal overflow.
- Pairwise independent controls within compact dugouts, camera control groups, history tabs and selected log control groups. CSS border boxes are compared; decorative shadows are excluded. An intersection must exceed 1 CSS pixel in both axes to fail.
- Real Playwright actions for First, Next, Previous, Last, turn selection, event entry and Seek, speed selection, Play/Pause, Skip animations, Reload result, Chat/Log tabs, all six Game Menu tabs, and menu close. The navigation/seek/reload callback sequence is recorded and asserted. Playwright performs scrolling and actionability checks; dropdown selection uses `selectOption` and therefore does not verify the native option popup's visual layout.
- Game Menu viewport bounds in the final refined/edge runs, independently of action success; page JavaScript errors.

Vertical document scrolling, internal log/chat/menu scrolling, native select text elision, ellipsized dugout headings, and intentional modal/pitch overlays are permitted. A summary button extending slightly into an otherwise visible grid gap is advisory, not clipping: the historical JSON key `supportingClipping` records this **cell overflow**, while `supportingOverlap` records actual button intersections. At 1024 × 768, the Casualties button extends about 3 pixels beyond its cell but does not collide with its neighbor; visual review agrees with the pass classification. [Geometry and classification implementation](replay-layout-minima-probe.mjs), [1024 screenshot](../../.tools/hardware-research/replay-minima/normal-1024x768-full.png)

## Reproduction and evidence

Workspace source revision: `01a21242d381198a83a8b5621bb991b6b52f516c`. Research-only files were added on top of pre-existing unrelated workspace changes. Runtime: Windows, Node **v26.8.1**, Playwright **1.62.1**, installed headless Google Chrome **156.0.8078.76**, DPR **1**, CSS viewport sizing, no mobile emulation, default zoom. The default dark site/product appearance was the only theme covered. Final JSON records loaded font families/weights: Inter 400/700, Chakra Petch 700, Match Alegreya 500, Match Barlow 400, and MUTP 700. [Final run metadata](../../.tools/hardware-research/replay-minima/refined.json), [dependency versions](../../browser-client/package.json)

Run from the repository root in PowerShell. No installation, product build, or product test-suite run was required. The script starts/stops its own local Vite server and launches installed Chrome; its dependency cache is isolated in the evidence directory.

```powershell
node --version
git rev-parse HEAD
node docs/research/replay-layout-minima-probe.mjs

$env:REPLAY_PAIRS='[[880,320],[900,320],[920,320],[940,320],[960,320],[980,320],[1000,320],[1024,320],[1280,240],[1280,120],[1280,60],[1280,40],[1280,24],[734,40],[734,24],[1920,3000]]'
$env:REPLAY_REPORT='boundary.json'
node docs/research/replay-layout-minima-probe.mjs

$env:REPLAY_PAIRS='[[1920,945],[1280,720],[1024,768],[863,360],[734,343],[960,320],[965,320],[970,320],[975,320],[980,320],[320,320],[300,320],[1280,60],[1280,40],[1280,32],[1280,24],[980,2200]]'
$env:REPLAY_REPORT='refined.json'
node docs/research/replay-layout-minima-probe.mjs

$env:REPLAY_PAIRS='[[966,320],[967,320],[968,320],[969,320],[970,44],[1280,44],[1280,42]]'
$env:REPLAY_REPORT='edge.json'
node docs/research/replay-layout-minima-probe.mjs

$env:REPLAY_PAIRS='[[967,320]]'
$env:REPLAY_REPORT='minimum-screenshot.json'
node docs/research/replay-layout-minima-probe.mjs

Remove-Item Env:REPLAY_PAIRS, Env:REPLAY_REPORT
```

The default sweep is encoded in the probe: requested device dimensions, widths 240–1920, and heights 60–945 across 26 pairs, each in both fixtures. `measurements.json` retains that broad run; `boundary.json` is the coarse refinement; `refined.json` repeats requested dimensions with additional geometry checks; `edge.json` refines the nearby integer boundaries. Early exploratory runs were interrupted to correct select locators and distinguish harmless grid-gap overflow from actual clipping. The retained broad JSON was reclassified using the final gap-overflow rule; use refined/edge runs for modal-bound conclusions. Every retained run completed without page JavaScript errors. [Broad data](../../.tools/hardware-research/replay-minima/measurements.json), [coarse data](../../.tools/hardware-research/replay-minima/boundary.json), [edge data](../../.tools/hardware-research/replay-minima/edge.json)

The final 967 × 320 screenshot rerun executes the saved probe's callback assertions in both fixtures. The earlier 132 recorded callback sequences were independently checked against `[0, 1, 0, 7, 3, 3, 'load']` using Node `assert.deepEqual`; all matched. `node --check docs/research/replay-layout-minima-probe.mjs` and `git diff --check` passed. The final rerun data is [minimum-screenshot.json](../../.tools/hardware-research/replay-minima/minimum-screenshot.json). Raw evidence is under the ignored `.tools` directory; the concise aggregate above, reproducible probe, and TSX harness are kept in `docs/research`.

Screenshots are in `.tools/hardware-research/replay-minima/`, named by fixture and viewport, with `-full`, `-pitch`, or `-menu` suffix. Visual review covered normal/long-crowded phone full pages, tablet full page, phone menu, tiny-height modal clipping, and boundary screenshots. Representative evidence: [crowded phone](../../.tools/hardware-research/replay-minima/long-crowded-734x343-full.png), [phone menu with intended internal scrolling](../../.tools/hardware-research/replay-minima/normal-734x343-menu.png), [clipped 40-pixel-high menu](../../.tools/hardware-research/replay-minima/normal-1280x40-menu.png).

## Limits

No real-server replay loading, physical phone/tablet, touch input, mobile browser chrome/keyboard, iOS Safari, Firefox, Edge, browser zoom, higher DPR, localization, alternate accessibility font settings, pending/disconnected states, animation/dice transitions, alternate cameras/zoom levels, expanded/condensed dugouts, hover cards, native select popup geometry, or all possible transcript/chat content was measured. The long-name fixture uses whitespace; arbitrary unbroken labels are not covered. History tabs/menu tabs were exercised, but every setting and history filter was not. These remain explicit gaps, not inferred passes. The result supplies bounded implementation evidence for future responsive layout work and must not be converted into an arbitrary display gate.
