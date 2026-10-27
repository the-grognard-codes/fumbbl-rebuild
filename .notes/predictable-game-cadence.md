# Predictable game presentation cadence

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/371

Branch: `feature/371-predictable-game-cadence`, from clean current `main`
(`45c2209dbc730fd84ee8a569ae14794a9c0d62f6`). One complete vertical slice owns
the shared browser playback queue, renderer timing, recovery and regressions.
Approved through feature grilling and the usual workflow on 2026-10-27.

## Agreed behavior

- Browser live coaches and spectators use independent, ordered presentation.
  Desktop, native rules, server progression and existing clock accounting stay
  unchanged. Presentation time consumes the running clock.
- Existing sprites smoothly translate between adjacent square centers in 200 ms,
  including diagonals. Queue length cannot accelerate movement. No new walk/run
  frames and no visible speed selector.
- First eligible logical roll appears immediately. Subsequent rolls are at least
  500 ms apart; simultaneous dice appear together. Armor, injury and casualty are
  separate logical rolls. Relevant presentation finishes before dependent input.
- Ball scatter and bounce steps take 250 ms and retain native catch/roll order.
- Reconnect and background recovery restore current state instead of animating
  missed history. Replay seeks jump to the selected state; existing speed/skip
  controls remain and replay rates scale event cadence.
- Reduced motion minimizes spatial translation while retaining readable dice
  and ball-event spacing. Each ordered player square remains observable.
- Preserve layout, controls, colors, typography and themes. Timing/movement
  transitions are explicitly in scope. No commits, pushes or deployment.

## Implementation and affected checks

Reuse the existing transcript beats and CSS interpolation. Make dice eligibility
part of the same queue as movement/ball events, leaving their independent visual
retention intact. Remove known-backlog prompt fast-forward and queue-dependent
movement acceleration. Keep missing-transcript recovery bounded and prompt
results restorable without rerolling. No server acknowledgement barrier.

Affected-test manifest:

- Unit: fixed live cadence/replay rates, simultaneous dice grouping, retention,
  ordered native ball/movement beats and provisional prefix reconciliation.
- Browser: playback and dice streams, actual painted movement, provisional
  confirmation/divergence, prompt gating, spectator queues, ball/catch chains,
  replay rates/seeks/skip, background recovery and reconnect without reroll.
- Integration: existing multiple-block dice, reroll readiness, ball presentation,
  pending recovery and completed replay controls.
- Browser unit suite, TypeScript/production builds, full native verification and
  standalone game-service build/tests. Inspect motion evidence and screenshots.

## Results

Implemented and self-reviewed. Browser unit, interaction, motion, replay,
recovery and production-build checks pass, as does the standalone game-service
build/test run. Full native verification passed with 1,152 passing tests and 11
existing opt-in skips. See
[the outcome report](predictable-game-cadence-outcome.md) for exact commands,
acceptance evidence, review fixes and limits. The owner approved integration
after visual review; publication authorization is recorded in the outcome.

The subsequently requested single dev-local review instance was started at
`http://localhost:5000/play`; the full startup browser gate passed. Startup and
health evidence, including the additional stale test correction, are recorded
in the outcome report.
