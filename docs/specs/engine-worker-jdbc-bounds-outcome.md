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

## Deliverable B and conditional #506 sequencing

A was committed as `ab7a89928` before B began. B's unpooled bounded controls,
durable readback and relevant regressions passed 112 focused tests (zero
failures/errors, one existing opt-in authorization-database skip), including
the real synthetic MariaDB tests. The isolated database is MariaDB 11.8.9;
no application/review schema is used. Logs: `.tools/b-before-pool.log`,
`.tools/b-durable-expanded.log` and `.tools/b-recovery-initial.log`.

The native journal tests lose an actual wire-level COMMIT acknowledgement for
both outcomes: COMMIT forwarded and committed, or withheld and rolled back on
disconnect. Restoration, exact retry and subsequent mutation retain one accepted
action and no duplicate journal entry. Separate tests cover one-second SQL lock
errors without breaker opening, a late deadline after a 1,100 ms provider double,
both autocommit and explicit-transaction membership/preference outcomes,
principal creation reconciliation, and post-close acknowledgement loss.

### Pooling fallback invoked

The first full healthy-path measurement used real local authorization,
membership, preference refresh, native actions, checkpoints and publication to
15 passive peers (16 admitted connections including the requester). The provider
double returns immediately on healthy/cache-hit checks and consumes 1,000 ms
for one cold operation. Delivery doubles serialize/accept every publication;
all measured requests succeeded. This does not validate production Firebase.

The final matched capture uses **200 successful actions and 800 resident loads**
per mode, cycling the same three synthetic native checkpoints. It records another
10 warmup actions, 103 initial/warmup loads and 21 cold-provider actions separately.
All 1,134 tasks per mode return ACCEPTED; every mutation delivers to all 15 peers.
The complete worker body includes local authorization, dispatch, native execution,
checkpointing, synchronous server logging, requester serialization and publication.
Queue admission/scheduling and actual browser/wire processing are covered by the
transport/browser checks, not simulated as extra JSON decoding inside the worker.

| Path | Unpooled median / p95 / p99 (ms) | Pooled median / p95 / p99 (ms) | Physical connections per task |
| --- | --- | --- | --- |
| Healthy action + publication | 158.54 / 192.20 / 207.12 | 57.40 / 75.16 / 79.74 | 24 → 1 (24 logical loans) |
| Healthy resident load | 44.25 / 57.91 / 64.97 | 14.54 / 22.37 / 26.15 | 7 → 0 (7 logical loans) |
| Cold 1,000 ms provider operation + action | 1201.48 / 1229.54 / 1236.86 | 1103.20 / 1118.64 / 1130.84 | 24 → 1 |

Mean physical acquisition time per healthy action falls from 89.32 to 4.18 ms.
Pooled maximum healthy action is 129.39 ms; one of 200 exceeds 100 ms, while
nearest-rank p99 remains 79.74 ms. Warmup action maximum is 98.56 ms and
initial/warmup load maximum 50.21 ms. Every task remains below 2,000 ms. These
are finite local measurements, not a production-provider SLO claim.
Measurement environment: Windows 11, pinned Temurin 21.0.11 and Maven 3.9.9,
2 GB test heap, with MariaDB in the isolated Docker container. The dev-local
runtime uses its existing 768 MB heap; startup is validated separately below.

[Numeric evidence](../reviews/2026-11-09-jdbc-bounds-measurements.json) retains
all execution samples, counts, connection totals, provider/delivery counts and
the three shared SHA-256 fixture identities. The early exploratory 30-sample
captures were superseded: their delivery double also decoded full JSON on the
worker, which production queues asynchronously. Final matched captures count
serialized deliveries without client decoding and use 200 actions for p99.
The corrected unpooled measurements still independently require the RB1 fallback.
Configured caps remain 500/1,500 ms; no artificial cap reductions were used.

