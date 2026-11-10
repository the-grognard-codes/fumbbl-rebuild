# PR #518: authorize activity-bearing recovery notices

Baseline: `ea7aa99bfbab5cf99d5fd0dcd63895dd3f77e845`.
Security runtime: `5a534378ccd7dfbc4b12c336dc7caf38f0b5efbb`.

## Dispositions

- **#2, [4529539885](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4529539885): fixed before merge.** Delay notices now require one separate current local batch for the undelivered recipients. Match/chat and preparation callbacks enforce the returned role and original token expiry both before serialization and immediately before enqueue. This closes both local-revocation and token-expiry activity disclosure, rather than applying only the suggested minimal expiry guard. Failed, denied or expired notification grants produce a generic unavailable response without match ID/family and retire the recipient.
- **#1, [4529539705](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4529539705): tracked in #519 by maintainer direction.** Automatic retries of rejected recovery reads remain deferred, with player recovery the highest priority.
- **#3, [4529540036](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4529540036): tracked in #519.** Ignoring irrelevant but valid computer notices remains deferred.
- **#4, [4529540244](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4529540244): tracked in #519.** Consolidating the budget observation remains deferred.

[Issue #519](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/519) and
[its local handoff](../specs/engine-worker-publication-recovery-follow-ups.md)
record scope, acceptance criteria and regression requirements. These three items
are explicitly accepted follow-up work, not claimed complete in this PR.

## Security and behavior

A failed payload batch supplies no grant for a later activity notification. The
new notification batch uses the same absolute task deadline, existing local SQL
path, original principals and 16-target bound. It is a distinct publication:
one batch for the failed payload attempt, then one for the recovery notice at
the retry limit; ordinary successful publications keep their existing query
count. No provider call, cached-role reuse, token extension or new budget occurs.

If the required notice authorization cannot fit or cannot be established, the
server fails closed and retires without disclosing activity. That generic
unavailable response can clear the board; the server cannot send a privileged
recovery hint merely to improve availability. This boundary is explicit rather
than treating a missing grant as authorization. Fresh authorized notices retain
the existing board-preserving recovery behavior. Observed provider rejection and
actual expiry/denial still remove subscriptions.

## Validation

Focused server validation initially passed **97 tests**, zero failures/errors or
skips. Coverage tests STATE/CHAT/PREPARATION with original-token expiry at the
exact boundary, local revocation during deferral, expiry between callback
admission and final enqueue, and unavailable notification authorization. In every
case no notice metadata is emitted, rejected recipients retire, and provider
calls remain zero. Authorized notices and later enrolled delivery still pass.
The queue fixture permits a fresh notification grant only after the payload has
used its three counted failures; short attempts retain the existing allowance.

## Standards

Independent review found no actionable documented-standard violations or heuristic
findings. **APPROVE**. The reviewer did not execute tests.

## Spec

Independent review found no actionable missing, incorrect or out-of-scope behavior.
Grant/expiry/budget admission, recipient slots and the explicit fail-closed
boundary were approved; deferred comments were not reopened. **APPROVE**. The
reviewer did not execute tests.

Totals: Standards **0**, Spec **0**.

Clean pinned `tools/target-build.ps1 verify` passed **1,112 tests**, zero failures
or errors, **20 expected opt-in skips**, in **14m11s**. Log:
`.tools/pr518-round6-verify.log`. Focused log: `.tools/pr518-round6-focused.log`.
Combined actual Firebase/JDBC/socket boundary passed **112 tests**, zero failures,
errors or skips. Cold authentication **627 ms**, OAuth refresh **233 ms**, late-lock
refusal **1,852 ms**, JDBC allowance **698 ms**. Ordinary STATE/CHAT/PREPARATION
publications retain **0/1/1 queries for 0/1/16 targets**; 16-target batches took
**6.8-7.4 ms**. Sixteen real sockets used 13 state targets, 13 chat targets and
one preparation target, with **zero provider fan-out calls**. Log:
`.tools/pr518-round6-real-provider-jdbc.log`. Separate notification-batch admission
and denied/expired-notice behavior are proven by the focused security regressions,
not inferred from the ordinary-publication SQL timing scenario.

 Browser/computer
product code and the budget-read implementation are unchanged in this correction.
Previous browser, startup and native timing evidence remains identified by its
original runtime, including the existing authentication timing/UI wait limits.
No merge or remote deployment is performed.
