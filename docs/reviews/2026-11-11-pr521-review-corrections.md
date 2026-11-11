# PR #521 review corrections and validation

Review source: [PR comment](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/521#issuecomment-6785524612). This report supersedes the initial direct-review conclusion in the [delivery report](2026-11-10-slice-4-post-implementation.md).

## Review dispositions

| Finding | Correction / evidence |
|---|---|
| Standards 1: import ordering | Project/core imports grouped and sorted in touched production and test files. |
| Standards 2: inline qualified classes | Explicit imports replace the new inline List/Map/collections/LongSupplier/Writer usages. |
| Duplication / names / constants | Shared LobbyReadBatch and LobbyReadQuery; codec owns envelope preflight; admitLobbyRead/checkStructure/consumeCopyBytes and named structural/response bounds. |
| Cohesion / delegation | One LobbyReadBudget retains counters with the same per-page lifetime. Test-only browseState was removed and its tests use the batch path. browseDocument is used for preparation expiry; browseDocuments is the application boundary for lobby document facts. |
| Spec 1: invalid entry fails page | Missing/malformed public state, corrupt journals and oversized stored records affect only that entry. SQL excludes oversized records from the eligible aggregate and returns length metadata before driver allocation. Per-match journal overflow sentinels preserve neighboring entries. Actual page work exhaustion remains RATE_LIMITED; SQL/auth/request failures retain their codes. |
| Spec 2: coalescing ignores fields | Coalesce equal type and fields; queue distinct cursors/detail modes with independent IDs and ordered same-type dispatch. |
| Spec 3: permanent cooldown | ACCEPTED clears the deadline and all existing timers, then releases deferred reads without duplicate sends. |
| Spec 4: deadline path | Regression uses BrowserMatchSocket.onText -> BrowserMatchTransport timing -> adapter -> repository batch. An exhausted real worker budget returns correlated RATE_LIMITED with zero repository finds. |
| Spec 5: deterministic limiter tests | Same-clock alternating browse/currentMatches, exact refill, independent connection buckets and exhausted-bucket disposal on disconnect/reconnect. |
| Spec 6: measurement admission confound | Fresh baseline/integrated captures use a 2,000 ms minimum interval and require both healthy lobby reads ACCEPTED. Admitted/rejected read distributions remain separate; all outcomes/tasks remain visible. |
| Spec 7: #507 inclusion | Both runtimes include actual option A through merged PR #518 (53655f62f), including final notice-budget correction eb1d1dbe3. Both are ancestors of baseline d3dabde260. |
| Spec 8: unrelated error semantics | Non-throttle errors retain role=alert and prior reconnect copy; only RATE_LIMITED is a polite status. |

## Standards

Independent standards reviewer: "No actionable standards findings in e717a5caa..63d43b8f3." Reviewed production changes and affected tests; no validation run by the reviewer.

## Spec

Independent spec review initially found an existing-timer cooldown gap and insufficient receive-path coverage. Both were corrected and reviewed again: "No remaining actionable spec findings in the follow-up diff." Separate cadence/accounting review: "No actionable findings in the measurement correction." All compilation/execution evidence below belongs to the implementation validation, not the reviewers.

## Revision and validation boundaries

- 63d43b8f3: #508 invalid-entry isolation, exact request queueing, standards corrections and regressions.
- e4d1f814b: #508 existing-timer release and production socket receive-path regression.
- 2979a047d: correct the receive test's ServerCommunication import; passing focused execution validates it.
- 8eddbff3f37b0b13d1abdd4f552075fa8cc732af: separate #39 cadence/accounting correction, reviewed harness overlay and final measured revision.
- Subsequent commit: reports/evidence/tracking only. No measured runtime or harness changes.

The first #508 full verify attempt failed after 839 common/server cases with two errors: the existing Firebase cold verification test and the JDBC trickle fixture's peer-completion timeout. The JDBC test passed the focused recheck and the combined full run. The strengthened socket receive regression passed in the focused and combined runs. An intermediate test compilation failed on an incorrect ServerCommunication import; that test-only import was corrected before final validation.

Final full pinned tools/target-build.ps1 verify on 8eddbff3f **FAILED**, with 19 common cases and 820 server cases (one Firebase error, 15 gated/skipped server cases). Maven stopped before ffb-statetest. The entire state-test module was then run with all 53 fully qualified test class selectors through the pinned script; 292 cases, zero failures/errors and 7 explicitly gated/skipped. Together these cover 1131 cases with 1 error and 22 explicit gated/skipped cases. This is not a passing full verify.

The remaining error is FirebaseOwnedTransportCandidateTest.coldUserAndServiceCredentialsVerifyThroughRealDnsTlsOAuthAndRevocationWithinOneAllocation. A focused repeat failed, and the exact test also failed on unchanged baseline d3dabde260 with a provider DNS/allocation timeout. Root cause remains undetermined; baseline reproduction does not certify the control or excuse the failure. No test deadline, dependency bound or assertion was relaxed. This comparison localizes the unresolved failure outside the lobby correction diff. Earlier successful verification evidence remains historical and is not substituted for this failed run.

Final browser units: 538 passed; production build and lobby (1440/390px), lifecycle and reconnect checks passed. Summarizer accounting: 3 passed. Real MariaDB mixed-page regression: passed (100 memberships, three UNAVAILABLE entries, 97 healthy states; fixed data-query bounds and no native activation). Early sandbox compilation repeatedly failed closing a readable cached Netty JAR; owner-context compilation worked, and all final native validation used that context. No cache or permission settings were changed.

## Startup and measurement

Dev-local restarted successfully on the frozen revision via node tools/dev-local.mjs --restart --quick. Quick mode skips test execution; the separate validation failures above remain failures. The server reported Browser V2 running on port 22227, proxy initial/reconnect authentication checks passed, and the existing SLF4J no-provider warning selects its no-operation logger. PowerShell wraps the Docker informational Picked up JAVA_TOOL_OPTIONS stderr line as NativeCommandError; this is not an application exception. No unexplained startup error remained.

Corrected baseline and integrated captures: passed with matching harness/seed hashes, complete worker timing and owned-schema/transport cleanup. Healthy all-task p99: 1421.743 ms baseline -> 830.027 ms integrated. Every healthy read was accepted (24 currentMatches + 24 detailed browse per run), replacing the old 407.440 -> 207.406 ms mixed-admission comparison. No causal or capacity claim follows from the old result. The healthy 100 ms target fails. All-phase maxima were 1743.114 ms baseline and 1321.463 ms integrated; no task exceeded 2,000 ms. [#520](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/520) retains performance investigation without target relaxation.

Exact revisions, configuration, admitted-read/action/full-task distributions, CPU/RSS/heap, error outcomes, connection counts, recovery/outage/completion results and cleanup are in the [updated operating-envelope report](../specs/engine-worker-concurrent-match-envelope-outcome.md). Numeric evidence is under [the corrected capture directory](operating-envelope-2026-11-11-review/). Old captures remain separately archived. Local complete logs use the .tools/pr521-* prefix; the checked-in validation artifact includes outcome excerpts and log hashes.

## Remaining limitations

The workload still has 32 resident matches with 16 admitted sockets and one actively played match at a time. The engine runs in a host JUnit JVM with a shared local MariaDB container; there is no container-sizing, maximum-throughput or hardware-general claim. The SDK outage double does not cover the real DNS/TLS cold path whose validation remains failing. Slow delivery uses a controlled callback, recovery uses application rehydration rather than process death, and expiry sweeps do not arrange a pending native reactive decision. Three short repetitions and a single baseline/integrated pair do not establish stable tail performance across run order, caches or host contention.

PR #521 and issues #508/#39 remain open for independent review. The unresolved full-verification failure and latency target failures are not represented as satisfied requirements. No merge, deployment or admission-policy change was performed.
