# Reliable match completion (#535)

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/535

Keep the terminal recovery checkpoint as the action acceptance boundary. If the
result write cannot start or reaches its definite JDBC deadline, retain the
resident session in the server completion queue, acknowledge and publish the
durable terminal state, and reconcile on a later worker tick. Timer-driven
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
The overnight run does not touch the dev-local stack or interactive credentials.
