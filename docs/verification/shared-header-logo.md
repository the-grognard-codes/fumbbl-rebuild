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
- Read-only HTTP checks confirm that localhost Home and Play serve the same logo markup and shared stylesheet version `20261008-5`.

## Standards

APPROVE. No actionable findings. The shared renderer uses the existing SVG, CSS preserves its proportions, and page sources and the Updates generator share the new stylesheet version. The change-list entry and issue mirror are present.

## Spec

APPROVE. No actionable findings. The shared header uses the existing Play logo at the requested size across the site, with navigation and account behavior preserved. Desktop and mobile captures were inspected.

Review summary: Standards 0 findings; Spec 0 findings. Neither axis identified a blocking issue.

Merge gate: all CI checks must succeed on the reviewed commit before merge.
