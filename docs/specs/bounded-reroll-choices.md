# Bounded reroll choices

Parent: [#561](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/561).
Branch: `codex/561-reroll-loop`, based on PR #558 at `e3564e2e0`.

## Work slices

- [#562: root cause, fix and regression](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/562).
- [#563: seeded, dev-local and soak acceptance](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/563), depends on #562.

## Acceptance

Capture the repeating native dialog, offered and selected actions and state
changes. Protect the real native path with a regression that fails before the
fix and resolves within a small stated bound afterward. Audit the other
basic-judgment choices. Keep the server authoritative and leave both emergency
and kick-off allowance limits unchanged.

Run full Orc/Human seed 73 plus two additional seeded matches, with recklessness
on, no decision-limit warnings and every turn below 200 decisions. Run the
three-hour local UI soak and inspect warning output. Start dev-local using
`--quick`, leave it running for manual testing and publish a PR for review.

## Evidence

Implementation, review and validation results are recorded in
[the outcome report](bounded-reroll-choices-outcome.md).
