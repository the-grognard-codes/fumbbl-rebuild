# #507 option A outcome

Tracking: [#507](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507).
Prerequisite: [validated #504 provider controls](engine-worker-firebase-bounds-outcome.md),
committed separately at `c72a1b5f4` / `1ca75927a` after the accepted spike series.
Status: implemented and validated; ready for independent PR review. The historical
non-reproducing startup rejection and its diagnostic limits are recorded below.

## Behavior and security review

State, chat and preparation fan-out now request one local authorization snapshot
through `V2PublicationAuthorization`. The Firebase-backed directory delegates
directly to the underlying local directory for that operation. The default
directory implementation fails closed; it never falls back to a loop over
incoming/provider checks. No refresher, negative identity cache or passive
provider-success cache was introduced.

The JDBC implementation executes one prepared SQL statement for every nonempty
eligible target set. Its bounded input table joins current identity ownership,
identity/account lifecycle, scopes and match membership/role. One metadata row
supplies registered-match state and, when needed, the computer-seat document.
The singleton uses the startup-verified schema marker table without hard-coding
an obsolete marker value. At most sixteen target rows plus one metadata row are
read. Computer qualification preserves the existing encoded-document/coach/seat
checks, decoding one document using the existing storage bounds rather than
issuing another authorization query. Human-only batches do not fetch that body.
The conservative JDBC session-reuse policy is unchanged; complex batch reads may
close their physical session after use.

The publisher bounds enrollment to sixteen and rejects oversized target lists.
Zero targets cause zero queries. The actual transport continues admitting only
sixteen total sockets, including the origin; the publisher bound does not admit
a seventeenth socket. All database and publication work uses the originating
absolute two-second request budget. No recipient obtains a new timer/allocation.

Original token expiry is checked while building the batch and again after
recipient projection and response/optional-transcript serialization, immediately
before enqueue. The final check also rejects an exhausted request budget. Local
account/identity/scope/membership changes deny the next publication. Failures
remove unavailable subscriptions and retain the existing unavailable response;
one disconnected recipient cannot undo another delivery or an already durable
action. Public history/mandatory acknowledgement ordering and recovery paths are
unchanged.

PR review corrected budget-only exhaustion: it now skips this best-effort push
without retiring subscriptions. Admission refuses work before the batch when the
task is exhausted; typed JDBC request-allowance/deadline refusals also skip the
push. Expiry after a batch, projection or serialization prevents enqueue and
preserves valid recipients for the next publication. That next publication must
obtain a fresh local batch; no old snapshot or background retry grants delivery.
Actual local denials/database failures and original token expiry still remove
subscriptions. Existing task accounting records the overrun without new timers.

Accepted option A deliberately permits passive viewing after Firebase-only
revocation until the **existing** token expires—potentially roughly its remaining
hour. Publication neither refreshes that token nor extends its expiry or the
five-second provider-success window. An unavailable provider or expired/missing
provider-success entry alone does not prevent an otherwise locally authorized
push. Every incoming action/read/chat/edit and reconnect retains ordinary
provider checks and ADR 0005's fixed five-second reuse.

Retirement after SDK `TOKEN_REVOKED` during initial authentication is intentionally
limited to matching sessions whose authentication time is at or before the
rejected token's. The SDK rejection supplies no revocation timestamp. Later
sessions, including any that might also be revoked, retain option A's existing
token-expiry bound until their own incoming check observes rejection. When
`getUser` supplies `tokensValidAfterTimestamp`, retirement uses that actual cutoff;
disablement/not-found retires all matching identity subscriptions. Guessing a
broader cutoff could remove valid sessions authenticated after revocation.

Explicit incoming provider disablement/not-found/revocation emits a transient
trusted observation that removes matching live/chat and preparation subscriptions.
Its provider identifiers have no transport getters or serialization. Disabled/
missing users retire identity sessions; timestamp revocation preserves newer
authentication. Credential/key failures, throttling and availability failures
cannot impersonate a lifecycle rejection. HTTP lifecycle codes are accepted only
from the identity lookup endpoint's expected denial statuses; other provider
responses are not retirement observations.

Initial authentication preserves locally signature-verified metadata **inside**
the admitted operation before the unchanged `verifyIdToken(bearer, true)` check.
That metadata never grants authority: revocation and local checks must still pass.
It lets an observed rejection retire a session even when a short-lived signing-key
response prevents post-operation key reuse. A real SDK `max-age=0`/disabled-user
regression proves this four-call path stays inside one allocation.

The real UI smoke exposed inherited spectator leakage of actor-only
`savedFormations`; independent review identified `blockPreview` too. Broadcasts
now exclude both, alongside private computer context and acting-coach threats,
while preserving the source projection. The real-browser driver was updated for
the current roster-validation message and canonical actor-only formation controls;
its strict per-recipient projection validation remains enabled.

Independent standards/security and spec reviews approved after fixing the schema
marker mismatch, short-key-cache retirement, expiry during projection and
spectator control leakage. These findings and their fixes have regressions.

## Query, socket and timing evidence

[Sanitized measurements](../reviews/2026-11-10-engine-worker-slice3-measurements.json)
contain numeric distributions, matched fixture digests and source-data hashes;
no tokens, provider identities or private game state are included.

- Actual MariaDB tests exercise **0 / 1 / 16** targets for **each** state/chat/
  preparation family: **0 / 1 / 1** authorization SQL executions respectively.
  They cover binary-case identity ownership, local disablement/revocation/scope
  and membership changes, role refresh, expiry before/during the query, encoded
  computer qualification and corrupt-document denial.
- A real loopback Jetty/WebSocket test uses sixteen total sockets: two coaches,
  twelve spectators and two preparation connections. With the origin occupying
  a socket, it delivers thirteen state/chat pushes and one preparation notice,
  executing one local authorization query per nonempty family. It rejects the
  seventeenth connection with 1013 and releases all permits after disconnect.
  This network case uses an incoming-provider-check double; its call count proves
  fan-out adds no checks. The native profiles below use actual Firebase instead.
- Matched actual DEV Firebase + MariaDB + native-engine profiles each include
  800 reads, 200 accepted actions and 21 forced provider misses, with identical
  persisted fixture digests and separate warmup. Both enable the existing bounded
  JDBC session pool (`JDBC_BOUNDS_POOL=true`). The in-process single owner
  uses the real request-budget context and a counting delivery sink; the socket
  test separately exercises actual asynchronous network delivery.

| Complete worker measurement | No passive recipients | Fifteen passive recipients |
| --- | ---: | ---: |
| Healthy read p99 | 31.97 ms | 31.62 ms |
| Healthy action p99 | 77.63 ms | 88.54 ms |
| Maximum publication | 0.08 ms | 17.00 ms |
| Maximum forced-provider-miss task | 345.36 ms | 366.96 ms |
| Provider lookups per healthy action | 0 | 0 |
| Provider lookups per forced miss | 1 | 1 |

All measured requests, including warmup, stayed below 2,000 ms. The healthy
100 ms p99 target passed for these workloads. Remote provider misses remain a
separate population; the measurements do not claim all internet calls complete
within 100 ms. The first fifteen-recipient bootstrap hit a real provider deadline
and correctly rejected at 1,113 ms (three attempts/two responses); that failed
run is retained, and a new standalone run completed. No worker retry was added.

## Validation and startup

The focused boundary passed **62 tests, no skips/failures/errors**, including
actual Firebase/JDBC late-lock controls, the actual socket/batch tests, all fan-out
families, final expiry/retirement, credential/key regressions and transcript
ordering. Evidence: `.tools/slice3-publication-real-jdbc-final-r2.log`.
Matched native runs: `.tools/slice3-real-native-{zero,fifteen-r2}.log`; raw numeric
data remain in the corresponding ignored JSON files.

Clean `tools/target-build.ps1 verify` passed in 15:30 at `488412390`: **19 common,
770 server and 292 native tests (1,081 total)**, zero failures/errors and twenty
expected opt-in skips. The genuine provider/JDBC tests above ran separately.
The first clean attempt exposed an old native test fixture that still supplied
only per-recipient incoming authorization stubs. Its explicit batch-authority
double was corrected in a test-only commit; its five regressions and the entire
clean rerun passed. Evidence: `.tools/slice3-publication-verify-r2.log`.

Browser unit tests passed **530/530** and the TypeScript/Vite build passed in
`.tools/slice3-publication-browser-{unit,build}.log`.
The first complete 82-suite browser run passed its assertions but correctly
failed the final provenance gate: a test-fixture commit changed HEAD between
groups. During the affected-group rerun, the unchanged coach-HUD test exposed a
race between its immediate DOM assertion and the acknowledgement-driven React
effect. An isolated run reproduced it; a targeted probe verified one send and
eventual composer removal. The test now waits for actual DOM detachment while
retaining its original assertion. No frontend product behavior changed. The
isolated corrected suite passed. A fresh complete gate then passed **all 82
interaction/hosted suites at frozen commit `604a884c8`**, in **636.6 seconds with
two workers**. Reports: `.tools/validation/local-browser-w2h7QP`; full log:
`.tools/slice3-publication-dev-local-r3.log`. The formerly load-sensitive idle
panning test recorded zero HUD rectangle reads. Failed evidence is retained in
`.tools/slice3-publication-dev-local{,-r2}.log` and
`.tools/slice3-publication-coach-hud-{rerun,probe,fixed}.log`.
Full, non-quick dev-local startup passed after that gate: the Linux image build
ran all 770 server tests (zero failures/errors, thirteen expected opt-in skips),
the schema/ADC checks passed, and Hosting/proxy/computer services started at
`http://localhost:5000/play`. Initial-connection and reconnect authentication
gates both returned the expected rejection without submitted credentials.

The first startup emitted one generic `PERSISTENCE_FAILED` while loading a
retained computer match; its existing daemon retry recovered both retained
matches. The application log did not record the underlying exception, so the
original cause is **not established**. Two subsequent cold JVM restarts of the
same validated image, with existing timing diagnostics enabled, produced no
additional load rejection. Their slowest retained loads took 1,693.94 and
1,527.19 ms, including 1,529.44 and 1,446.10 ms of native recovery. Subsequent
loads took about 20–25 ms. Queue wait was recorded separately. These observations
do not prove the earlier failure's cause or eliminate ADR 0006's cold native/CPU
residual risk. No production code, stored data or timeout was changed to obtain
the successful restarts. Private evidence: `.tools/slice3-cold-start-timing{,-r2}.log`
and `.tools/dev-local-computer{,.err}.log`. The final local instance retains
timing diagnostics for inspection; the next normal startup uses its usual default.

The first rebuilt three-party UI smoke passed real DEV authentication, saved-team
validation, coach/spectator convergence, escaped durable chat, reconnect,
wrong-coach/spectator/stale/fabricated-request rejection, save/agree/resume and a
confirmed native route. Seven measured play decisions included a block and
movement; strict live projection validation reported zero invalid projections.
This is a bounded gameplay smoke, not full-match UI acceptance. Evidence:
`.tools/slice3-final-ui-smoke.log` and its private evidence directory. The repeat
against the final diagnostic-started instance also passed with seven play
decisions and zero invalid projections:
`.tools/slice3-final-ui-smoke-r2.log` / `.tools/slice3-final-ui-smoke-r2`.
A snapshot of 170 instrumented requests from that final instance had maximum
handling time 1,527.19 ms and zero executions over 2,000 ms; this includes the
retained cold loads, and is not a claim about the earlier uninstrumented failure
or uninstrumented request types. The final server is healthy, both retained
computer matches load successfully, and the rejection count remains one from
the first startup. Isolated synthetic database validation services were stopped;
the ready dev-local stack and its data remain available.
