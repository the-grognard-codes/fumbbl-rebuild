# PR #518: keep budget-deferred recovery notices pending

Baseline: `1cdc26f69558761eb7216577d40dacfbb4731bce`.
Runtime: `eb1d1dbe3363dd5dcfd1384f12b6aa80ee70ca0a`.

## Disposition and cause

[4529941602](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4529941602): **accepted, blocking defect fixed**.
The previous correction incorrectly equated a typed request-budget refusal with
unavailable authority when sending a recovery notice. A notice still needs local
authorization, but inability to fit that check into the failed payload's budget
is not a denial and must not clear the board. The previous report's claim that
this retirement was necessary for security is superseded by this correction.

## Behavior and security

After three counted payload deferrals, `notifyDue` keeps the entry pending.
It no longer attempts authorization in that failed task. Only a subsequent
watchdog control task may attempt the notice; inline ingress draining cannot
consume or reset this phase. Coalesced replacement state inherits it.

The notice repeats a current local batch for only its remaining recipients,
with existing role/original-expiry and final enqueue checks. Typed
`PublicationDeferred`, `NotStarted` and `DeadlineExpired` at the batch or recipient
boundary leave it pending. Completed recipients are removed, so retry neither
resends their notice nor reuses the old batch's slot assignments. Genuine denial,
expiry and generic SQL failure still fail closed and retire without match/family
metadata. No provider calls, token extension, budget reset or mutation replay
are introduced.

The existing control task retains one shared absolute deadline across matches.
The payload's three-attempt limit remains in force: notice retries do not restart
projection. Entry/payload reservations remain charged within the existing global
64-entry / 4-Mi-character cap until notification succeeds or enrollment retires.
Notice delivery remains best effort and can wait through prolonged typed budget
refusals. This does not retry a client's failed recovery read after a notice was
successfully sent; that priority item and the two other deferred cleanups remain
in [#519](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/519).

## Validation

The new regression first failed on the prior runtime with **“Exhaustion is not an
access denial”**: exhausting each actual shared payload budget emitted
`VIEW_UNAVAILABLE`. Retained red log: `.tools/pr518-round7-red.log`.

Focused validation passed **101 tests**, zero failures/errors/skips. Coverage:
all three publication families; fully exhausted payload tasks; repeated notice
`NotStarted`/`DeadlineExpired`; final enqueue-budget deferral after partial delivery;
only undelivered recipients on the next fresh batch; exact expiry and local
denial; generic SQL failure; inherited notice phase after state coalescing;
inline notice suppression; unchanged payload fairness and capacity release.

The old queue fixture's automatic authorization success after three failures was
removed. Queue tests now model projection refusal directly; authorization tests
use real `V2MatchAccess` admission with controlled clocks and explicit JDBC
refusals. Initial expectations for same-task notification were updated and
missing Mockito imports corrected. Logs remain in `.tools/pr518-round7-phase*.log`
and `.tools/pr518-round7-focused.log`; those intermediate runs are not relabeled
as passing.

## Standards

Independent review found no actionable documented-standard violations or heuristic
findings. **APPROVE**. No tests executed by the reviewer.

## Spec

Independent review found no actionable missing, incorrect or out-of-scope behavior.
Deferred notice admission, partial delivery, slot renewal, coalescing and security
retirement were approved. **APPROVE**. No tests executed by the reviewer.

Totals: Standards **0**, Spec **0**.

Clean pinned `tools/target-build.ps1 verify` passed **1,116 tests**, zero failures
or errors, **20 expected opt-in skips**, in **13m59s**. Log:
`.tools/pr518-round7-verify.log`.

Combined actual Firebase/JDBC/socket validation passed **116 tests**, zero
failures/errors/skips. Cold authentication **651 ms**, OAuth refresh **270 ms**,
late-lock refusal **1,861 ms**, JDBC allowance **698 ms**. Ordinary publications
retain **0/1/1 queries for 0/1/16 targets per family**; 16-target batches took
**8.1-8.8 ms**. Sixteen real sockets used 13 state targets, 13 chat targets and
one preparation target; provider fan-out calls were **zero**. Notice retry/fault
behavior is independently exercised by the focused controlled-clock/JDBC-refusal
regressions, not inferred from the happy-path SQL timing scenario. Log:
`.tools/pr518-round7-real-provider-jdbc.log`.

 Browser/computer sources and protocol projections are unchanged; prior
browser/startup/native evidence retains its original revision and limitations.
No merge or remote deployment occurs.
