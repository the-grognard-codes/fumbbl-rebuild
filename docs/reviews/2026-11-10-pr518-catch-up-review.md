# PR #518: catch-up review revisions

Base: `e6944de3f5cc2eead052632ba6da622d0740b1c7`. These revisions supersede the
previous report's claim that waiting for a later publication is adequate recovery.
No merge or remote deployment is authorized or performed.

## Dispositions

1. [Dropped turn handoff](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526137402): **accepted**. A retained enrollment does not guarantee another action; the opponent may be waiting for the lost prompt. The publisher now retains only undelivered recipients and automatically retries without another action.
2. [Deferred full time](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526137581): **accepted**. The final public snapshot is retained for eligible spectators, delivered after fresh local authorization, and then their enrollment is removed. Immediate removal alone was not chosen because it would still lose the result.
3. [Transient database unavailability](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526137800): **not adopted under the accepted security contract**. `Unavailable` does not prove revocation, but it also cannot establish current local authority. The #507 functional requirements explicitly say errors use "existing unavailable/removal behavior" and that a "local authorization/database failure" stops pushes. Request-allowance exhaustion is separately specified. Treating every `SQLTransientException` as deferral would change that agreed failure policy and conflate unrelated failures (including transaction retry semantics) with request scheduling. `Unavailable` therefore remains fail-closed retirement, with a regression covering all three families. This is a policy choice, not a claim that transient failure proves revocation.
4. [Lost partial chat](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526138011): **accepted**. Undelivered recipients receive the retained page automatically; recipients already sent it are removed from the pending list. Subsequent publications join the same FIFO and cannot overtake it. No chat mutation is replayed.
5. [Heal breaker on denied identity](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526138251): **rejected as incompatible with the accepted #504 requirement** that "ordinary denied identities do not masquerade as provider recovery." That requirement explicitly keeps the breaker open until validated success. The existing implementation releases the probe immediately without restarting cooldown; another identity can probe at once. A non-availability response is not necessarily a successful complete key/credential/revocation operation. Future parallel provider callers would require a reviewed policy change; their hypothetical addition does not justify changing this contract now.
6. [Catch ordering](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526138444): **accepted**. `PublicationDelivery` owns the defer-versus-retire decision for all three families. Recipient-specific projection remains at the caller. A sealed role outcome would not cover JDBC exceptions from projection or enqueue and is unnecessary with one dispatcher.
7. [Exception signatures](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526138625): **accepted**. `publication` and `publicationRole` declare and document `PublicationDeferred`, distinguishing budget exhaustion from denial.
8. [Duplicate JDBC classification](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526138801): **accepted**. Only the dispatcher's classifier handles `PublicationDeferred`, `NotStarted`, and `DeadlineExpired`. Batch and projection failures use that same decision.

## Security and scheduling

The original request retains its one absolute deadline. Catch-up is a separate,
coalesced `CONTROL` task on the same engine worker, scheduled by the existing
watchdog once per second; this is not a delivery-latency guarantee. Its queue and
execution time/overruns are included in existing worker metrics. No native
mutation, token refresh, Firebase call, stale authorization grant, or parallel
engine owner is introduced.

Each nonempty attempt uses one fresh local authorization batch for at most 16
remaining enrolled recipients. Final enqueue still checks the original token
expiry and current attempt's budget. Replaced/disconnected/explicitly rejected
enrollments are discarded. Generic SQL errors and known local/expiry denials
still remove recipients. Full-time snapshots remain available even after active
match discovery no longer includes the match.

The FIFO is capped at 64 pending publications and 4 Mi UTF-16 code units of
retained serialized payload (including conservative reservation for each optional
transcript cache), plus bounded recipient metadata. Overflow explicitly sends
unavailable and removes affected enrollments. Pending entries then prune those
enrollments on the next control task. There is no unbounded task-per-recipient
scheduler or indefinite silent loss. A sustained worker stall still delays all
work, as documented by ADR 0006.

## Validation

Independent standards and spec follow-ups both **APPROVE**, with no remaining
actionable findings. Standards review found and prompted a fix for ordinary
gameplay re-enrollment dropping deferred chat: a socket enrollment identity now
survives same-session/match/audience refreshes, while state still yields to a
newer direct load. Removal, disconnect or switching breaks continuity. Both
continuity and leave/rejoin regressions pass. Reviewers ran no builds or tests.

- Focused catch-up/transport/timing/transcript suite: **75 tests passed**, no skips,
  failures or errors (`.tools/pr518-catchup-focused-r4.log`).
- Initial focused run exposed publication timing omitting send-failure cleanup;
  timing now wraps the central attempt, and the unchanged timing regression passes.
- Browser unit tests: **530/530 passed** (`.tools/pr518-catchup-browser-unit.log`).
- First full verification attempt: **785 server tests, zero assertion failures,
  one error, thirteen opt-in skips**. The strict cold loopback Firebase fixture
  exceeded its I/O allocation while the browser gate ran concurrently
  (`.tools/pr518-catchup-verify.log`). The same fixture timed out in the prior
  revision round. No timeout limits or source were changed; the complete clean rerun below passed after browser/image validation finished.