A later fresh-fixture run observed 104.31 ms action p99 (three early samples
above 100 ms), so the original matched result was not treated as universal.
Pinned driver inspection showed repeated unchanged timeout settings still call
the native socket API. Commit `cdf5b5c81` recomputes every allowance while skipping
that redundant setter when the driver's current integer value already matches;
every actual I/O call still gets a fresh physical deadline. The subsequent fresh
200-action run measured p99 86.95 ms, maximum 102.11 ms, with one physical
connection per action. Supplemental samples from both runs are retained alongside
the matched evidence. No startup samples or failures were silently removed.
The clean-build repeat with another 200 fresh-fixture actions measures p99
92.22 ms (resident-load p99 22.33 ms). It is retained as a third supplemental
capture; the two post-correction fresh-fixture runs both meet the local target.

[#506](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/506) now records
the evidence and replaces its old whole-#505 dependency. Sequence: validated A
→ bounded connection/session controls → #506 pool → final B acceptance. The
pool preserves the same budget, bounded acquisition, clean transactions and
session policy. It adds no dependency. **B and the #506 fallback are independently
accepted on November 9, 2026**, with the validation and remaining integration
boundary recorded below.

### Pool and deadline policy

The one-worker pool holds at most two physical sessions and refuses exhaustion
immediately. Idle sessions older than one second receive a bounded SELECT 1
validation; its driver calls use the connect cap and the current request budget.
Every loan receives a fresh wrapper and breaker lease; closed connection,
statement and result handles cannot affect a later borrower.

Only unchanged, side-effect-free autocommit read sessions are recycled. Writes,
transactions, session setters, metadata, updatable-result mutations, abort and
unknown SQL cause physical eviction. This preserves the complete configured
baseline without a partial vendor reset. Active statements close before return;
defensive client-info copies prevent a mutable object escaping into another loan.
Tests cover quoted, qualified, dollar-containing and digit-leading stored-function
names, isolation/catalog/SQL-mode changes, rollback, exhaustion and stale handles.

Every actual JDBC I/O call receives min(per-call cap, remaining request time minus
reserve). Work uses a 150 ms reserve (100 ms native/CPU plus 50 ms cleanup), COMMIT
50 ms, cleanup zero with a 50 ms cap. Sub-millisecond usable allowances refuse
before I/O; they never become driver zero/unlimited. The required caps need not
sum below 2,000 ms. A boundary-owned physical socket timer caps connect/handshake,
reads, writes and cleanup even when a driver read trickles or a write blocks.
Only proven local pinned-driver parameter/buffer accessors omit redundant socket
updates; callable setters retain protection for their hidden metadata queries.

The shared breaker opens after three consecutive availability failures for five
monotonic seconds, admits one recovery probe, and resets on a clean successful
lease. Stale successes cannot close a newer open circuit. Local budget refusal,
lock wait 1205, deadlock 1213 and ordinary SQL validation/concurrency failures do
not count as outages. A 32-request outage test makes only three physical attempts
and proves expiry, disconnect, unrelated control and permit cleanup still progress.
Uncertain writes reconcile through a fresh bounded durable read; an open breaker
can defer confirmation, but never fabricates acceptance or rollback.

### Supported JDBC configuration

`db.url` alone supplies positive integral connect/socket caps in milliseconds
and `sessionVariables=innodb_lock_wait_timeout=1` in seconds. Query keys/values
support UTF-8 percent encoding; split raw ampersands before decoding. Names,
case variants and pinned-driver aliases are normalized before duplicate checks.
Other supported options/session variables survive in fresh per-call Properties.
Session values accept numeric/bare literals or quoted strings with doubled
quotes; expressions, subqueries and backslash-dependent quoting are rejected.
Arbitrary `initSql` is rejected because Connector/J executes it after the required
session variables and it could override the lock limit or open a transaction.
No corrective per-connection configuration query is introduced.
URL timeout values override Properties in pinned Connector/J 3.5.8, so the
driver receives an option-free URL plus the normalized effective Properties.
Validation errors never retain a URL, credential value or raw driver cause.

Supported endpoints are one simple DNS/IP TCP endpoint, resolved once at startup;
changing that address requires restart. Preconnected owned sockets preserve the
original hostname and remove worker-side DNS. Alternate factories/bind addresses,
HA/replay/redirect modes, external credentials and file/URL key stores are rejected.
Authentication is restricted to the approved MariaDB `mysql_native_password`
mechanism; LOCAL INFILE and system key/trust-store fallback are disabled.
Verified TLS modes require a future supported startup cache for certificate
material and are rejected at startup; an explicit TRUST mode is never substituted
for requested verification. The approved loopback database profiles retain their
existing transport security. These restrictions prevent hidden file, credential
and DNS work from bypassing the owned socket deadline.

Primary driver evidence: [configuration parsing and URL precedence](https://github.com/mariadb-corporation/mariadb-connector-j/blob/3.5.8/src/main/java/org/mariadb/jdbc/Configuration.java),
[socket setup](https://github.com/mariadb-corporation/mariadb-connector-j/blob/3.5.8/src/main/java/org/mariadb/jdbc/client/impl/ConnectionHelper.java),
[network timeout](https://github.com/mariadb-corporation/mariadb-connector-j/blob/3.5.8/src/main/java/org/mariadb/jdbc/Connection.java).

## Durable failure and retry boundaries

Match, recovery and saved-team repositories retain their typed uncertain-outcome
contracts, including failures after a successful commit while closing resources.
`CommitNotStarted` proves refusal before COMMIT, so it remains a definite failure;
an attempted COMMIT or lost cleanup acknowledgement does not prove rollback.
Preparation retains its existing CommitUnknown handling and exact response codes.
Match/preparation return MATCH_OUTCOME_UNKNOWN; saved-team writes/deletes retain
SAVE_OUTCOME_UNKNOWN / DELETE_OUTCOME_UNKNOWN. No SQL detail enters those responses.

Membership insert confirms the exact durable role after acknowledgement loss or
an identical duplicate retry; it never overwrites a conflicting membership.
Preference upsert confirms only the requested durable mode and otherwise reports
its typed unknown boundary for bounded retry. Principal creation reads back the
identity binding and active account/scopes on a fresh bounded connection; a missing
or unconfirmed binding remains fail-closed. No uncertain identity grant is invented.
Both autocommit acknowledgements and explicit transaction commits are covered.

The actual MariaDB wire-fault tests forward or withhold COMMIT/write packets,
then drop the acknowledgement. Committed actions restore and exact-retry without
another native execution or journal append. Uncommitted actions restore the old
checkpoint and admit at most one eventual accepted mutation, followed by a valid
later mutation. The transcript/checkpoint/result transaction and CAS ownership
boundaries remain unchanged. Admission consults the breaker before native mutation.

## Final review

Final clean `tools/target-build.ps1 verify` passed on runtime commit `cdf5b5c81`
in 19:04. Reports: common 19 / 0 skips; server 736 / 8 skips; native 292 / 7 skips.
Total **1,047 tests, 1,032 passed, 15 existing opt-in skips, zero failures/errors**.
Every new JDBC test ran; the existing real authorization-directory test also ran
against its separately provisioned empty synthetic schema. This includes native
queue, transcript, recovery and exact-response regressions. Evidence:
`.tools/b-verify-accepted.log`. The earlier B clean run was intentionally stopped
for the final runtime correction and is excluded from passing evidence.

Focused pool/configuration/measurement checks passed 14 tests; final startup
configuration checks passed 3; corrected outcome/authorization checks passed 35.
One new delete-response test initially used the legacy adapter, which rejects
account-only deletion; the corrected account adapter test passes both committed
and uncommitted outcomes. The final clean run includes that correction.

Post-B browser unit tests passed **530/530**, without skips, and the production
TypeScript/Vite build passed. Evidence: `.tools/b-browser-unit.log` and
`.tools/b-browser-build.log`. The dev-local start runs the full repository browser
interaction/hosting preflight with `FFB_BROWSER_TEST_WORKERS=1` before startup.

All **82 browser suites** passed: 70 interaction suites across four groups and
12 hosted-page suites. This includes reconnect, exact retry, diagnostics export,
native movement/decisions, rendering, mobile and replay. The repository validated
all five coverage reports against runtime commit `cdf5b5c81`; elapsed 1,007 seconds.
Reports are in `.tools/validation/local-browser-HlsSEl/`; full output is retained
in `.tools/b-dev-local.log`.

The ordinary `node tools/dev-local.mjs --start` completed the container build and
reported ready at `http://localhost:5000/play`. MariaDB and Java health passed,
Firebase ADC was verified, the real proxy/auth-gate initial/reconnect smoke passed,
and the computer player registered. The startup audit found an expired cached
Firebase CLI login in Hosting, separate from the working server ADC. Hosting now
receives the already-verified ADC path and an isolated ignored CLI configuration
through its child environment; inherited FIREBASE_TOKEN is removed only there.
The fix does not copy ADC/token contents, the isolated configuration contains no
credential fields, and global login state is unchanged. A read-only Hosting API probe and the repaired Hosting process
both passed, with HTTP 200 and no authentication errors. Nineteen existing local
tooling/auth/proxy tests passed after this fix. Its startup-only change and the
test-only fixture correction below follow the clean Java runtime verification;
they do not change the server/browser runtime that was verified.

Application and computer stderr contain no unexplained errors. Remaining startup
notices are the existing SLF4J no-op binding, no Emulator UI for Hosting-only mode,
and an explicitly expected unavailable optional SQL Connect VSCode notification
endpoint. The original expired-login log is retained; the corrected Hosting log is
`.tools/dev-local-hosting-adc.log` (empty `.err.log`).

Five opt-in checks skipped by the clean run were then provisioned safely on
additional synthetic schemas: browser-only bootstrap, marker verification,
preference migration, recovery-journal migration/CAS/compaction and preparation.
The preparation fixture still created format-1 drafts for UUID accounts and
correctly received MIGRATION_REQUIRED; its helper now supplies the current draft
format with names/jerseys, preserving every existing assertion. The final group
passed eight tests plus the earlier one-test bootstrap; the preparation unit/DB
selector also passed 13 tests. Logs: `.tools/b-extra-bootstrap.log`,
`.tools/b-extra-jdbc-final.log`, `.tools/b-preparation-final.log` and
`.tools/b-local-tooling-final.log`. These cover five previously skipped cases;
the remaining ten require separately provisioned history-scaling, historical R4/R5
or retained cross-process/runtime fixtures. They are not claimed as validated.

### Standards

APPROVE, no remaining actionable findings. Earlier abort/session-baseline and SQL
identifier findings are fixed by physical eviction and conservative classification.
Stale-loan guards, slot accounting, deadlines and shutdown follow the single-worker
lifecycle. No unrelated source or site updates are included.
The final startup-environment and current-format fixture corrections also received
an independent APPROVE, with no remaining findings.

### Spec

APPROVE, no remaining actionable findings. Earlier full-task logging timing,
callable setter, initialization policy, client-info and updatable-result findings
have regressions and fixes. The pool was brought forward under the approved RB1
fallback, with evidence and tracker ordering corrected. Each axis independently
reviewed the runtime diff; validation results are recorded separately.
The final startup-environment and fixture corrections were separately approved.

## Outstanding integrated provider validation

Independent JDBC acceptance uses the declared bounded provider double. Production
Firebase enforcement is still owned by [#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504)
and is not made compliant by the shared context or pool. Real-provider integrated
cold/healthy/outage captures must consume this same budget after #504, and the
remaining worker fixes/final #39 run retain their documented sequence. This slice
does not claim whole-runtime two-second compliance or production-provider p99.
Browser startup/reconnect success is also not that integrated provider validation.
