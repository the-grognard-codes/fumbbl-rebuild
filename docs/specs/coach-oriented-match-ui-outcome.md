# Coach-oriented MUTP pitch: integration outcome

The approved 40-degree perspective and scrolling tactical view replace the first pitch presentation in the production match application. A real BB2025 Human/Orc match is playable through the new UI. All eight implementation slices merged, ending with [PR #109](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/109) at `ff71703c04f47860634616a901cbe36521e19f8e`; all eleven automated checks passed. Hosted signed-in release acceptance remains separate.

The result matches [ADR 0003](../adr/0003-coach-oriented-angled-pitch.md) and the [approved integration spec](coach-oriented-playable-match-ui.md): MUTP pixel art, opposite coach views, consistent square identities and an unobstructed fixed HUD sit over a whole travelling stadium. DOM/SVG proved sufficient. The new renderer reuses the existing authoritative engine, transport, saved teams, route planner and durable match records.

## Functional evidence

| Requirement | Delivered behavior and verification |
| --- | --- |
| Canonical pitch | All 390 cells retain their 26×15 identities, zones and player anchors. Shared forward/inverse projection, both-end navigation and boundary regressions pass |
| Coach and tactical views | Default 40-degree perspective; top-down has square cells, parallel lines and north–south travel. Camera/projection changes preserve focus and proposals and do not mutate native state |
| Travelling surroundings | Turf, markings, players, ball and registered crowd/stands use the same camera; HUD remains fixed. Painted depth distortion and plate repetition remain documented MVP limits |
| Player art | Twelve Human/Orc archetypes, 84 directional/ground body assets and 12 portraits; 64/80px body contracts, mirror-safe numbers, alpha/anchor checks, missing-art tokens and versioned delivery packs |
| Authoritative HUD | Team names, resources, BANK/TURN clocks, half-specific eight-slot tracks, fixed chat/log, opacity setting and three log fonts use live data. Central weather space remains reserved as approved |
| Actions and decisions | Move/Block/Blitz/Other/End Turn and Confirmed! preserve reviewed planned actions, Last used, server routes and direct required responses. All offered actions retain a text fallback |
| Setup and off-pitch access | Legal drag/keyboard placement and all five dugout categories remain available. Native exhausted players stay off pitch; inspection does not require selection |
| Dice and playback | Authoritative ivory/cyan dice, short nonblocking rolls, ordered movement, prompt interruption, reduced motion and stale-timer-safe replay seeking |
| Real coach match | Fresh independent coaches plus spectator complete both halves naturally, 2–1 at revision 393, with 394 events; no fixtures or forced full time |
| Continuity and security | Native pending-decision/route reconnect, agreed save/resume, durable escaped chat, spectator parity and rejected wrong-coach/stale intentions pass. Both actual coaches load identical completed results |
| Computer opponent | Existing Bugman path completes 1–0 at revision 560 / 561 events. The retained native checkpoint resumes after the bounded storage repair; continuation is explicitly recorded |
| Replay cutover | Actual retained result is readable by both coaches. Either camera end and both projections preserve identities; pitch/dugout hover cards work with zero mutation requests |
| Accessibility and browsers | Four specified desktop sizes, short/narrow fallback, real 100%/200% zoom, Chrome/Edge, keyboard inspection, reduced motion and failed-art paths pass |

Normal `/play/match` coach/spectator and `/play/result` entry points use the same projected pitch. Historical v1 fixture labs, the first illustrative MVP and ADR angle studies remain available as development/reference evidence; the hosted application does not navigate to them.

## Verification and delivery

The [acceptance report](coach-oriented-match-ui-acceptance.md) contains scenario IDs, exact continuation boundaries, build/runtime versions, screenshots and foreground measurements. Browser unit/interaction/reconnect/build and asset checks pass; site checks, six unit tests and ten browser scenarios pass, with the five result scenarios rerun after the final replay change. The computer player passes eight tests. The final Java clean install ran 697 tests: 688 passed, nine existing opt-in environment skips, zero failures/errors. Every implementation PR merged after passing its automated checks; revisions are in the [baseline ledger](coach-oriented-match-ui-baseline.md).

The storage repair is lossless and bounded, preserving SQL/public-format/CAS contracts. Newly compressed rows require the new readers, including during rollback. Retained history limits remain explicit; they were increased and tested rather than removed. Credentials, full development logs and private account data are outside the tracked evidence.

Hosted signed-in release testing, overtime gameplay, yaw, additional roster art and a refined stadium model remain later work. Local evidence satisfies the owner's agreed unattended completion gate; it does not claim a hosted account test or sustained animation/memory benchmark.

The [final retrospective](coach-oriented-match-ui-retrospective.md) reviews compliance, intent, delivery limits and improvements to the agent environment after all slices merged.