- Complete browser gate: **82 suites passed**, fixed source `f612e634e`,
  **723.8 seconds / two workers**; original reports in
  `.tools/validation/local-browser-4572xc`. TypeScript/Vite and hosted assembly passed.
- Full non-quick dev-local startup passed schema/ADC health, initial/reconnect auth
  and proxy gates; the computer service is ready. Linux image build ran **785
  server tests, zero failures/errors, thirteen expected opt-in skips**.
  Evidence: `.tools/pr518-catchup-dev-local.log`. No `PERSISTENCE_FAILED` entry
  occurred in this startup's application log and the computer error log is empty.
  The earlier startup warning remains historical evidence, not an explained fix.
- First live smoke timed out awaiting initial team-builder `Connected`
  (`.tools/pr518-catchup-ui-smoke.log`). A redacted authentication-only probe
  passed **9/9 sign-ins** with explicit `ACCEPTED` responses. A temporary copy of
  the full driver with redacted failure diagnostics passed **seven play decisions**;
  it was removed afterward. The original unchanged driver then passed **ten
  play decisions and zero invalid live projections**, including real Firebase
  authentication, native movement/block, escaped chat, spectator convergence,
  wrong-coach/spectator/stale/fabricated rejection, reconnect, save/agree/resume
  and route confirmation. These are bounded smokes, not full-match acceptance.
  Evidence: `.tools/pr518-catchup-auth-probe.log`,
  `.tools/pr518-catchup-ui-diagnostic.log`, `.tools/pr518-catchup-ui-smoke-r2.log`.
  No source or timeout limit changed between attempts. The initial connection
  wait remains unreproduced; successful reruns do not establish its cause.
- Clean `tools/target-build.ps1 verify` rerun: **1,096 tests** (19 common,
  785 server, 292 native), **zero failures/errors, twenty expected opt-in skips**,
  **17:32**, fixed runtime source `f612e634e`. The unchanged strict cold loopback
  fixture passed. Evidence: `.tools/pr518-catchup-verify-r2.log`.
- Combined genuine provider/JDBC boundary: **84 tests, no skips/failures/errors**,
  including actual Google Firebase + MariaDB, actual sixteen-socket delivery,
  0/1/16-target SQL counts, transport cancellation, breaker, session rejection,
  publication and transcript checks. Actual cold authentication **653 ms**,
  refresh **238 ms**, late-lock rejection **1,855 ms**, clamped JDBC allowance
  **692 ms**. Evidence: `.tools/pr518-catchup-real-provider-jdbc.log`.
  A legacy PowerShell 5 launcher initially treated the informational JVM stderr
  banner as a launch error before tests ran; the existing helper ran correctly
  under PowerShell 7. No product change was needed.
- Matched real Firebase/MariaDB/native profiles: **16 tests passed per process**,
  with identical explicit SDK/loopback and real-provider/JDBC warm-up before
  the native profile, existing pool enabled, matching native fixture digests,
  separate native warm-up, **800 reads / 200 actions / 21 forced provider misses**
  each. Healthy-action p99: **64.53 / 74.41 ms** for zero/fifteen passive targets;
  read p99: **30.16 / 26.97 ms**; maximum publication **0.18 / 16.71 ms**.
  All measured tasks stayed below 2,000 ms; healthy requests made zero provider
  calls and each forced miss made one. The reported local-authorization groups
  include incoming authorization (one group without fan-out, two with fan-out);
  direct JDBC tests separately prove 0/1/1 publication SQL executions.
  [Sanitized numeric evidence](2026-11-10-pr518-catch-up-measurements.json).
  Logs: `.tools/pr518-catchup-native-{0,15}.log`.

### Cold-process availability is not a steady-state result

Two standalone native-profile bootstraps failed closed at **1,115 / 1,117 ms**
(three HTTP calls, two responses) before producing a profile. The diagnostic JVM
that first ran the genuine provider/JDBC test also failed its first operation at
**1,122 ms** (two calls, one response), then passed its subsequent native profile
(action p99 **64.75 ms**). That diagnostic suite is **not** counted as a passing
validation run. First-use SDK overhead is a contributor hypothesis, not an
established root cause. The final profiles intentionally use the same explicit
SDK warm-up sequence and make **no cold-process availability claim**.

These failures remain in `.tools/pr518-catchup-native-0-first.log`,
`-0-second.log`, and `-0-provider-warmup.log` (with the diagnostic numeric output
retained separately). No provider deadline, retry/backoff policy or product code
changed. No runtime retry was introduced; the only runtime retry added by this
revision is locally authorized publication catch-up. Successful steady-state
profiles do not erase these observed first-authentication rejections. Cold
startup can reject an identity when its whole admitted operation exceeds the
allocation; the accepted fail-closed policy remains in force.

## Delivery

Implementation and regression commit: `f612e634e`. Both independent review axes
approved. Subsequent changes are validation reports only; runtime source remained
identical throughout the successful browser, clean verification and live runs.
Dev-local is ready at `http://localhost:5000/play`. The isolated synthetic JDBC
fixture is stopped after validation; its data volume and the dev-local stack are
preserved. PR #518 remains unmerged; no remote deployment was performed.
