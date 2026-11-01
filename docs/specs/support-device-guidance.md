# Feature: Support page device, input and scaling guidance

Tracking: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/390

## Abstract
Publish the approved desktop-first policy and an interactive display-scaling calculator on `/support`. Part of #388; compact match-layout improvements remain deferred in #389.

## Objective
Help players understand suitable devices, controls and available browser space without turning recommendations into access gates.

## Context / Existing Behavior
The support page currently contains contact details only. Layout investigation established conservative tested fit references, which do not establish comfortable play or universal minimum dimensions.

## In Scope
- Desktop-first coaching, landscape tablet support, phone website/replay/spectating guidance.
- Mouse and keyboard, touch, CSS viewport recommendations and scaling explanation.
- OS/display-scale calculator with 100/125/150/175/200% steps, assuming 100% browser zoom.
- Manufacturer-sourced device examples and explicitly estimated future animation hardware.

## Out of Scope
- Match HUD, scoreboard, dugout, graphics or gameplay changes.
- Hardware detection, automatic scaling, access gates or new OS/browser version exclusions.
- Claims of physical Apple validation or future animation benchmarks.

## Functional Requirements
- Recommend 1920 × 900 CSS pixels for desktop, 1366 × 768 for smaller laptops/landscape tablets, and 1024 × 600 for replay.
- Describe 1350 × 300 live and 980 × 320 replay as measured fit references with scenario limitations; replay uses normal page scrolling.
- For each target and scale, show physical content-area dimensions using `ceil(CSS dimension × scale / 100)`. Explain browser chrome, zoom and unchanged CSS targets.
- Preserve readable 100% examples without JavaScript; enable a labelled native slider when scripting works.
- Explain mouse/keyboard as preferred coaching input and touch on landscape tablets. Phones prioritize website, replay and spectating; compact controls still have known limitations.
- Publish estimated desktop four-core/8 GB entry and 16 GB headroom; iPad 10/A16 entry and M1 Air/Pro headroom; flagship Tab S8 entry and S9 headroom, with 8 GB+ RAM. FE/A models require separate evaluation.
- Preserve support contact and privacy guidance.

## Acceptance Criteria
- All five calculator stops produce rounded-up dimensions and work with keyboard and touch input.
- Support content is usable at 320 CSS pixels without horizontal page overflow and with JavaScript disabled.
- Layout fit, viewing recommendations and future hardware estimates remain clearly distinct.
- Hardware model facts link to official manufacturer sources; physical device and performance gaps are explicit.

## Constraints
- Preserve MUTP styling and shared header, theme and account-menu scaffolding across Android, Windows and Linux.
- Implement on `feat/support-device-guidance` in an isolated worktree; preserve unrelated root changes.
- Do not commit, push or deploy.

## Implementation Guidance
Use static HTML, a scoped stylesheet and a small dependency-free progressive enhancement module. Register browser regression coverage with the existing hosted suite inventory. Record the public change in CHANGELOG.md, leaving updates.json for merged PRs.

## Validation
Run support calculator/browser regressions, site checks and unit tests, browser-client unit tests, hosted live/replay checks and recovery checks, and the pinned game-server build/tests. Inspect desktop and mobile screenshots. Browser emulation does not establish tablet GPU/thermal performance.

## Completion Notes
Implemented and locally validated. See [the outcome report](support-device-guidance-outcome.md) for exact commands, passing results, five opt-in database skips and hardware-validation gaps. Hardware evidence: `docs/research/animated-hardware-guidance-2026.md`. No commit, push or deployment was performed.
