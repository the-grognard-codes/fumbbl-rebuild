# #508 lobby read bounds outcome

Tracking: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/508

Base: `d3dabde26026654930768bf18799777d84b5d589` (merged RB2 and slices 1-3).
Implementation branch: `fix/lobby-read-bounds-envelope-508-39`.

The adapter validates supported request shapes before charging a shared per-connection two-token bucket. Its monotonic refill adds one token per 2,000 ms, capped at two. Disconnect and replacement dispose the bucket. There is no fallback exemption: rejected shapes perform no expensive read and do not charge a token. Accepted initial browse/currentMatches consume the two-token burst. Exhaustion still refreshes authorization and returns a correlated `RATE_LIMITED` without document/checkpoint access.

An authorized page uses one prepared-document query and at most two recovery data queries (checkpoint plus journal), independent of its entry count. Recovery uses one repeatable-read transaction, with fixed transaction-control overhead; no lock-per-match or generation-per-match query is added. This is two repository connections plus the pre-existing bounded authentication/membership work. A preparation liveness check can add one fixed membership/document read; it does not grow with page size.

Each page retains the existing maximum 100 entries, order, membership filtering, completion filtering, fields and cursor semantics. A vanished, corrupt or oversized stored entry retains its membership and becomes unavailable. Actual storage failures and request/authentication validation failures retain their genuine page-level codes. No partial success is returned for an exhausted budget. Pre-call JDBC `NotStarted` and explicit page/bucket exhaustion return `RATE_LIMITED`; actual JDBC failures retain `PERSISTENCE_FAILED`. Native sessions are neither restored nor mutated for a lobby summary.

## Bounds

- The existing absolute 2,000 ms worker deadline includes authorization. Read admission/checks retain 50 ms for response/cleanup; JDBC retains its existing 150 ms work/cleanup reserve and dynamically clamps connection/statement/transaction timeouts.
- At most 2 MiB encoded and decoded per record, 16 MiB aggregate encoded and decoded per page. SQL window sums suppress oversized non-null columns before the driver materializes result strings. Bounded character reads and declared decompressed lengths reject before decoding/allocation. Record-size/nesting failures mark only that entry unavailable. Aggregate page/deadline/response exhaustion fails the entire request with RATE_LIMITED.
- At most depth 128 and 500,000 structural parse tokens per page, with deadline checks every 4,096 characters and between entries. Journal reconstruction has a separate aggregate 16 MiB copy-work allocation accounting for every accumulated entry, with the existing 32-entry journal limit.
- Response preflight uses a bounded writer (85,000 UTF-16 units, conservatively at most 255,000 UTF-8 bytes) before normal serialization. CPU/native work remains non-preemptible; these allocations supplement measurement rather than promise timer preemption.
- Browser reads coalesce only when request type and fields match; different cursors/detail modes retain separate request IDs and queue behind the same read type. After throttling the shared cooldown starts at 2 seconds and doubles to 30 seconds on repeated throttles. Queued read types are spaced by at least 2 seconds. Acceptance resets the backoff delay. Queued reads retain their shared refill deadline, and the cooldown clears after the queue completes; no failed read automatically starts a retry. Disconnect cancels deferred sends. Poll/manual refresh remains available, and throttling preserves successful lists, filters, selected board and uncertain intent.

## Lane decision and preliminary capture

Use the existing advisory lane for both lobby read types. Gameplay receives foreground priority while advisory admission, FIFO order and the existing fairness burst remain unchanged. This changes scheduling only: it cannot interrupt a running read.

The real MariaDB page capture at 1 and 100 nonresident entries uses Connector/J 3.5.8, fresh bounded connections, journal-enabled recovery and the current parsing/serialization path. Twenty measured repetitions follow one separately recorded warmup for each size. Data: [numeric capture](../reviews/2026-11-10-lobby-read-measurements.json).

