# Feature: Compact match and replay layout corrections (deferred)

Part of [#388](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/388).

Tracking issue: [#389](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/389), labeled `needs-triage` and explicitly deferred. Local mirror; no implementation authorization.

## Abstract

Correct the measured resource/menu, compact scoreboard/side-stack and replay dugout-control collisions. This is backlog work, explicitly deferred by the owner. It does not block defining current display dimensions or writing support guidance.

## Objective

Improve landscape tablet coaching and phone replay/spectating within the approved desktop-first policy. Preserve current desktop presentation and the existing read-only viewing and game-action contracts.

## Context / Existing Behavior

Evidence: `docs/research/layout-minima-2026.md`, `docs/research/replay-layout-minima-2026.md` and the reproducible probes beside them.

- Five resource types wrap into camera/menu controls at 1346px width; the tested live fixture passes at 1347px. Four resource types have a corresponding 1096/1097px edge. The resource panel's border box does not cover all occupied child space.
- At 863x360 and 900x600, the compact score center can intersect turn/weather rows. Expanded dugouts, tracker and required controls can also collide at short phone-sized viewports such as 734x343.
- At 734x343 and 863x360, replay navigation remains reachable through normal document scrolling, but compact dugout summary buttons intersect. The measured replay page width edge is 966/967px with the tested content and styles.
- These are bounded synthetic-state observations, not universal minimums or proof of physical-device usability.

## In Scope

1. Resource wrapping and camera/menu placement: measure occupied resource space and keep following controls clear.
2. Compact scoreboard rows and expanded-panel clearance: correct unintended intersections while retaining readable required instructions and panel scrolling.
3. Replay dugout summaries: keep independent buttons from overlapping at phone viewing widths.
4. Focused regressions and updated support-page known-limit/testing notes when changes are delivered.

## Out of Scope

- Implementation during the current hardware-policy/dimensions task.
- General scoreboard redesign, new artwork, renderer or camera redesign, typography/theme replacement.
- Dedicated phone coaching layout or a guarantee of comfortable phone coaching.
- Game rules, sequencing, protocol, authorization, replay semantics or recovery changes.
- Raising the support floor or hiding required controls solely to avoid a failing check.

## Functional Requirements

- Reproduce each collision using actual product components before editing its owning layout rules.
- Keep all rendered resource controls inside their intended panel and clear of camera/menu actions, including five-resource cases.
- Keep compact score, turns and weather independent; account for long team names and both coach orientations.
- Keep tracker, expanded dugouts, chat/log and mandatory controls reachable without unintended intersections. Retain intentional internal scrolling and overlays.
- Make compact replay dugout controls independently selectable on landscape phones; retain normal replay page scrolling and playback controls.
- Preserve canonical pitch targeting, action identity, pending-action state, spectator permissions and exact recovery behavior.
- Re-measure the documented dimensions after fixes; lowering a public fit reference is a separate documented policy update.

## Acceptance Criteria

- [ ] Regression fixtures reproduce the relevant current failures before their fixes.
- [ ] Resource-rich tablet/live-view cases, including 1024x768 and 1280x665, have no resource/camera/menu intersections.
- [ ] Compact scoreboard/stack cases at 734x343 and 863x360 clear the relevant viewing controls and required information, with explicit panel-state expectations.
- [ ] Phone replay controls and compact dugout summaries at 734x343 and 863x360 are independently reachable without button overlap.
- [ ] Desktop references, both coach views, landscape tablets, all existing themes, touch/keyboard and zoom/recovery safeguards retain their behavior.
- [ ] Any scope tradeoff or remaining failure is recorded before weakening an assertion or dropping an experience target.
- [ ] Support-page known limits and verification status reflect only delivered, validated changes.

## Constraints

- Preserve MUTP colors, typography, styling and themes on Android, Windows and Linux; retain intended Apple compatibility without claiming physical Apple validation.
- Reuse existing CSS and UI scaffolding. Preserve unrelated working-tree changes.
- Create a separate working branch when implementation is scheduled. Follow repository conventions.
- Do not commit, push, merge or deploy without explicit authorization.
- Status: deferred backlog; creation does not authorize implementation or make this issue a dependency of parent policy documentation.

## Implementation Guidance

Use individually reviewable slices for the three collision groups. Likely owners: `LiveMatchScoreboard.tsx`, `coach-match.css`, `useMatchHistoryDock.ts`, `drive-phase-tracker.css`, `HostedResult.tsx`, `LiveDugouts.tsx` and shared replay/dugout styles in `live-pitch.css`. Prefer scoped layout corrections; retain useful short-viewport rules for scaled desktops, keyboards and viewing.

## Validation

- Reuse the research probes to reproduce and re-measure, then add meaningful product regression coverage at the established browser-test seam.
- Check default and independently expanded/minimized panels, long names, five-resource teams, both coaches, spectators and replay.
- Before visual handoff, exercise affected live-play, replay, reconnect, pending-action retry and restart-recovery paths. Update appearance/timing assertions only for approved behavior changes.
- Run browser unit tests, relevant browser integration suites, production builds and required Java/game-server checks after product changes. Record exact commands, versions, results and gaps.

## Completion Notes

Deferred at the owner's direction. No fixes or product tests performed by creating this issue. Existing evidence supplies reproducible starting points; future implementation must validate the then-current source.
