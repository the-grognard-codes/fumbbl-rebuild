# Shared header logo

Scope: [#226](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/226). Branch `fix/shared-header-logo`, base `16dd9b9683fc9e53c36e0900dbf7aeb986858737`.

## Intended outcome

The primary top bar uses the existing full v4 mole-and-wordmark SVG referenced by the older Play header, displayed at 196 × 56 pixels with its proportions intact. Play, match/result and every other site page use this one shared header with the same navigation and account menu. Remove the Spectate-only logo width and bump shared stylesheet URLs to refresh cached styling.

Refresh the complete local Hosting page/header assets together while preserving Firebase configuration and all thirteen pre-existing generated-file baselines. No new artwork or raster editing is needed.

## Verification

The existing cross-page account/header regression was extended to compare the loaded image, rendered image dimensions and full header heights at desktop/mobile sizes, preserving account highlight, Sign out, active-page and short-screen checks. It failed before implementation because the shared header had no logo image.

- Build/TypeScript, static input checks and all ten site unit checks passed.
- Eleven focused hosted browser journeys passed, including the header/account regression across eleven routes at 1224 and 360 pixels, short-screen account/Sign out checks, Play launch/reconnect, real-engine Blitz, kickoff prompts, Spectate and result/replay. Logo load, dimensions, header height and overflow now form part of the shared-header assertions.
- Synthetic [Home](../../.notes/overhaul-analysis/verification/shared-header-logo/header-home-1224.png), [Play](../../.notes/overhaul-analysis/verification/shared-header-logo/header-play-1224.png) and [mobile Play](../../.notes/overhaul-analysis/verification/shared-header-logo/header-play-360.png) captures were inspected. Home and Play use the same compact logo and navigation.
- All nine local page files and shared assets were refreshed together. Firebase configuration and all thirteen generated-file baselines were preserved byte for byte.
- Read-only HTTP checks confirm that localhost Home and Play serve the same logo markup. The shared stylesheet version is `20261008-6` after the short-screen correction.

### CI correction

The first Static delivery run exposed account menu overflow at 360 × 330 pixels after fonts loaded. The previous fixed height allowance placed the bottom at 353.16 pixels. A minimized single-page fixture and the existing browser journey reproduced it locally.

The menu now calculates its height from its actual top position, leaving one rem below it. Opening the menu, resizing the window or changing the header/navigation/account control size updates that position. The regression waits for settled fonts and continues to verify that Sign out remains reachable without scrolling the page.

Standards review also found that scrolling an open menu could leave the stored top position stale. A new regression reproduced a bottom position of 378 pixels. A passive scroll listener updates the position, and the journey now checks page scrolling and desktop/mobile resizing while the menu remains open. The static/browser CI checks must pass on the corrected commit.

## Standards

APPROVE. The reported short-screen scroll issue is resolved: the menu recalculates its height when the page scrolls or the header layout changes, and the regression covers the failing sequence. No remaining actionable findings. The shared renderer, stylesheet version, change-list entry and issue mirror remain consistent.

## Spec

APPROVE. No actionable findings. The shared header uses the existing Play logo at the requested size across the site, with navigation and account behavior preserved. The open menu recalculates its height after page scrolling, layout changes and viewport resizing; the checks cover those cases. Desktop/mobile and short-screen captures were inspected.

Review summary: Standards 1 P2 finding, resolved, 0 remaining; Spec 0 findings. The worst Standards issue was stale menu sizing while scrolling; neither axis has a remaining blocking issue.

Merge gate: all CI checks must succeed on the reviewed commit before merge.