| Entries | Samples | execution p50 / p95 / p99 / max (ms) | Repository connections | Data queries |
|---|---:|---|---:|---:|
| 1 | 20 | 19.733 / 22.912 / 24.737 / 24.737 | 2 | 3 |
| 100 | 20 | 148.941 / 176.648 / 191.075 / 191.075 | 2 | 3 |

The lane probe queues eight maximum-page reads before one native state projection on the real transport selector and a single-owner pump. The projection completed after 1,043.720 ms with forced foreground reads, versus 3.278 ms with advisory reads. The probe uses real SQL/JSON work but a controlled queue pump, not network end-to-end gameplay. It supports the lane decision; it does not certify the operating envelope.

The maximum-page healthy p99 **fails** the 100 ms target. No warm sample exceeds the approximately 250 ms investigation threshold; all measured page executions are below 2,000 ms. Full authorized gameplay/read traffic, real recovery artifacts, outage behavior and all-task timing belong to the separately validated #39 capture. These narrow scalar-checkpoint fixtures cannot establish those claims.

## Review and validation

Self-review corrected swallowed budget/storage errors, driver-side materialization before limits, per-record versus aggregate journal copy work, and persisted match-ID validation at the new batch seam. Existing private document authorization remains in force. Tests explicitly cover bucket/refill boundaries, malformed fallback, alternating initial reads, cleanup/reconnect, rejection correlation, storage classification, 1/100-entry fixed query counts, byte boundaries and compressed expansion admission.

Browser unit tests: 535 passed. Browser production build: passed. Lobby smoke checks at 1440px and 390px retain data/filter and bound subsequent sends with no reconnect loop. Existing preparation lifecycle smoke: passed. Diagnostic test fixtures now finish initial browse before measuring another refresh, matching coalescing semantics.

Dev-local startup: successful using `node tools/dev-local.mjs --restart --quick`; Java/browser validation is performed separately. Server output: `Browser V2 running on port 22227`; the existing SLF4J missing-provider warning selects its documented no-operation logger. Proxy live checks passed. Startup logs remain in `.tools/lobby-dev-local-startup.log`.

The first real-driver fixture run rejected schema version 7 for journal mode; the fixture now starts at version 8 and applies migration 009 to reach 9. The capture passes and its owned `ffb_lobby_read_test` schema is removed in `finally`.

Final pinned clean verify passed on 2026-11-10 at 17:27:18 -05:00 (14m47s), using Temurin 21.0.11+10-LTS and Maven 3.9.9. The early capture was taken from a working tree based on the revision above and is retained as preliminary evidence. Final acceptance uses the exact-revision recapture below. Subsequent #39 harness and report changes are separately committed. No integrated-envelope claim is made by this validation boundary.

The initial follow-up bounded journal SQL to `page entries * 32 + 1` rows. PR #521 review corrected this to at most 33 rows **per match** (`page entries * 33` overall), including one per-match overflow sentinel. Excess/corrupt history marks that entry unavailable while preserving healthy neighbors and membership; ordinary recovery still reports RECOVERY_CORRUPT. Read-only batch transactions commit after isolating invalid entries. The fixed two-query recovery bound remains unchanged.

## Earlier exact-revision recapture (superseded by PR review corrections)

Runtime/harness revision: `df59449552756399e5c4ed766ba81557a118e987`. The journal driver row-limit correction is included. [Final numeric capture](../reviews/2026-11-10-lobby-read-final-measurements.json). Twenty measured repetitions follow a separately recorded warmup at each size.

| Entries | Execution p50 / p95 / p99 / max (ms) | Document phase p99 | Recovery/parse p99 | Serialization p99 |
|---|---|---:|---:|---:|
| 1 | 25.625 / 29.756 / 47.387 / 47.387 | 14.790 | 33.166 | 0.208 |
| 100 | 204.906 / 232.861 / 294.050 / 294.050 | 266.442 | 28.327 | 0.360 |

The native projection completed after 1542.915 ms with eight forced-foreground reads and 3.383 ms with advisory reads. The advisory decision remains supported; it cannot preempt a running read.

