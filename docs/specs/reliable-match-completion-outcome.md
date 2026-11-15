# Reliable match completion (#535)

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/535

Keep the terminal recovery checkpoint as the action acceptance boundary. If the
result write fails with SQLException (including MatchRepository.OutcomeUnknown)
or MatchService.OutcomeUnknown, retain the resident session in the server completion queue, acknowledge and publish the
durable terminal state, and reconcile on a later worker tick. Other runtime
failures, including deterministic materialization/validation failures, release
the resident session without queueing and log COMPLETION_TERMINAL. They preserve
the accepted/published terminal checkpoint; the result needs operator investigation.
Definitive queued MatchService rejections release with COMPLETION_REJECTED. Timer-driven
completion publishes on its checkpoint tick and attempts the result on the next
tick. This retains crash recovery and avoids relying on a coach retry.

Skipping the terminal checkpoint was rejected because a failed result write
would otherwise leave the final native decision without durable recovery.
Reconciliation uses the existing single worker and 2,000 ms task budget, one
queued result per tick with the existing bounded failure backoff. No new executor
or stored format is introduced.

The timer also checkpoints resident abandonment without a second client request,
drops orphaned completion entries, and logs retry/rejection as distinct safe
codes. Computer workers yield immediately on definite persistence rejection;
the daemon alone owns backoff and its per-cycle diagnostic.

Regression evidence includes a fake-clock request with only 100 ms remaining
after checkpointing, terminal publication for request and expiry paths, native
full-match recovery tests, orphan/abandonment tests, and socket-level computer
tests spanning three consecutive daemon backoff cycles.

Pending user validation: the three-hour dev-local soak, including no held final
request or frozen final board and no completion pending beyond one healthy tick.
Count server COMPLETION_DEFERRED phase=completion plus COMPLETION_RETRY
phase=pending-completion lines by matchId; do not count the former server label
COMPLETION_PENDING. That client wire code is unchanged. COMPLETION_TERMINAL and
COMPLETION_REJECTED are failed result recording requiring investigation.
The overnight run does not touch the dev-local stack or interactive credentials.

Review regressions cover a dropped JDBC connection (SQLSTATE 08006), unknown
result commit, deterministic materialization/validation failures, and a definitive
rejection. SQL/unknown outcomes reconcile without another client request or
native action; other runtime failures release after their first failed attempt,
including on the queued path, without losing the published terminal state. The safe request log label is COMPLETION_DEFERRED.
