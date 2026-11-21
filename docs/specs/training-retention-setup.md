# Bounded training retention and casualty setup recovery

## Objective

Implement the approved retention approach for [#592](https://github.com/the-grognard-codes/moles-under-the-pitch/issues/592), plus shared setup recovery for [#591](https://github.com/the-grognard-codes/moles-under-the-pitch/issues/591). This extends the local harness in #567 / #570.

## Context

The original 20-game sample completed ten games, with nine engine-response timeouts and one setup failure. A reused Java process accumulated roughly 910,000 Mockito invocation records. The setup failure followed a casualty that left a saved formation with too few players on the line and no spare reserve.

## Requirements and acceptance

- Simulation mocks must not retain invocation histories. Closing a match must release its fixture; ordinary verification tests must keep recording mocks.
- Persist compact results and reproducibility information for each game, including failures.
- Keep optional compressed learning trajectories under an explicit byte cap, report dropped rows, and exclude incomplete trajectories from PPO.
- Retain bounded failure diagnostics and configurable successful-game samples.
- Provide preview-first age/size cleanup that preserves summaries, checkpoints, active/recent runs and pinned details. Never delete unrelated files or follow linked directories.
- Recover rejected saved formations using available players before looking for reserve replacements. Apply the same policy to normal computer opponents and the RL harness.
- Validate with focused tests and a small real sample, including the previously failing seeds. No long execution or deployment.

## Implementation constraints

Branch `codex/training-retention-setup` is based on harness branch `codex/567-coach-training-harness` at `30c048f3b`, because the harness has not landed on main. Preserve other checkouts and existing experiment data. Controls and operational instructions live in `computer-player/training/README.md`.

## Outcome

See [validation and limitations](training-retention-setup-outcome.md).