The 100-entry page p99 **fails** 100 ms; 1 of 20 samples exceed 250 ms, and 0 exceed 2,000 ms. Document loading/validation dominates the largest sample, while query counts remain fixed. This is a performance follow-up, not a passing target claim. The integrated full-authorization/native workload is reported separately in the [#39 outcome](engine-worker-concurrent-match-envelope-outcome.md).

Final validation: pinned clean verify passed at 2026-11-10 19:00:45 -05:00 (16m48s): 1,126 tests, zero failures/errors, 22 explicitly gated/skipped cases. Browser: 535 tests, build, desktop/mobile lobby, preparation lifecycle and reconnect checks passed. Opt-in real MariaDB and integrated captures were run separately.

[Performance follow-up #520](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/520) records the missed healthy latency target without relaxing ADR 0006.

## PR #521 review corrections

The review identified a lifecycle regression and client request/cooldown issues. The corrected path distinguishes invalid records from aggregate resource exhaustion. JDBC length metadata suppresses oversized records before driver allocation without charging them against the eligible-page window sum. Corrupt journal chains are isolated per match. Missing or malformed public views produce no scalar facts for that entry. A real MariaDB mixed-page regression retains 100 ordered memberships, marks the three affected entries UNAVAILABLE, preserves 97 healthy states, and accepts both currentMatches and detailed browse.

The client queues distinct cursor/detail requests, coalesces exact requests, and retains queued refill timers when an earlier read is accepted. The cooldown clears once the queued reads complete. Non-throttle errors retain alert semantics and the prior reconnect copy. Deterministic tests cover alternating read types, exact refill and disconnect cleanup. The deadline regression enters through BrowserMatchSocket.onText and BrowserMatchTransport rather than creating a timing scope manually.

The review also corrected import organization/inline qualified names, extracted shared default-batch and SQL projection/binding logic, restored codec-envelope ownership, named bounds and clarified admission/copy-work names. The single-entry browseState path had only test callers and was removed; those regressions now exercise browseStates. browseDocument remains necessary for preparation expiry; browseDocuments remains the application boundary for lobby document facts. LobbyReadBudget intentionally owns related counters for one page, with one lifetime and fail-closed budget classification.

## Corrected-source capture and validation

Revision `8eddbff3f37b0b13d1abdd4f552075fa8cc732af`. [Numeric page capture](../reviews/2026-11-11-lobby-read-review-measurements.json).

| Entries | N | Execution p50 / p95 / p99 / max (ms) | Document p99 | Recovery/parse p99 | Serialization p99 | >250 ms / >2,000 ms |
|---|---:|---|---:|---:|---:|---:|
| 1 | 20 | 68.156 / 163.004 / 164.975 / 164.975 | 101.466 | 101.063 | 0.251 | 0 / 0 |
| 100 | 20 | 373.481 / 521.325 / 695.617 / 695.617 | 487.775 | 233.202 | 1.204 | 18 / 0 |

The real-driver scenario also validated the mixed invalid-entry page. Query counts remain two repository connections and three data queries, plus fixed transaction controls. [Current review/validation](../reviews/2026-11-11-pr521-review-corrections.md) records passing lobby/browser/native-state checks and the failing full verify Firebase case, reproduced on baseline; earlier successful verifies are historical. The [corrected #39 comparison](engine-worker-concurrent-match-envelope-outcome.md) uses equal admitted read work.

The historical page tables were captured in different sessions and describe their respective runs. The reviewer repeated the narrow test four times per revision within one session, in old/new/new/old/old/new/new/old order. Median per-run 100-entry p50/p99 were 340.1/519.2 ms on df5944955 and 352.4/526.6 ms on 8eddbff3f, with overlapping p99 ranges of 450-662 and 407-593 ms. Recovery/parse p50 medians were 45.1 and 49.8 ms. The reviewer withdrew the code-regression finding. These figures are attributed to the reviewer's rerun, whose summary is recorded in the [PR correction](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/521#issuecomment-6787389313).
