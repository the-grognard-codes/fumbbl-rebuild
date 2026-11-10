# Slice 3: provider bounds and publication authorization

Tracking: [#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504),
[#507](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507).
Branch: `fix/firebase-bounds-publication-authorization`, from current main
`031495c72` after RB2 and slice 2 merged.
Status: implementation and independent security/spec review passed;
final validation/startup handoff in progress. No merge or deployment performed.

The [continued feasibility spike](engine-worker-firebase-bounds-spike-2.md)
passed before production work, following the initial candidate's recorded failed
gate and the maintainer's authorization to continue. Public pinned SDK seams plus
owned cancellable DNS/TCP proved cold keys, credential refresh, revocation,
retry suppression and physical cancellation. The accepted spike has its own
commit/clean-build/browser validation boundary.

The [#504 outcome](engine-worker-firebase-bounds-outcome.md) records the separate
production series (`c72a1b5f4`, `1ca75927a`), measured 1,200 ms provider allocation,
shared absolute two-second deadline, supported credential factories, outage
breaker, fail-closed/cache semantics, real Firebase/JDBC evidence and successful
dev-local startup. Its clean validation passed 1,071 tests plus browser unit/build
and all 82 browser suites.

The [#507 outcome](engine-worker-publication-authorization-outcome.md) records
approved option A, one actual local authorization query per nonempty fan-out,
zero provider work during fan-out, sixteen-target/socket bounds, original-token
expiry and observed-rejection retirement. It documents the accepted passive
revocation exposure and the spectator privacy corrections found during real UI
validation and independent review.

[Matched sanitized evidence](../reviews/2026-11-10-engine-worker-slice3-measurements.json)
shows actual Firebase/JDBC/native workloads with zero versus fifteen passive
recipients: healthy action p99 77.63 versus 88.54 ms, publication maximum 17 ms,
one provider lookup per forced miss and none per healthy action, with no measured
request overrun. Actual SQL and sixteen real-socket tests provide separate
query, transport/queue and cleanup evidence.

The revised requests were linked before implementation:
[#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504#issuecomment-6758906276),
[#507](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507#issuecomment-6758906523).
Final clean/build/browser/startup/smoke results and the security-focused review PR
will be added after they are observed. The PR will close both issues on merge;
neither issue is closed independently while review remains outstanding.
