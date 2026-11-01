# Layout-fit measurements: live coaching, spectating and replay

Date: 2026-10-31. Parent: [#388](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/388). [Approved experience policy](../specs/supported-hardware-policy-proposal.md). Source revision: `01a21242d381198a83a8b5621bb991b6b52f516c`.

## Findings

**Subsequent owner direction:** define specific working dimensions now; backlog UI corrections for later. The [dimension decision](../specs/supported-hardware-display-dimensions.md) selects and verifies 1350×300 live and 980×320 replay layout-fit references, with separate larger recommendations. [Issue #389](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/389) is deferred and does not block documentation. The historical findings below remain bounded evidence, not a requirement to complete fixes before selecting a reference size.

**There is no defensible universal absolute minimum to publish yet.** Measurement now establishes concrete, state-dependent failure boundaries in the current implementation. Resource wrapping, compact scoreboard placement, expanded panel stacks and replay dugout buttons produce different constraints. Fixing those specific defects is preferable to converting their incidental pixel boundaries into device exclusions. The desktop-first, landscape-tablet and phone-viewing policy is unchanged.

All numbers are CSS viewport dimensions at DPR 1 in the named local browser, not physical panel resolutions or usability recommendations. Bounding-box comparisons use a 1 CSS pixel tolerance. Internal scrolling, intended pitch overlays and modal overlays are allowed; accidental intersections between independent controls/panels are failures. A passing fixture does not establish that every match phase or control fits.

| Experience / fixture | Measured result | Interpretation |
| --- | --- | --- |
| Live coaching and spectating, five resource types per team | 1347×720 passes the 27-case matrix; 1346×720 fails because wrapped cheerleader controls collide with the camera/menu area | Concrete width edge for this resource-rich fixture, not a device minimum |
| Live coaching and spectating, four resource types (no bribes) | 1097×600 passes 27/27; 1096×600 fails the same wrap/collision check; 1280×665 passes 27/27 | Resource contents materially change the fit boundary; “four resources” is a fixture, not a measured common-user distribution |
| Live rich fixture, full panel-state matrix | 1347×280 passes 729/729 combinations: three caller roles, three phase/tracker states and 81 independent panel-size combinations | Smallest pair exercised against that full panel matrix; no claim that a 280px-high match is playable |
| Live rich fixture, height refinement | At width 1347, 269px and 270px pass the 27-case matrix. In the narrower setup-only refinement, 265px fails and 266px passes with the 1px tolerance; 267px clears the measured banner/confirmation intersection | The refined height result covers only one setup/panel specimen. Do not combine independent edges into an untested universal minimum |
| Phone live viewing | 734×343 passes 7/27 cases with four resources, but expanded stacks fail; 863×360 has scoreboard/turn-strip collisions. Five-resource variants fail at both sizes | Phone viewing is an approved target with concrete compatibility work remaining |
| Replay, normal and long-name/crowded fixtures | 967×320 passes measured page geometry and actions with document scrolling; 966×320 has compact-dugout button collisions | Replay has its own boundary; this is not the minimum for its playback controls alone |
| Phone replay | 734×343 and 863×360 have reachable playback controls but six compact-dugout button intersections | Main playback controls work in these specimens; supporting UI needs correction |
| Tablet/desktop replay | 1024×768, 1280×720 and 1920×945 pass measured geometry/actions, using normal vertical scrolling | Document scrolling is part of the existing replay layout, not a collision failure |

The replay height sweep can pass at 44px with page/menu scrolling, while a 42px viewport clips the Game Menu. That deliberately extreme result demonstrates why mathematical fit cannot be advertised as usability. A 980×2200 replay viewport fits both tested pages without document scrolling; it is an example, not an optimized simultaneous-page minimum. See the [replay report](replay-layout-minima-2026.md) for complete methods, exact pairs and limits.

## Live specimen and measurement contract

The [live probe](live-layout-minima-probe.mjs) uses the existing [coach HUD harness](../../browser-client/test/coach-hud-harness.tsx) and actual `GameView`, scoreboard, pitch, history, dugout and menu components. A Vite research-only loader adds a React key to remount the component for each independent synthetic snapshot. Product files are untouched. It waits for presented/current revision agreement, inactive playback, loaded fonts and settled panel geometry. This avoids mistaking missing-transcript synchronization during rapid fixture changes for a steady-state layout.

The fixture contains 22 on-pitch players, five off-pitch categories per team, long team names, clocks, rerolls, apothecaries, assistant coaches, cheerleaders and optionally bribes. Both teams have 16 players. It covers home coach, away coach and spectator; ordinary play and setup with either receiving side, including the seven-step tracker. These are authoritative-shaped synthetic states, not an executed valid-match trajectory.

The ordinary matrix has compact dugouts/default history, expanded dugouts/default history, and expanded dugouts/maximized history. The 729-case run instead includes every condensed/compact/expanded home/away dugout combination and every minimized/default/maximized chat/log combination (3×3×3×3), for each of the nine role/phase combinations.

Geometry checks cover:

- Score center, both resource panels and their actual child controls, both clocks and End Turn, turn strips, weather, drive tracker, camera/menu trigger group, Debug, chat/log, dugouts, confirmation/preview, current command region and setup instruction.
- Viewport containment, unintended pairwise intersections, panel/header control containment and team-name clipping. Pitch sprites intentionally overlap in perspective; the pitch itself is deliberately behind the HUD.
- Parent/child boxes are excluded from pairwise collision checks. Resource buttons extending outside a panel are separately recorded as `control-outside-panel`; this alone is not proof of clipping, although the important 1346/1096 width failures also have actual camera/menu intersections.
- Player names/headings intentionally elided by the existing UI are not required to show their full text simultaneously. Long team names are checked against their enclosing nameplates. Readability of auto-shrunk type is not established.

In selected runs, actual Playwright pointer actions also exercised all six Game Menu tabs and close, overhead camera selection, focused player inspection, End Turn preview/confirmation and the resulting intent, and a coin-toss dialog's choices. These checks all passed at the recorded interaction pairs even where independent panel geometry failed. They prove neither unobscured complete controls nor comfortable touch targets. The coin dialog intentionally overlays the pitch; all match decision kinds were not swept.

The touch-capable Chrome run adds `hasTouch: true` at five reference viewports; it still uses Playwright clicks/focus and does not constitute physical touch, drag accuracy, mobile browser chrome or virtual-keyboard testing.

## Concrete code findings for case-by-case review

1. **Resource wrapping and menu alignment.** Resource panels have a constrained height/width; child counts can wrap outside them. `Resources` measures the panel border box for menu placement, so the wrapped controls can overlap the camera/menu group. Reproduced at 1346px with five resources and 1096px with four. Review [scoreboard measurement](../../browser-client/src/LiveMatchScoreboard.tsx), [resource/layout rules](../../browser-client/src/coach-match.css) and [history docking](../../browser-client/src/useMatchHistoryDock.ts). A scoped correction should preserve resource visibility and place following controls below actual occupied space.
2. **Compact scoreboard rows.** At 863×360 and 900×600, the score center intersects turn strips/weather in the long-name fixture. A failing 863px specimen has score bottom 79px and turn/weather top 68px. This is a compact-layout positioning problem, not evidence that the device is obsolete. Review the max-width 900px rules in [coach CSS](../../browser-client/src/coach-match.css).
3. **Expanded stacks on short/narrow screens.** Setup tracker, dugouts, confirmation and instruction can collide depending on side and selected panel states. At 734×343, expanding panels exposes failures not present in every default viewing state. Retain current scrolling/recovery accommodations; review [tracker CSS](../../browser-client/src/drive-phase-tracker.css), [coach CSS](../../browser-client/src/coach-match.css) and actual docked-panel bounds before selecting a fix.
4. **Replay compact-dugout summaries.** Knocked out/Casualties and other summary buttons intersect on phone layouts, while playback controls remain reachable. Review [replay composition](../../browser-client/src/HostedResult.tsx), [dugouts](../../browser-client/src/LiveDugouts.tsx) and [shared pitch/dugout grid styles](../../browser-client/src/live-pitch.css). This is a direct phone-viewing compatibility gap under the approved policy.

These are proposed fixes, not implemented changes. Do not install an arbitrary minimum-width rule, delete small-screen CSS or block phone viewers to make these checks pass. Re-measure after individually approved corrections; layout constraints may then be materially lower.

## Evidence, commands and limitations

The [compact evidence archive](layout-minima-2026-evidence.json) records run summaries, per-case failures and selected boundary boxes; full raw JSON/screenshots remain under `.tools/hardware-research/live-minima/` and `.tools/hardware-research/replay-minima/`. The probes and replay harness are kept in `docs/research` for reproduction. Representative visually reviewed live captures include `stable-grid-734x343.png`, `initial-1280x720.png` (exploratory), and `firefox-inspect-1920x945.png`. See the replay report for its visual checks.

Runtime: Windows, Node 26.8.1, Playwright 1.62.1, installed headless Chrome 156.0.8078.76; selected cross-engine runs use patched Firefox 153.0 and WebKit 26.5. The Firefox sandbox initially could not create a page; running the same local probe outside the sandbox resolved that environment failure. Neither engine run is actual Android, iPad or macOS testing.

The final Firefox and WebKit runs each exercised 108 geometry cases. Both agree with Chrome on the tested rich-resource boundary: 1347×280 and 1920×945 pass all 27 cases at each size; 1346×720 and 1024×768 fail all 27 at each size. This is cross-engine geometry evidence, not a clean complete application acceptance: the Firefox Vite-forwarded observer warning described below remains recorded. The live archive contains 1591 selected geometry cases and 96 additional interaction-check results; the replay archive retains 48 final refined/edge cases alongside its separate report and broader local raw sweeps.

Each recorded live command uses `node docs/research/live-layout-minima-probe.mjs` with the `LAYOUT_*` environment parameters enumerated in the evidence archive. For a fresh full-matrix reproduction in PowerShell:

```powershell
$env:LAYOUT_RUN='panel-matrix'
$env:LAYOUT_SIZES='[[1347,280]]'
$env:LAYOUT_PANEL_MATRIX='1'
node docs/research/live-layout-minima-probe.mjs
Remove-Item Env:LAYOUT_RUN, Env:LAYOUT_SIZES, Env:LAYOUT_PANEL_MATRIX
```

Use a fresh shell or clear other `LAYOUT_*` overrides before a run. `LAYOUT_RESOURCES=typical` selects the four-resource specimen; the internal name does not imply market research. `LAYOUT_INTERACTIONS=1` enables the additional action checks. The optional matrix selects independent panel combinations; otherwise the three symmetric panel states are used.

Early `initial` and `width-sweep` runs were exploratory and are not the final acceptance evidence: the original wrapper allowed synthetic transitions to display a transient Synchronizing message. The final remounting runs supersede those observations. A Firefox diagnostic initially flagged glyph ink extending beyond its own text line box, even though it remained inside the padded nameplate. Screenshot/parent-bound inspection established that as a probe false positive; the corrected comparison uses the enclosing nameplate. Vite forwarded a Firefox ResizeObserver-loop notification during investigation even though the page-error listener recorded none; no error was suppressed or product fix made.

Coverage remains bounded: one current MUTP appearance, fixed loaded fonts, synthetic content and selected decisions, no localization/unbroken maximum-length labels, no full valid-match trajectory, no authoritative server/restart/pending-action recovery, no real-device performance or comfort study, no physical phones/tablets, no OS-scale/high-DPR matrix, no virtual keyboard/safe-area simulation and no complete theme/accessibility audit. The research does not establish all-state minima. No product/unit/game-server build suite ran because no product code changed; this turn ran the research probes, selected interaction checks, syntax/link/whitespace checks and visual inspection.

Public guidance can state recommended desktop/tablet use and recommended phone viewing now, with testing limits. The subsequent dimension decision documents rounded, bounded layout-fit references now, at the owner's direction; deferred UI fixes are not a prerequisite. These references must not be presented as exhaustive all-state or usability minima.
