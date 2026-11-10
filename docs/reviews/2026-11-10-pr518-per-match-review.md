# PR #518: per-match catch-up revisions

Review baseline: `99757be40544facb617f570f68e8136b206e517c`. This report supplements
[the previous catch-up review](2026-11-10-pr518-catch-up-review.md); its historical
validation and failures remain recorded there. No merge or deployment is performed.

## Comment dispositions

1. [Global pending queue blocks healthy matches](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4527380230): **accepted**. Ordering is now per match. New publications attempt immediate delivery when their own match has no backlog. Retry visits each queued match once, draining its ordered publications until deferral or deadline exhaustion. Deferred matches rotate behind peers; a match consuming the entire control budget cannot always be first on the next tick.
2. [Obsolete states exhaust retention](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4527380403): **accepted**. New full states replace all older pending states for that match and are appended after retained chat. The publisher covers all current viewers except the source, which has already received its direct state response. Removed or refreshed state enrollments are independently invalidated. Transcript space is reserved only when a target enables live transcripts, or for a frame already loaded for the source. The global 64-publication/4-Mi-character and 16-target bounds remain unchanged.
3. [Repeated obsolete projections](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4527380598): **accepted**. One hundred queued revisions now produce one local batch and one player projection, with the spectator receiving revision 100. Optional intermediate transcript frames use existing paged catch-up.
4. [Re-watch drops chat](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4527380807): **rejected as factually incorrect for this revision**. `receive` initializes `principal` from `principals.get(connection)`. Every earlier branch that replaces the local variable returns before `watch`; the watch path therefore already passes the stored socket principal. `spectatorSnapshot` performs incoming reauthorization without replacing that stored object. A new adapter-level regression makes reauthorization return a fresh object, queues chat, re-watches, attempts same-socket reauthentication, and then delivers the retained chat exactly once. Same-socket reauthentication is explicitly rejected with `IDENTITY_REBINDING_FORBIDDEN`; it cannot refresh the enrollment. Comparing issuer/subject would weaken the deliberate credential/enrollment boundary: identical provider identity does not imply identical token expiry or authentication session. Reconnect/removal retains the existing new-enrollment behavior. No identity comparison change is warranted.
5. [Unnecessary player state parsing](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4527380992): **accepted**. Public JSON is parsed only in the spectator branch; player projections use the existing application path.
6. [Empty retry tasks](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4527381235): **accepted**. A volatile hint suppresses empty retry submissions without acquiring the adapter monitor or reading worker-owned collections. An enqueue racing a false hint is seen on the next tick. Existing queued-task coalescing and rejected-submission recovery remain covered.

## Security and timing review

Each nonempty delivery attempt still obtains one fresh local authorization batch;
there are no provider calls during fan-out. Original token expiry, enrollment,
local revocation, observed provider rejection and final enqueue guards remain in
force. Generic local database failures still fail closed under the accepted policy.
Only typed budget/deadline refusal defers work. Neither ingress nor retry creates
per-recipient or per-match budgets: each worker task has one absolute deadline.
Chat pages remain ordered and are never coalesced or replayed to already delivered
recipients. No durable mutation is retried. Global retention remains bounded;
real capacity overflow still explicitly retires affected subscriptions.

The remaining sixteen-viewer global enrollment bound is unchanged. A new capacity
regression initially attempted twenty simultaneous viewers and correctly failed
at enrollment; it was corrected to exercise sixteen distinct matches, the actual
supported maximum. Sixteen small states without live transcript no longer reserve
sixteen maximum-size optional frames. This was a test-fixture correction, not a
relaxation of runtime limits.

## Standards review

Independent review: no documented-standard violations or actionable heuristic
findings. Volatile hint ownership, bounded retention accounting and repository
conventions approved. No independent build was claimed by the reviewer.

## Spec review

Independent review: no actionable findings. Match isolation and retry rotation,
state supersession/source acknowledgment, ordered chat, fresh authorization and
enrollment continuity approved. No independent build was claimed by the reviewer.

Review totals: Standards 0; Spec 0; neither axis has an outstanding finding.

## Validation

Runtime commit: `1c1cf05342762b52ec1636c23e20dac73eed4fa7`.
Focused publication/transport/authorization tests: **70 passed, no skips**.
Browser unit tests: **530 passed, no skips**.

