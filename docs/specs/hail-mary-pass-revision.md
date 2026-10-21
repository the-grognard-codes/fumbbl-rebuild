# Feature: BB2025 Hail Mary Pass revision

## Abstract

Expose Hail Mary Pass (HMP) as a browser action mode for passes and bombs and
correct its BB2025 resolution. This records the behavior approved in the design
interview and implementation handoff on 2026-10-21.

## Objective

An eligible player can choose normal or HMP throws, including targets beyond
Long Bomb range, with authoritative range validation and correct PA tests.

## Context / Existing Behavior

Native HMP actions exist, but browser declarations and ball targets do not expose
them. BB2025 has Long Bomb PA handling with incomplete reroll, accuracy
conversion, and reporting paths. Shared range validation bypasses HMP weather
limits. The browser already has movement-mode toggles and range overlays.

## In Scope

- Slice 1: BB2025 HMP rules, weather range validation, roll reports, and regression tests.
- Slice 2: browser declarations, mode switching, targets, icons, overlays, and end-to-end validation.
- Shared Java server corrections affect both clients; presentation changes target the browser.
- A user-facing change-list entry and implementation outcome report.

## Out of Scope

- Rules changes for BB2016 or BB2020; Java desktop presentation redesign.
- Unrelated gameplay and UI changes; migration of pre-update games (the user will remove them).
- Remote deployment; publishing and merging require separate user authorization.

## Functional Requirements

- Supplied BB2025 skill text: When this player performs a Pass Action or a Throw
  Bomb Special Action, they may declare any square on the pitch as the target
  square rather than using the Range Ruler. Make a Passing Ability Test as normal
  treating the throw as a Long Bomb, and treating any result of an Accurate Pass
  as an Inaccurate Pass. A Hail Mary Pass cannot be Intercepted.
- During Blizzard, apply the ordinary Quick/Short geometric range cap to both
  HMP actions, while retaining Long Bomb PA-test difficulty.
- Offer HMP only with the skill; offer HMP bombs only to players also eligible
  for Throw Bomb. Preserve ordinary action eligibility and skill exceptions.
- Normal/HMP passes share the pass allowance; normal/HMP bombs share the bomb
  allowance, including skills permitting a second throw. Bombs do not consume
  the ball-pass allowance.
- Allow mode selection before declaration and switching throughout movement
  until the target is committed, without consuming another action allowance.
- Preserve the selected mode through movement and restore authoritative action
  state on reconnect/recovery. Follow existing Jump mode presentation and defaults.
- Determine reroll eligibility from the underlying PA result before HMP accuracy
  conversion. Failed tests retain normal reroll options; converted successes do
  not become failed tests. Apply conversion on every modifier path.
- Reuse Jump/Leap/Pogo toggle sizing, shape, interaction, and highlights; provide
  distinct HMP ball/bomb icons and preserve MUTP themes and typography.
- The HMP overlay marks all eligible squares as Long Bomb difficulty and shades
  unavailable squares, including Blizzard exclusions.

## Acceptance Criteria

- Eligible players can select/switch HMP ball and bomb modes and target beyond
  normal range, with server rejection of illegal targets and unavailable modes.
- Mode changes preserve movement, activation state, and shared action limits.
- Ball/bomb PA rolls, modifiers, rerolls, fumbles, scattering, and interception
  exclusion obey the approved rules; accurate HMP is never the final result.
- Browser action icons, highlights, target overlays, and roll logs reflect HMP.
- New-game live play, spectator/replay, reconnect, and durable recovery retain
  consistent modes, reports, and outcomes.
- Other rulesets and ordinary throws retain their prior behavior.

## Constraints

- Work on a new branch from main; preserve unrelated changes.
- Follow repository ruleset isolation, Java 8, import, service, and test conventions.
- Use existing UI scaffolding and dependencies; preserve responsive browser themes.
- Leave changes unstaged and uncommitted until the user authorizes publishing.

## Implementation Guidance

- Keep BB2025 mechanics self-contained and preserve shared/older-rule behavior.
- Reuse native HAIL_MARY_PASS/HAIL_MARY_BOMB actions rather than introducing a
  second gameplay rules implementation in the browser.
- Keep server projection, target validation, overlays, and action limits aligned.

## Validation

- Maintain an affected-test manifest in the outcome report; run focused Java
  rules/projection/workflow checks and browser unit/interaction checks first.
- Exercise long-range targets, Blizzard boundaries, PA/modifier outcomes,
  rerolls, no interception, skill eligibility, action limits, and moving/toggling.
- Check live, replay, reconnect, and recovery paths and visually inspect icons
  and overlays in the running browser; update appearance/timing assertions.
- Run browser build and game-server/Maven builds and required suites. Diagnose
  failures and record exact commands, results, and any remaining blockers.

## Completion Notes

Both slices are implemented on the working branch. See the
[outcome report](hail-mary-pass-outcome.md) for acceptance evidence, self-review,
validation commands, visual captures, and remaining verification status.
The user accepted the implementation after local review and separately
authorized committing, opening a PR, merging after CI passes, branch cleanup,
and stopping the review stack.

## Tracking

- Slice 1 (rules): [#325](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/325).
- Slice 2 (browser and integration): [#329](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/329); depends on #325.
- Working branch: `feature/bb2025-hail-mary-pass`.
