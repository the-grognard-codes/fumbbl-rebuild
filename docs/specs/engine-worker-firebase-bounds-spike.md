# Slice 3: Firebase transport feasibility gate

Tracking: [#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504),
followed by [#507 option A](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507).
Base: current `main`, `031495c720549f8a68f548fa41ea477000c11dbc`.
Branch: `fix/firebase-bounds-publication-authorization`.
Decision: **gate not passed; stop before the #504 fix and #507**.
Tracker handoff: [#504 evidence and options](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504#issuecomment-6759230814),
[#507 dependency decision](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507#issuecomment-6759231133).

## Result

Supported retry suppression looks feasible. The tested deadline-aware
`HttpTransport` candidate uses the already-pinned Jetty client for underlying I/O,
but its DNS timeout leaves the JDK lookup running after the request returns.
This does not establish the required complete underlying-operation bound.
It is a failure of the tested candidate, not proof that every possible custom
transport is impossible. No production transport, breaker, authorization policy
or provider-success cache was changed.

The [request](engine-worker-firebase-bounds.md) requires: "stop provider implementation
at this gate" when the supported/custom-transport approach does not prove the
bound. ADRs 0005/0006 and the combined review retain that decision boundary.
No relaxation of the deadline, cancellation requirement or retry policy is inferred.

## Pinned dependencies and merged budget

Maven resolution against the base commit, rather than dependency-directory names:

| Component | Resolved version |
| --- | --- |
| Firebase Admin | 9.4.3 |
| google-http-client | 1.45.3 |
| google-auth-library-oauth2-http | 1.30.1 |
| google-auth-library-credentials | 1.30.0 |
| Jetty client/util | 12.1.13 |
| Validation JDK | Temurin 21.0.11+10 |

RB2 documents and slice 2/#517 are merged. The experiment consumes
`BrowserRequestTiming.budget()` and its existing 2,000 ms absolute request
deadline. Candidate admission requires a complete 1,000 ms provider allocation
plus a provisional 150 ms reserve. A test advances the shared clock by 1,000 ms
and proves admission refuses without provider work. These are spike parameters,
not approved production defaults or sufficient native/JDBC reserves.
The candidate operation deadline is nested inside the original task; it does
not replace or restart that task's deadline.

## Experiments and numeric evidence

Reproduce with:

```powershell
pwsh -NoProfile -File tools/target-build.ps1 test -Module ffb-server -Test FirebaseTransportFeasibilityTest,FirebaseV2PrincipalAuthenticatorTest,FirebaseSessionVerificationTest,JdbcRequestDeadlineTest
```

The final focused run passed **32 tests, zero failures/errors/skips**, including eight
spike experiments. Passing these characterization tests records the defects and
available seams; it does **not** mean the feasibility gate passed.
Raw local log: `.tools/slice3-spike-reviewed-focused.log`. The earlier seven-experiment
run passed 31 tests (`.tools/slice3-spike-focused.log`) before review follow-up.

| Experiment | Observation in the focused run | Meaning |
| --- | --- | --- |
| Real SDK `getUser`, synthetic HTTP 503 | 5 low-level attempts; 7,534 ms | Default SDK response backoff exceeds both budgets |
| Terminal low-level IOException | 1 attempt; 1 ms | Firebase's default authorized factory does not retry this IOException |
| Actual loopback 503 through candidate and SDK | 1 attempt; 17 ms; candidate observed status 503 | Conversion before the SDK response handler suppresses its backoff |
| Real service-account OAuth refresh, factory with failing transport | 4 attempts; 6,772 ms | `HttpTransportFactory` alone does not remove OAuth I/O retries/backoff |
| Public `createWithCustomRetryStrategy(false)` | 1 attempt; 5 ms | Supported service-account control suppresses that retry path |
| Cold signed `verifyIdToken(token, true)` with synthetic responses | key → OAuth → revocation; remaining allowances 750 → 684 → 670 ms | Both SDK and user credential factory use the same transport/one operation allocation; no three-allocation reset |
| Actual loopback HTTP body stall, Jetty candidate | 1,030 ms observed return; peer observed EOF | Actual socket is closed. The test permits scheduling overhead; this is not a certified exact 1,000 ms bound |
| Actual Jetty asynchronous resolver with isolated JDK resolver fault | request returned at 256 ms; resolver still running, interrupt observed | Timeout/interrupt does not prove termination of underlying DNS work |

The DNS experiment uses the actual pinned Jetty resolver and a Java 21
`InetAddressResolverProvider` which models a resolver that does not return on
interrupt. Its service registration exists only in a child JVM's temporary
classpath. The test explicitly releases and joins the synthetic lookup before
stopping Jetty; it leaks neither a process nor a resolver into other tests.
It proves a supported cancellation guarantee is missing at this boundary;
it does not claim a real DNS outage was induced in the operating system.

The cold verification uses a locally generated self-signed RSA fixture and real
SDK signature/claim/revocation logic with synthetic in-memory responses. It
proves routing and deadline sharing, not real Google network latency. The
loopback stall separately exercises real client I/O. A complete cold network
path, stalled TLS/write/cleanup and combined real provider/JDBC bound remain
unproven and cannot be substituted by the synthetic cold sequence.

## Public APIs and credential coverage

`FirebaseOptions.Builder.setHttpTransport` and credential
`HttpTransportFactory` are public seams. Firebase's factory methods are final
on `HttpTransport`; its low-level seam does not expose the enclosing request's
retry handlers. A candidate must prevent retryable responses from reaching
those handlers while preserving safe error classification. The spike exercises
terminal conversion but does not deliver the production status classifier.

The source confirms Firebase's default four retries of HTTP 503 and a
500/1,000/2,000/4,000 ms backoff. Initializer/retry internals are inspected only,
never invoked, reflected into or patched by the spike. See
[pinned Firebase factory](https://github.com/firebase/firebase-admin-java/blob/v9.4.3/src/main/java/com/google/firebase/internal/ApiClientUtils.java)
and [retry initializer](https://github.com/firebase/firebase-admin-java/blob/v9.4.3/src/main/java/com/google/firebase/internal/RetryInitializer.java).

User credentials and service-account credentials were constructed with the
public factory and exercised. The latter also requires the public retry clone:
[pinned service-account implementation](https://github.com/googleapis/google-auth-library-java/blob/v1.30.1/oauth2_http/java/com/google/auth/oauth2/ServiceAccountCredentials.java).
Compute-engine credentials expose a factory but were source-inspected only.
ADC discovery, metadata/universe-domain lookups, external-account/WIF,
impersonated and executable/file-sourced credential paths have **not** been
certified. A future implementation must whitelist proven credential types
and reject unsupported types before traffic rather than quietly use default
ADC refresh transport. No production ADC secrets were read by these tests.

Jetty's pinned `SocketAddressResolver.Async` schedules a failure/interrupt and
then calls `InetAddress.getAllByName`; it has no underlying resolver-close handle:
[pinned resolver source](https://github.com/jetty/jetty.project/blob/jetty-12.1.13/jetty-core/jetty-util/src/main/java/org/eclipse/jetty/util/SocketAddressResolver.java).
The JVM's resolver API exposes lookup methods without a deadline/cancellation
contract. The candidate cannot count a timed-out promise as completed DNS I/O.

## Security review and remaining deliverables

Incoming revocation verification, fixed five-second positive reuse, token expiry,
local lifecycle/scopes and failure invalidation remain unchanged. No passive-push
exception has been implemented. No bearer or real identity is retained/logged;
the fixture key has no real identity/provider permissions. Production's existing
unbounded provider dependency remains a known gap, not improved by these tests.

### Standards

Independent review found one test-cleanup issue: forced termination of the
isolated DNS child needed a bounded join. The follow-up now awaits termination
for up to five seconds before temporary-classpath cleanup. Review approved that
correction and the actual HTTP 503 experiment. The final focused selector passed
32 tests after the correction and the assertion that status 503 was actually
observed. No documented-standard breaches or remaining actionable smells were
reported. Self-review also removed a redundant scripted-transport flag.

### Spec

Independent review approved the scoped stop decision with no actionable
findings. It confirmed that the DNS counterexample is evidence against this
candidate's guarantee, while further transport approaches may still be feasible.
It verified that synthetic cold-path results and real socket I/O are distinguished
and that #507's dependency exception remains a maintainer option.

Review totals: zero remaining findings on either axis; one standards cleanup
finding fixed. Reviewers inspected the evidence without rerunning tests.

#504 deadline transport/credential wiring, breaker classification, fail-closed
regressions and real combined provider/JDBC tests are not implemented. #507's
one-query 0/1/16-target state/chat/preparation evidence, observed-rejection
subscription retirement, spectator capture and provider-outage semantics are
also not implemented. There is no timing/query or startup evidence for those
unimplemented changes and no basis for closing either issue.

Boundary validation:

| Check | Result |
| --- | --- |
| `tools/target-build.ps1 verify` (clean) | Passed in 15:40; 1,041 tests, zero failures/errors, 18 opt-in skips |
| Common / server / native totals in clean run | 19 / 730 / 292 tests; 0 / 11 / 7 skips |
| Final reviewed focused selector | 32 passed; zero failures/errors/skips |
| Browser unit tests | 530/530 passed; no skips |
| Browser TypeScript/Vite production build | Passed |
| Diff whitespace check | Passed |

The clean run compiled initial spike commit `9a15bc75d`; the final test-only
follow-up `296eb03d9` (child termination join and real 503 conversion) was
validated separately with the complete focused selector. No production source
changed between those runs. Logs: `.tools/slice3-spike-verify.log`,
`.tools/slice3-spike-reviewed-focused.log`, `.tools/slice3-spike-browser-unit.log`
and `.tools/slice3-spike-browser-build.log`.

The 18 skipped cases require opt-in MariaDB/schema, history-scaling or retained
cross-process/runtime fixtures: 11 server and seven native cases. Those results
are unverified here; no real-provider/JDBC acceptance is inferred from the clean
run or earlier slice 2 evidence. Healthy provider p99 was not measured.

Dev-local startup and authentication/gameplay/spectator/chat smoke for an
implemented slice are deferred at the failed gate. Existing slice 2 startup
results are not reused as validation of provider/publication changes.

The requested changelog update records the feasibility result without claiming
a user-visible provider fix. Existing conflict markers committed in the base
changelog were removed while retaining every entry from both sides.

## Maintainer options

1. **Continue #504 with a different transport/DNS design.** Approve an evaluated
   cancellable resolver/client dependency (or an explicitly managed/pre-resolved
   endpoint policy), then repeat this gate covering real DNS/TLS, credential
   variants, retry suppression and underlying cleanup. Retain the 2,000 ms task
   deadline; no timeout-only wrapper is acceptable. This is the narrowest way
   to preserve the requested slice order.
2. **Split #507 onto a new branch from slice 2/current main.** Explicitly waive
   its #504 dependency for independent acceptance. Use merged JDBC/budget controls
   for batched local authorization and the already-approved option A, retaining
   the existing incoming-request provider path and five-second freshness. Test
   local revocation/expiry and observed provider rejection; record the unresolved
   incoming-provider bound. Do not claim whole-runtime two-second compliance or
   close #504 in that PR.
3. **Reconsider the provider integration.** Keep SDK local JWT verification and
   use an owned bounded OAuth/revocation client, or choose a dependency revision
   with demonstrable cancellation/retry controls. This is an architecture/
   dependency decision; it must also solve key fetch and DNS, not just `getUser`.

No option is selected by this report. No fix/publication commit series, push,
closing PR, merge or deployment is performed after this failed gate. The
spike and report are retained for the maintainer decision.
