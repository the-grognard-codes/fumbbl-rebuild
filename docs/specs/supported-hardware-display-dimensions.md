# Working display dimensions

Date: 2026-10-31. Parent: [#388](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/388). Deferred UI corrections: [#389](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/389).

## Decision and scope

The owner directed that specific dimensions be defined now and scoreboard/other UI corrections be backlogged for later. The following rounded dimensions are the concrete working proposal for support-page wording and future validation. They do not introduce an access restriction or claim exhaustive all-state/physical-device certification. The UI backlog is not a prerequisite for documenting these values.

| Experience | Current layout-fit reference minimum | Recommended usable viewport |
| --- | --- | --- |
| Live coaching or live spectating | **1350×300 CSS pixels** | **1920×900** for the primary desktop experience; **1366×768** as the smaller laptop/landscape-tablet reference |
| Replay, with normal page scrolling | **980×320 CSS pixels** | **1024×600** or larger |
| Website/account/team pages | Flexible-height, responsive pages; no new fixed-height minimum | Use comfortable text size and normal page scrolling; this investigation does not establish an all-page width minimum |

The live reference rounds upward from the measured 1347px resource-rich width edge and the tested 280px-height matrix. Replay rounds upward from the measured 967px page-width edge and retains the useful 320px test height instead of publishing the artificial 44px scrollable-modal extreme. **These are conservative, tested pairs rather than mathematically exact minima.** Both width and height describe available content space, not a pixel-area calculation. Passing at one pair is not proof of every larger pair because responsive breakpoints can change the layout.

“Layout-fit reference minimum” means the tested interface elements fit without unintended collisions under the documented fixture/scrolling contract. It does not mean readable, comfortably clickable or suitable for coaching. In particular, a 300px-high live match is not recommended for play. A full 1920×1080 CSS fullscreen viewport remains the desktop design reference; 1920×900 allows room for browser/OS controls on a typical 1080p desktop configuration. That subtraction is illustrative, not a guaranteed browser-toolbar height.

These values do not replace the approved experience roles: desktop-first coaching, landscape tablet coaching, and phone website/replay/spectating support. Direct phone coaching remains best effort. A smaller phone/tablet viewport may work, but the current UI has known collisions, especially with rich resource sets and expanded panels. State those limits rather than pretending every phone achieves an overlap-free whole-view layout. Do not advise users to zoom out until text is unreadable, force fullscreen, detect device names to deny access, or require users to disable OS scaling.

## Evidence for the selected pairs

Fresh measurements use the unchanged product components through the existing research probes, headless installed Chrome **156.0.8078.76**, Playwright **1.62.1**, Windows, DPR 1, current MUTP appearance. The [dimension evidence](../research/documented-display-dimensions-evidence.json) preserves results and reproduction parameters; the [larger investigation](../research/layout-minima-2026.md) supplies the method and limitations.

| Pair | New verification |
| --- | --- |
| 1350×300 live | **729/729** geometry cases: three caller roles × three phase/tracker states × 81 independent dugout/history panel combinations; six selected interaction checks pass |
| 1366×768 live | **27/27** geometry cases; six selected interaction checks pass |
| 1920×900 live | **27/27** geometry cases; six selected interaction checks pass |
| 980×320 replay | Normal and long-name/crowded fixtures pass geometry, actual navigation/playback/menu actions and expected callback sequences, with scrolling |
| 1024×600 replay | Both replay fixtures pass the same checks, with scrolling |

The six live interaction checks per pair cover home/spectator menu navigation and focused player inspection/overhead camera, plus home End Turn confirmation and coin choice. They do not constitute a full match, true touch/gesture testing or recovery validation. All three live runs and the replay run recorded no page errors. Selected Firefox/WebKit checks from the earlier investigation support nearby geometry boundaries, but these exact rounded pairs were newly checked only in Chrome. The earlier Firefox Vite-forwarded ResizeObserver warning remains a separate recorded observation.

No minimum here claims every possible decision, theme, font setting, localization, panel content or native mobile browser state has been measured. Physical readability and comfort remain visual-review questions. These limitations bound the support claim; they do not prevent choosing useful working dimensions.

## Deferred corrections

[Issue #389](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/389) contains three later slices:

1. Resource wrapping and camera/menu placement.
2. Compact scoreboard and expanded-panel clearance.
3. Replay dugout-button layout.

Do not implement these during the current policy task. When scheduled, preserve the recommended references, improve smaller viewing layouts, re-measure the fit boundaries and update the public guidance if justified. No renderer, server or gameplay changes are needed to record dimensions now.

## Support-page wording prepared for implementation

> We design live play first for desktop/laptop browsers and landscape tablets. For comfortable viewing, aim for 1920×900 CSS pixels on a desktop, or 1366×768 on a smaller laptop or landscape tablet. Replay is designed to scroll normally; we recommend 1024×600 or more.
>
> Our current tested layout-fit reference is 1350×300 for the live interface and 980×320 for replay with scrolling. These small sizes describe interface fit in our test cases, not a comfortable playing experience or a hard access limit. Smaller windows can still work, with known resource, scoreboard and panel overlaps pending improvements.
>
> Phones are recommended for the website, replay and spectating rather than coaching. Use landscape for pitch viewing where helpful. Start at 100% browser zoom and keep OS display scaling comfortable. Browser controls, display scaling, browser zoom and the on-screen keyboard change the CSS space available; physical screen resolution alone does not determine it. Fullscreen is optional.

This is draft support copy, not a claim that the public page has been edited or deployed. Browser/OS maintenance windows and hardware budgets remain separate policy decisions.
