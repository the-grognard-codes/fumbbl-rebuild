# Code changes for the approved hardware experience policy

Date: 2026-10-31. Parent: [#388](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/388). [Policy](supported-hardware-policy-proposal.md). [Specification](supported-hardware-and-system-requirements.md).

## Outcome and scope

Owner follow-up: concrete [working dimensions](supported-hardware-display-dimensions.md) are now defined and checked. The resource, scoreboard/expanded-stack and replay-dugout corrections are deferred in [#389](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/389). Do not treat those fixes as a blocker to publishing clearly qualified dimension guidance. No product implementation is authorized by this backlog record.

The approved direction is desktop-first coaching, landscape tablet coaching, and phone website/replay/spectating support. Phone coaching is best effort. Resolution/scaling figures are recommendations; only measured absolute layout-fit minima may be technical display limits. Rounded layout-fit references now have bounded evidence in the dimension decision; a universal all-state minimum is not claimed, and fit does not imply comfortable play.

No renderer, game-server, protocol or state-model change is needed simply to adopt this policy. The minimum implementation is public guidance plus relevant validation coverage. Runtime fixes should follow demonstrated gaps. This register prepares the individual implementation decisions; it does not authorize them or record tests as passed.

## Change register

| Case | Classification | Files / existing evidence | Concrete work and acceptance |
| --- | --- | --- | --- |
| R1. Public guidance | Required to deliver the policy publicly | `site/src/support/index.html` currently contains only contact guidance; reuse `site/src/assets/site.css` if additional layout is needed | Add desktop/tablet/phone roles, recommended reference sizes, CSS versus physical pixels, scaling/zoom examples, optional fullscreen, review date and honest testing status. Keep contact information. Do not publish pending OS/browser/RAM proposals or invent a minimum. Verify readable narrow-page reflow and existing themes. Add an Unreleased changelog entry when implemented. |
| R2. Absolute fit measurement | Required before stating numeric technical minima; does not block publishing recommendations | `coach-match.css`, `SetupPanel.tsx`, `HostedResult.tsx`; existing HUD/tracker/confirmation/chat tests and research harness | Measure coaching, spectator and replay layouts separately across relevant panel/decision states. Test all themes, crowded scenes, long labels, both coaches/views, touch and temporary obstructions. Record width/height pairs and state-dependent limitations; test just above/below each proposed boundary. Distinguish intended overlays from unintended collisions. Do not equate bounding-box success with readability or usable coaching. |
| R3. Experience-specific regression coverage | Required to substantiate supported experiences | `browser-client/test/coach-hud-ui.mjs`, `confirmation-position-ui.mjs`, `drive-phase-tracker-ui.mjs`, `site/test/spectate-browser.test.mjs`, `site/test/m5e-result-browser.test.mjs`, existing real-server/recovery tests | Keep desktop checks and add landscape-tablet coaching, scaled-laptop checks, phone live viewer and phone replay tasks. Listing-page reflow alone does not test viewing. Exercise touch selection/inspection, menu access, live updates, reconnect, replay first/previous/next/last/seek/play/pause/speed and rotation. Verify spectators cannot issue coaching commands. Retain narrow zoom/recovery tests rather than deleting them to lower the burden. |
| R4. Responsive CSS and touch adjustments | Conditional: fix measured supported-experience failures | `coach-match.css`, `live-pitch.css`, `player-action-menu.css`, `HostedResult.tsx` and the existing styles owning replay controls | Preserve existing narrow and short-height rules initially. The max-height 480px section explicitly handles desktop zoom; spectator and coach views share styling. Adjust only demonstrated tablet/phone-viewing collisions or unreachable controls. Add role-specific styling only if a reproduced difference needs it. Preserve MUTP typography, colors, themes, canonical square targeting and camera behavior. No wholesale HUD scaling or redesign is required by policy. |
| R5. Fullscreen availability | Concrete robustness fix candidate, independently reviewable | `play-entry.tsx` lines around `toggleFullscreen`: direct `requestFullscreen()` invocation followed by promise `.catch()`; replay receives this callback too | Check capability/method availability and catch synchronous failures as well as rejected promises; give useful feedback or disable the unavailable menu action. Preserve normal windowed play/viewing. Test supported entry/exit, absent method and rejected request without losing state. Current code inspection establishes the missing guard, not a reproduced device failure. |
| R6. In-app size diagnostics or warning | Optional; not necessary to enact policy | `play-entry.tsx`, shared hosted presentation, future measured fit values | A support-page current-viewport readout could help users understand scaling. A runtime warning is justified only by measured fit failure, not being below 1080p or using a phone. Agree placement/dismissal first; resize must preserve pending actions and reconnect. Browsers do not reliably expose OS scale and browser zoom as separate values, so show measured CSS dimensions rather than guessed settings. Avoid a new policy framework if static guidance suffices. |
| R7. Existing compatibility investigation | Conditional, separate from the policy revision | Research probe emitted WebKit ResizeObserver loop notifications in six of seven sizes; current source uses observers across the HUD/pitch | Reproduce against the production build and trace the observer before proposing a fix. Do not suppress errors or claim that the research proves a crash. Address supported-experience defects with a scoped regression. |
| R8. Environment and integrated acceptance | Required to substantiate release claims | Existing browser suite manifest, Android Studio/emulator, available Linux environment, real-server validation tools | Complete local browser checks, landscape Android tablet and phone-viewer checks, Linux coverage where available, all themes and lifecycle paths. Record Android ADB trust blocker and Apple hardware gaps honestly. Run required browser unit/build/integration and game-server validation after implementation; do not call engine emulation physical-device certification. |

`site/src/assets/site.css` is the existing public-site stylesheet; verify ownership before editing it. Static support copy may need no stylesheet changes at all.

## Existing behavior that can be reused

Measurement follow-up: [layout-fit findings](../research/layout-minima-2026.md) and [replay detail](../research/replay-layout-minima-2026.md) supply evidence for R2–R4. Concrete candidates now include resource wrapping/menu alignment, compact scoreboard/turn-strip placement, expanded stack clearance and replay compact-dugout button collisions. These failures are within approved tablet/phone-viewing use cases; raising the support floor to avoid them is not an approved resolution. The geometric edges are fixture-specific and do not establish usability or universal minima. Product fixes remain subject to case-by-case review.

- `SetupPanel.tsx` exports `GameView` and already shares the board between coaches and spectators. Actions are filtered by `callerRole`; the hosted command region remains present for viewer status. Read-only viewing is not identical to removing every control.
- `play-entry.tsx` selects watch mode from the existing match route and passes the current connection state into that same `GameView`. No new mobile route or device identity check is needed.
- `HostedResult.tsx` already renders a read-only `LivePitch` and separate replay navigation, seeking, playback speed and animation controls. The replay acceptance surface must include those controls, not just the pitch.
- `coach-match.css` already has narrow-width and short-height rules, internal panel scrolling and full-window sizing. `LivePitch` already handles resize and Pointer Events; action-menu styles already contain coarse-pointer sizing. Verify their adequacy before adding alternative implementations.
- Existing tiny cases include a documented Debug collision at 375×300 and tracker/dugout crowding at 640×330. These do not establish a global minimum or automatically justify removing rules. Reassess the relevant viewer states, zoom and recovery; record explicit outcomes for each exception.

## Resolution/scaling guidance for R1

Use a short table of examples rather than an eligibility matrix:

| Physical desktop panel | OS scale | Browser zoom | Expected fullscreen CSS space |
| --- | --- | --- | --- |
| 1920×1080 | 100% | 100% | 1920×1080 |
| 1920×1080 | 125% | 100% | 1536×864 |
| 1920×1080 | 150% | 100% | 1280×720 |
| 2560×1600 | 200% | 100% | 1280×800 |

These are ordinary desktop scaling examples, subject to platform rounding. Normal browser windows have less content space. The owner's earlier Chrome measurement at 80% zoom was 1600×1000 fullscreen and 1600×831 maximized; corresponding 100% examples were calculated as 1280×800 and approximately 1280×665. The later user-supplied screenshot was a 2560×1600 capture at reported 100% OS/browser scaling. It illustrates small controls relative to pitch area, not a measured physical readability threshold. Do not publish the private screenshot path or account/game identifiers as support evidence.

Recommend 100% browser zoom as a starting point while preserving comfortable OS scaling and allowing text enlargement. A 1080p monitor is a design reference, not a purchase requirement. Do not advise everyone to disable scaling on a high-density laptop. Tablet and phone device-pixel ratios are not equivalent to Windows scale settings.

## Work that is not required

- No device/OS sniffing, phone coaching lockout, forced landscape, forced fullscreen, CSS `min-width` lock or hard 1080p requirement.
- No arbitrary 720×340, 800×360 or 1024×600 eligibility constant. These earlier proposals are superseded.
- No blanket deletion of small-screen CSS or conversion of phone-viewing regressions into unsupported cases.
- No new mobile client, renderer, server API, game rule, database migration, telemetry or analytics collection.
- No Vite/browser-target change solely because the display policy changed. OS/browser maintenance windows remain separate decisions.
- No physical Apple hardware purchase; retain intended compatibility and disclose the verification limit.

## Verification for this documentation update

Source review covered the public support template, hosted match entry, shared GameView role handling, hosted replay controls, short/narrow layout rules, existing HUD exceptions and relevant browser test configuration. Policy/spec consistency, local Markdown links, whitespace and preservation of unrelated working-tree changes are checked at handoff.

No product source, CSS, test implementation or public support content changed in this update. No browser, unit, Maven/game-server build, live-play, replay or recovery test was run for this documentation-only revision. The earlier research results retain their original scope; they are not new acceptance evidence for phone viewing or tablet coaching. The cases above require those checks when implemented.
