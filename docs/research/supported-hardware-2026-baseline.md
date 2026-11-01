# Supported hardware: repository and local baseline

Research date: **2026-10-31**. Parent: [#388](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/388), [specification](../specs/supported-hardware-and-system-requirements.md). Companion: [regional market evidence](supported-hardware-2026-market-evidence.md).

Inspected checkout: `01a21242d381198a83a8b5621bb991b6b52f516c`. This is Stage A research and baseline evidence. No support threshold, browser exclusion or product change is approved by these findings. Application code and the public support page are unchanged.

## What the evidence establishes

Policy updates after this baseline: the owner replaced the approximate 99% aspiration with broad practical coverage, then approved desktop-first coaching, landscape tablet coaching and phone website/replay/spectating support. Direct phone coaching is best effort. Display sizes are recommendations; absolute layout-fit minima await measurement and do not establish usability. See the [current policy](../specs/supported-hardware-policy-proposal.md) and [code change assessment](../specs/supported-hardware-code-change-assessment.md). The observations and historical next-step suggestions below are retained as research evidence, not current support cutoffs or completed validation of the new experience matrix.

1. Screen resolution is not a sufficient minimum requirement. Browser toolbars, zoom, orientation, safe areas and the virtual keyboard affect usable space.
2. Small-viewport safeguards also serve desktop zoom. Do not remove them merely because an old phone is outside a future support range.
3. The product already relies on modern layout and input capabilities; its build target alone is not a browser support policy.
4. Six existing focused suites passed. A separate existing-GameView probe passed cleanly in Chromium and Firefox at seven sizes; WebKit completed the action but emitted ResizeObserver errors at six of those sizes.
5. Windows cross-browser checks are feasible locally. Ubuntu is present but lacks discoverable Linux Node/browser executables. Android emulator acceleration and images are available, but the attempted research instance could not be accessed through ADB because it was unauthorized.
6. Neither these checks nor general-market shares substantiate 99% of MUTP players, physical-device performance, complete-match usability, or actual Apple-device validation.

## Representative hardware specimens

These are deliberately varied **test specimens**, not a ranked list of popular devices or a market-share estimate. Manufacturer specifications establish panel/capability examples, not success running MUTP. Regional SKU memory can vary. Apple RAM values are omitted where the cited specification does not publish them.

| Specimen / role | Manufacturer panel information | Other verified capability information | Primary source |
| --- | --- | --- | --- |
| iPhone SE, third generation: compact older phone | 1334×750 physical pixels | Compact-display boundary specimen; not the similarly named older Playwright SE profile | [Apple specification](https://support.apple.com/en-in/111866) |
| iPhone 13: older flagship-sized phone | 2532×1170 physical pixels | High-density screen with a substantially smaller CSS viewport | [Apple specification](https://support.apple.com/en-us/111872) |
| iPhone 16: newer flagship-sized phone | 2556×1179 physical pixels, 6.1-inch class | A18 chip; introduced 2024 | [Apple specification](https://support.apple.com/en-gw/121029) |
| Pixel 6a: 2022 midrange example | 1080×2400 OLED, up to 60 Hz | 6 GB RAM, Google Tensor | [Google specifications, Pixel 6a section](https://support.google.com/pixelphone/answer/7158570?hl=en) |
| Pixel 8a: 2024 midrange example | 1080×2400 OLED, up to 120 Hz | 8 GB RAM, Tensor G3 | [Google specifications, Pixel 8a section](https://support.google.com/pixelphone/answer/7158570?hl=en) |
| Galaxy A15 5G: budget-phone example, US sheet | 6.5-inch FHD+ AMOLED | 4 GB RAM/128 GB storage; octa-core CPU | [Samsung specification, p. 2](https://image-us.samsung.com/SamsungUS/samsungbusiness/mobile/phones/galaxy-a/HHP449741_A15_5G_Spec_Sheet.pdf) |
| iPad, ninth generation: older full-size tablet | 2160×1620 physical pixels | Useful older tablet geometry specimen | [Apple specification](https://support.apple.com/en-us/111898) |
| iPad, tenth generation: 2022 tablet | 2360×1640 physical pixels, 10.9-inch class | A14 Bionic | [Apple specification](https://support.apple.com/en-us/111840) |
| Galaxy Tab A9+: budget tablet | 1920×1200, 11-inch class, 90 Hz | 4 GB/64 GB and 8 GB/128 GB options | [Samsung specification](https://image-us.samsung.com/SamsungUS/samsungbusiness/pdf/spec-sheets/NCM449612_Tab_A9_B2B_Spec_Sheet_r2Lc.pdf) |

Apple specification pages intermittently returned HTTP 429 on full-page fetch. The listed numeric facts were available through the search index of Apple's own pages; the iPhone 16 and iPad tenth-generation excerpts included the full relevant sections. Those access limits are not substituted with third-party model data.

Desktop/laptop research supplies reported screen classes such as 1280×720, 1366×768, 1536×864 and 1920×1080, not a representative CPU/GPU/RAM distribution for MUTP. A small older integrated-graphics laptop remains a useful future benchmark category; no specific CPU model or RAM minimum is justified yet. Emulated RAM settings and host timing cannot supply that missing evidence.

## Physical pixels, CSS screens and usable content

The installed Playwright **1.62.1** device descriptors provide reproducible test parameters. They are tooling presets, not measurements of the owner's devices or current installed-base statistics. The archived [evidence JSON](supported-hardware-2026-baseline-evidence.json) includes the sampled descriptors.

| Playwright descriptor | CSS screen, if provided | Content viewport preset | DPR |
| --- | --- | --- | ---: |
| iPhone 13 portrait | 390×844 | 390×664 | 3 |
| iPhone 13 landscape | Descriptor retains 390×844 screen metadata | 750×342 | 3 |
| iPhone 15 portrait | 393×852 | 393×659 | 3 |
| Pixel 7 portrait | 412×915 | 412×839 | 2.625 |
| Pixel 7 landscape | 915×412 | 863×360 | 2.625 |
| iPad (gen 7) portrait | Not separately provided | 810×1080 | 2 |
| iPad (gen 7) landscape | Not separately provided | 1080×810 | 2 |

The descriptor named simply “iPhone SE” is 320×568, so it must not be mislabeled as the third-generation SE specimen. Inspect presets rather than trusting short device names. The iPhone 13 landscape preset also demonstrates why the screen metadata cannot simply be rotated and treated as usable content. [Playwright emulation documentation](https://playwright.dev/docs/emulation)

A proposed 480-CSS-pixel minimum match height, for example, would exclude both cited landscape phone presets. This is a consequence of the example threshold, **not a recommended threshold or proof about every physical device**. Research supports measuring the actual landscape viewport before deciding which short-height accommodations to retire.

Dynamic viewport units account for changing browser toolbars, but virtual-keyboard obstruction needs separate attention. Chrome's documented Android behavior from version 108 resizes the visual viewport rather than the layout viewport by default when the keyboard appears. Recent Android Chrome can also extend content into the gesture-navigation area. [Dynamic viewport units](https://web.dev/blog/viewport-units), [Chrome keyboard behavior](https://developer.chrome.com/blog/viewport-resize-behavior/), [Chrome edge-to-edge behavior](https://developer.chrome.com/blog/edge-to-edge)

The existing short-height CSS explicitly describes desktop zoom leaving 330 CSS pixels of height. A smaller support floor cannot justify removing text enlargement functionality. W3C's resize-text guidance covers enlargement up to 200%; its target-size guidance uses 24 CSS pixels with specified spacing and other exceptions. These are useful design checks, not a claim that this research performed a full accessibility audit. [W3C resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

## Repository compatibility inventory

| Area | Observed baseline | Consequence for later review |
| --- | --- | --- |
| Hosted sizing | Full-window product layout uses `100dvh`, clears inherited minimum height, and clips overflow | Assess essential controls in the available viewport; panel resolution alone is insufficient |
| Match breakpoints | Width rules at 900/600 CSS pixels, short-height rules at 480, and their combination | Classify each rule by function and zoom/keyboard use before considering removal |
| Tiny-size exceptions | 375×300 Debug collision and 640×330 expanded tracker/dugout crowding are explicitly deferred | Select policy first, then fix supported failures or define below-minimum behavior |
| Input | Pointer Events/capture, keyboard handling and coarse-pointer action-menu rules already exist; coarse targets include 44px sizing | Verify touch and hybrid input; do not replace the architecture merely to modernize it |
| Viewport changes | ResizeObserver is used throughout pitch, menus, scoreboard, history and tracker | Existing resizing support does not by itself establish orientation/keyboard correctness |
| Mobile chrome | Scoped search of browser source and hosted play assets found no explicit VisualViewport/safe-area/orientation handling | Investigation candidate; absence alone is not proof of a user-visible defect |
| Fullscreen | Product toggle calls `requestFullscreen` and handles rejected promises; no capability guard surrounds that call | Verify missing-API and rejected-call paths on proposed browser targets; do not require fullscreen for ordinary phone play |
| Recovery | Existing connection status and reconnect controls; no shared minimum-size warning found | New guidance must preserve those controls and pending action identity |
| Support documentation | Existing support page is contact information, without the proposed requirements matrix | Add approved policy and evidence labels later; do not publish draft numeric requirements now |
| Themes | This probe uses the existing default appearance | Other themes remain unverified in this phase |

Code evidence: [hosted match CSS](../../browser-client/src/coach-match.css), [shared pitch CSS](../../browser-client/src/live-pitch.css), [action-menu CSS](../../browser-client/src/player-action-menu.css), [live pitch](../../browser-client/src/LivePitch.tsx), [product entry](../../browser-client/src/play-entry.tsx), [support page](../../site/src/support/index.html), [previous sizing outcome](../specs/chat-log-window-sizing-outcome.md).

### Build targets are not the support matrix

Resolving the installed Vite **8.2.2** production-play configuration produced these JS and CSS targets:

- Chrome 111
- Edge 111
- Firefox 114
- Safari 16.4
- iOS 16.4

The project does not explicitly set its own target; these are toolchain defaults. The match stylesheet uses `:has()`, whose MDN compatibility data lists Chrome 105, Firefox 121 and Safari 15.4. Thus a “Firefox 114 supported” claim cannot be inferred from the build configuration. Transpilation also does not automatically supply browser API polyfills. These are dependency facts, not approved minimum browser versions. [Vite build documentation](https://vite.dev/guide/build), [MDN compatibility source for :has()](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/selectors/has.json), [product build config](../../browser-client/vite.play.config.ts)

## Baseline checks actually performed

Environment: Windows, Node **26.8.1**, npm **11.19.0**, installed Google Chrome **156.0.8078.76**, installed Edge **156.0.4314.50**, Playwright **1.62.1**. Edge was inventoried, not exercised. PowerShell blocks the `npm.ps1` wrapper locally; `npm.cmd` works without changing execution policy.

The following existing scripts ran with an isolated Vite cache and all exited zero:

| Command from repository root | Result and bounded evidence |
| --- | --- |
| `node browser-client/test/confirmation-position-ui.mjs` | Pass: confirmation placement and state changes for both coaches across five existing viewports |
| `node browser-client/test/coach-hud-ui.mjs` | Pass: existing HUD, chat, resource, inspector and responsive checks, retaining documented tiny-size exceptions |
| `node browser-client/test/drive-phase-tracker-ui.mjs` | Pass: both sides, four layouts, events, viewer roles, refresh and handoff |
| `node browser-client/test/reconnect-ui.mjs` | Pass: play/builder stale-authentication clearing and reconnect fixture behavior |
| `node browser-client/test/pending-recovery-ui.mjs` | Pass: ordinary actions and exact retained retry after uncertain outcome |
| `node browser-client/test/chat-ui.mjs` | Pass: chat/log states, persisted sizing and existing mouse/touch/keyboard entry checks |

Logs are in `.tools/hardware-research/`, named after the script (confirmation log: `confirmation-position.log`). These are existing browser fixture checks, **not fresh real-server lifecycle acceptance or physical-device validation**.

### Cross-browser probe

The [reproducible probe](supported-hardware-2026-probe.mjs) reuses the existing GameView harness and a fixed synthetic state. It loads the HUD, stages and confirms End Turn while an unactivated player remains, checks the exact emitted action, checks confirmation bounds, records capabilities and page errors, and captures selected screenshots. It does not simulate a complete match, crowd the pitch with 22 players, exercise touch profiles, or check all themes.

Commands:

```powershell
node browser-client/node_modules/playwright/cli.js install firefox webkit
node docs/research/supported-hardware-2026-probe.mjs
```

Create `.tools/hardware-research` first on a fresh checkout. The equivalent probe was executed from that directory during investigation; the archived script uses the same repository imports and output location. Reproduction requires installed browser-client dependencies and browser binaries.

| Engine | Version | Clean cases / attempted | Finding |
| --- | --- | ---: | --- |
| Bundled Chromium | 151.0.7922.34 | 7 / 7 | Single-action intent, bounds and no page errors passed |
| Patched Firefox | 153.0 | 7 / 7 | Same checks passed when run outside the sandbox |
| Playwright WebKit | 26.5 | 1 / 7 | All seven emitted the expected action; six emitted `ResizeObserver loop completed with undelivered notifications.` and failed the no-page-errors assertion |

Dimensions were 1280×720, 1024×768, 844×390, 667×375, 360×800, 640×330 and 375×300 CSS pixels. WebKit's only clean case in this run was 640×330. These are viewport-only desktop-engine contexts; an 844×390 case is **not** an actual iPhone measurement or full mobile simulation.

The [archived JSON](supported-hardware-2026-baseline-evidence.json) preserves per-case results, errors, capabilities and tool descriptors. Screenshots under `.tools/hardware-research` include desktop and 844×390 images. Chromium 844×390 and WebKit 1280×720 were visually inspected: the sparse fixture renders and the confirmation control is visible, but this does not prove a crowded match is comfortable or establish a supported minimum.

A preliminary probe incorrectly omitted the selectable-player action, causing the existing End Turn shortcut to submit immediately; its expectation of a second confirmation was a **probe-fixture mistake**, corrected before the recorded run. Firefox's preliminary sandbox page-creation failure disappeared outside the sandbox. Neither is recorded as an application defect.

WebKit's remaining observation is an actionable compatibility investigation candidate. The exact responsible observer and production-build impact are not established; the probe uses the Vite development harness. No runtime error suppression or product fix was applied, and a resize-loop notification is not being described as proof of a browser crash. Production reproduction and observer tracing should precede any proposed fix.

### Android and Linux readiness

| Check | Observed result | Meaning |
| --- | --- | --- |
| `emulator -accel-check` | WHPX installed and usable | Host supports accelerated emulator work |
| SDK image inventory | Android API 36 and 36.1 Google Play x86_64 images installed | Suitable starting images; not older-OS validation |
| AVD inventory outside sandbox | Pixel_9 and Pixel_10 available | No new AVD was created |
| Pixel_9 configuration | 1080×2424 panel, density 420, assigned RAM 2048 MB, API 36 image | Emulator configuration, not a physical phone's RAM/performance |
| Research launch | Pixel_9, port 5580, read-only, no snapshots, headless/no audio | Temporary instance started without saving device-state changes |
| ADB queries | `device unauthorized`; could not read Android/Chrome version or boot-completion state | Android application compatibility remains unverified |
| Cleanup | `adb -s emulator-5580 emu kill` succeeded; subsequent device list empty | Research emulator stopped; existing saved device retained |
| WSL inventory | Ubuntu-26.04 and Docker Desktop distributions present | Linux test environment exists |
| Ubuntu probe | Linux kernel responded; `command -v node/chromium/firefox` returned no executable paths | Linux browser/tool setup required before actual Linux testing |

The sandbox hid the AVD list and denied WSL enumeration; outside-sandbox checks resolved those inventory limitations. The ADB trust problem remained. No device trust settings, host security settings, account credentials, production origin rules or authentication logic were changed. Android logs are retained in `.tools/hardware-research/android-boot.stdout.log` and `android-boot.stderr.log`.

Apple hardware remains unavailable by design. Playwright WebKit is a patched engine, not the branded Safari product; Windows runs cannot establish iOS/iPadOS/macOS behavior. [Playwright browser documentation](https://playwright.dev/docs/browsers)

No Maven/server build, complete browser gate, production build, physical-device benchmark, fresh authenticated real-server play, completed-match replay, actual restart-recovery acceptance, or full accessibility/theme audit ran. This is research with no product changes; those checks remain requirements for approved implementation and integrated acceptance.

## Decisions prepared for the next checkpoint

| Decision | Evidence-backed recommendation for discussion | Still unresolved |
| --- | --- | --- |
| Scope breadth | Explicitly consider ChromeOS, Samsung Internet and the browser tail alongside named platforms | Whether to add targets and how they are validated |
| Display policy | Separate website access from match play; evaluate real landscape content around 342–390px high before picking a floor | Numeric minimums and recommended sizes |
| Small-screen CSS | Preserve desktop zoom/temporary-obstruction safeguards; evaluate each rule independently | Which rules can actually be retired |
| Browser floors | Evaluate capability needs plus version usage; do not publish the Vite target list as support policy | Exact OS/browser floors and retirement cadence |
| WebKit findings | Trace and reproduce resize notifications in product builds before estimating a fix | Cause, scope, visible impact and approved remediation |
| Android setup | Restore normal ADB authorization in an isolated test setup, then validate Android browser behavior | Authorization/setup resolution; older Android and tablet profiles |
| Hardware performance | Benchmark approved lower-end reference systems and crowded match tasks | Numeric CPU/RAM/performance requirements |
| Coverage claim | Pursue broad practical coverage with explicit exclusions; publish only claims the evidence supports | No numerical coverage gate; remaining population unknowns are context |

## Support-page material prepared, not published

The later support-page change should contain: separate website/match requirements; a clear physical-resolution versus usable-space explanation; landscape phone guidance; minimum and recommended values once approved; browser/OS policy including decisions on ChromeOS and Samsung Internet; below-minimum continuation and recovery behavior; real-device versus engine/emulator evidence labels; known limitations; sources and review date.

It must not say that 99% coverage is measured, that Apple devices were physically tested, that emulator RAM is a minimum requirement, or that the single-action probe establishes complete-match support. Product wording should describe approved player-facing behavior, with engineering details linked separately.

Stage A research and bounded baseline investigation are delivered with the above limitations. Stage B policy approval and Stage C case-by-case change approval remain outstanding. No product implementation, support-page publication, commit or deployment was performed.