All **82 browser suites passed** in **667.2 seconds with two workers**, including
TypeScript/Vite assembly, interaction and hosted checks. Reports:
`.tools/validation/local-browser-Wn7Ic6`; full startup log:
`.tools/pr518-round3-dev-local.log`. The Linux server image ran **791 tests,
zero failures/errors, 13 expected opt-in skips**. Non-quick `dev-local --restart`
completed successfully: database/server health, verified ADC, nginx websocket
initial/reconnect auth gate and computer service startup. The application log
contained zero `PERSISTENCE_FAILED`, `SEVERE` or `Exception` matches at startup;
computer stderr was empty.

Credentialed UI smoke: the diagnostic copy completed **7 native decisions**;
the unmodified canonical driver then completed **9**, including movement and
block, with **zero invalid projections**. Both verified two-coach/spectator
convergence, escaped durable chat, wrong-coach/spectator/stale/fabricated rejection,
route preview, reconnect and save/resume. The spectator screenshot was visually
inspected. Evidence remains in ignored `.tools/pr518-round3-ui-diagnostic` and
`.tools/pr518-round3-ui-smoke-r2`. These are bounded smoke flows, not full-match
acceptance or unloaded performance profiles; host native verification was also
running. Application error counts remained zero after the smoke flows.

**Retained failure:** the first canonical smoke timed out waiting for the initial
`Connected` status (`.tools/pr518-round3-ui-smoke.log`). Nine subsequent sign-ins
(three per identity) all received `authentication/ACCEPTED`; diagnostic and
canonical full flows then passed. No server exception or diagnostic authentication
code was captured for the original wait, so its cause remains unestablished.
This repeats the previously reported symptom; successful retries do not resolve
it. No timeout or security policy was relaxed. Redacted probe evidence:
`.tools/pr518-round3-auth-probe.log`.

Clean pinned `tools/target-build.ps1 verify`: **1,102 tests**, zero failures/errors,
20 expected opt-in skips (19 common + 791 server + 292 native), **15:30** total.
Log: `.tools/pr518-round3-verify.log`. The accepted #504 spike result, pinned SDK
and credential/deadline controls are unchanged; no dependency files changed.
The owned-transport spike regressions passed again in host, image and live suites.

Actual Firebase/MariaDB boundary suite: **102 tests, no failures/errors/skips**.
Log: `.tools/pr518-round3-real-provider-jdbc.log`. Cold verification **726 ms**,
OAuth refresh **222 ms**, late-lock refusal **1,862 ms**, JDBC allowance **699 ms**.
For **each** of STATE/CHAT/PREPARATION, 0/1/16 targets executed **0/1/1** local
authorization SQL queries; 16-target batches took **8.5?9.2 ms** in this run.
The real-socket scenario used 16 sockets (13 state targets, 13 chat targets and
one preparation target), one batch per nonempty family, **zero provider fan-out
calls**. Existing local revocation, original expiry, provider outage, observed
rejection, cache and incoming-request checks passed.

**Matched native timing profiles remain incomplete.** Two zero-recipient runs
and one fifteen-recipient run each passed the 14 owned-transport spike tests and
the actual provider/JDBC boundary test, then failed closed during native-fixture
authentication **before constructing the publication sink**. Both zero-recipient
runs recorded **1,110 ms / 1 HTTP call / 0 responses**; the fifteen-recipient run
recorded **1,115 ms / 3 HTTP calls / 2 responses**. All reported a provider
`TimeoutException`, with no timeout or retry policy change. The failures occurred
at different fixture-authentication points (home or away). Each combined run is
**failed**, not counted as a passing 16-test suite. Logs:
`.tools/pr518-round3-native-0.log`, `...-0-r2.log`, `...-15-r2.log`.

Three subsequent credential-free signing-key endpoint probes returned HTTP 200
in **123?146 ms**; this establishes connectivity at probe time, not the cause of
the Java timeouts. No new matched p99 comparison is claimed. Prior successful
profiles belong to the prior runtime revision and are not relabeled as current.
The full build and 102-test real boundary suite passed independently; they do
not erase these failed measurements. This is an explicit validation gap for
independent review, not a claim of merge readiness or cold-process availability.

[Sanitized numeric validation and failure evidence](2026-11-10-pr518-per-match-validation.json)
records source identity and hashes of retained failed logs. Tokens, raw game
state and private identifiers remain in ignored local artifacts.

Only reports change after the validated runtime commit. No merge, remote
deployment, provider budget relaxation or authorization-policy change occurs.
