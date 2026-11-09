# Engine-worker JDBC bounds — slice 2 implementation

Tracking: [#505](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/505).
Request: [revised scope](engine-worker-jdbc-bounds.md), linked from the issue
[before implementation](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/505#issuecomment-6749278942).
Base: current main `ccc98707c`; branch `fix/engine-worker-jdbc-bounds` in an
isolated worktree. The merged base contains ADR 0006 and the RB1 correction.

## Deliverable A contract

`BrowserRequestTiming.budget()` returns the current worker task's budget, or
null outside worker execution. Any instance accesses the same existing CURRENT
ThreadLocal. A task receives 2,000 ms at execution start, excluding queue wait.
Nested handling scopes inherit the same budget object and restore their parent
in scope exit; exceptions remove the outer context. Helpers must not create
independent budgets. `remainingNanos()` uses monotonic elapsed time;
`allowanceMillis(capMillis, reserveMillis)` floors the smaller remaining
allowance to milliseconds. Zero requires refusal before an API where zero means
unlimited. Caps must be positive and reserves nonnegative. #504 consumes this
contract; provider enforcement remains owned by #504.

Diagnostics, correlation IDs and wall clocks do not enable enforcement.
Monotonic clock failure fails execution rather than silently disabling budgets.
Optional wall-clock/output failure cannot change the budget or request outcome.

Transport metrics expose bounded `workerTasks` numeric records: kind 0 ingress,
1 other control, 2 decision expiry, 3 disconnect. Each has cumulative count,
queue/execution nanoseconds, maximum execution nanoseconds and overrun count.
`workerTaskSamples` retains the latest 256 numeric measurements with monotonic
sequence numbers, allowing captures to compute percentiles and detect gaps.
Measurement ends after the task's publication/cleanup and ingress permit
release. Control admission, coalescing and scheduling remain unchanged.
No task body, identity, match ID or native state is retained by these counters.
Overruns are observed compliance failures, never interruption of native work.

Affected-test manifest: BrowserRequestTimingTest, BrowserMatchTransportTest,
BrowserEngineQueueTest, existing authorization/recovery/transcript/server tests;
browser unit/build and reconnect coverage; clean target-build verify.

## Validation boundaries

A validation is recorded before JDBC implementation begins. B must independently
prove bounded JDBC behavior with a declared bounded provider double; production
Firebase remains noncompliant until #504 and real integrated validation pass.
Neither A nor independent B evidence establishes a whole-runtime deadline.

### A review and validation progress

Standards review: no actionable findings. Spec review: one timing finding fixed;
numeric completion now includes synchronous diagnostic/log output. A fake-clock
regression proves a 1,950 ms body plus 100 ms failing output records 2,050 ms and
an overrun, with worker context removed. Follow-up spec review approved the fix.

Completed checks: 37 focused timing/transport/detail/metrics tests, no failures,
errors or skips; 530 browser unit tests; browser production build; both reconnect
UI scenarios. Logs are retained in this worktree's ignored `.tools/` directory.

The machine crash interrupted the first clean verify and dev-local preflight;
neither is counted as passing. The post-crash clean verify was superseded after
the logging-cost review fix, and its process tree was stopped before restarting.
The resumed shared test JVM exhausted almost all of its 2 GB heap during
RoutePlannerTest (heap/thread diagnostics recorded), causing severe GC slowdown.
The same 23 tests passed in a fresh JVM in 9.952 seconds. Final A clean verification
runs with `JAVA_TOOL_OPTIONS='-Xmx2048m -DreuseForks=false'` to isolate test-class
heaps; dev-local browser preflight after B will run with one worker. These are validation-process
resource limits, not runtime dependency budgets.

**A accepted independently on November 9, 2026.**
`tools/target-build.ps1 verify` completed with BUILD SUCCESS in 17:42 using the
above isolated-fork setting. Reports: common 19 tests / 0 skips; server 699 / 9
skips; native 292 / 7 skips. Total 1,010 tests, 994 passed, 16 existing opt-in
skips, zero failures/errors. The skips require explicitly provisioned database,
schema, recovery-artifact or continuation fixtures; no new A test skipped.
This passing run includes engine-queue, authorization, recovery and transcript
regressions. Evidence: `.tools/a-verify-isolated.log`,
`.tools/a-focused-final.log`, `.tools/a-browser-test.log`,
`.tools/a-browser-build.log` and `.tools/a-reconnect.log` in the task worktree.
B implementation begins only after this boundary and the A commit.
