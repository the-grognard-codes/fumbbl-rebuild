# Engine worker failure and restart

Issue: [#523](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/523)
and its [November 12 scope comment](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/523#issuecomment-6838687730).
See [the outcome](outcome.md) for validation evidence.

Keep the single engine owner in [ADR 0006](../../adr/0006-single-engine-worker.md).
A fatal worker error must stop admission, log the selected request type and
match when known, and exit without draining more mutations. Supervised dev
launchers must restart on failure. The local health probe must reject a dead
worker and a live worker that stops making progress for 10 seconds.

Include the JVM heap dump and exit flags from [#524](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/524)
and persist dev-local dumps on a host bind mount. Verify that a match can
recover its last accepted checkpoint after an interrupted write. Heap
retention, checkpoint performance, and service deployment are outside this slice.
