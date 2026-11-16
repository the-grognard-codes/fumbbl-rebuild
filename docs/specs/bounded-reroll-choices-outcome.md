# Bounded reroll choices: outcome

Date: 2026-11-16.
Parent: [#561](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/561).
Slices: [#562](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/562),
[#563](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/563).
Design: [local mirror](bounded-reroll-choices.md).
Branch: `codex/561-reroll-loop`, based on PR #558 at `e3564e2e0`.
Worktree: `.worktrees/561-reroll-loop` in the original checkout.
PR #558 merged during implementation; the review PR targets `main`.

## Root cause and captured evidence

This is an engine dialog-lifecycle bug, not a policy loop. `StepExecutor` already
cleared consumed native reroll dialogs, but only when browser skill preferences
were configured. The native acceptance harness leaves those preferences
unconfigured. Production browser sessions configure them through
`SetupApplication`; this investigation does not establish that the same loop
occurs in those configured sessions.

Orc home / Human away, seed 73, recklessness on, first enters the cycle at
revision 468, half 2, drive 3, home turn 1 / away turn 2:

| Field | Captured value |
| --- | --- |
| Native step before answer | `boneHead`, failure label `endBlitzing` |
| Dialog | `reRollProperties`, Bone Head, minimum 2, properties TRR and LONER |
| Public prompt | `null`; this choice is projected as offered actions |
| Offered action IDs | `468:reroll:none`, `468:reroll:team` |
| Selected action | `468:reroll:team`: Use team re-roll for Bone Head |
| Native step after answer | `initSelecting`, waiting for a new command |
| Dialog after answer | The same Bone Head reroll dialog |
| Subsequent behavior | Revisions advance and action IDs gain the new revision, but the dialog and native selection step do not change |

The policy chooses team reroll repeatedly, then declines after exhausting its
action budget. Neither can resolve a dialog whose native step has already left.
The bounded reproduction stops at 636 accepted decisions with
`Turn reached 200 decisions`; the original baseline reached the emergency guard.
Native before/after tracing also reproduces the stale dialog before any recovery
operation intervenes, ruling out recovery as the origin.

The fix clears an unchanged reroll dialog after its native command returns
`EXECUTE_STEP`, independently of optional skill-preference configuration. It
retains replacement dialogs and unhandled/skipped choices. Skill-command policy
behavior is unchanged. No rules, policy ranking, emergency limits, wire fields
or recovery formats change.

## Regression and review

`RerollChoiceProgressTest` reconstructs the captured native boundary: a failed
Bone Head roll followed by a successful reroll and a waiting `initSelecting`
continuation. Its browser action goes through `SetupSession.apply`.
The original implementation fails with:

```text
Answering Bone Head must consume its native reroll dialog,
not offer it at a new revision ==> expected: <false> but was: <true>
```

The fixed test resolves the prompt in **one accepted decision**. Four cases
cover configured/unconfigured preferences and fresh/restored sessions. Each
checks one resource spend, plus an exact duplicate that preserves the revision
and remaining resources. Early fixture attempts did not reach the failing
continuation; those were corrected before recording the behavioral red baseline.
Expanded spending assertions also required controlling the fixture's Brilliant
Coaching bonus and captain's 6+ save; no production rule was changed for them.

Self-review checks the change against #561, server authority, unchanged limits,
replacement-dialog identity, duplicate/recovery behavior and repository style.
The engine acceptance runner now fails on a turn reaching its exclusive ceiling
(default 200) and any decision-limit warning. It counts warnings across stderr
chunks independently of the bounded diagnostic tail. Optional `--trace-choices`
retains synthetic choice evidence; temporary native instrumentation is confined
to ignored diagnostic artifacts.

## PR #564 feedback updates

The [review](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/564#issuecomment-6925978298)
accepted the native fix and requested three updates. All three are implemented:

- Every observed setup refusal is logged, including refusals recovered by an
  exact retry. Every repeated request logs its first observed refusal code.
  Periodic `status.json`, final status and `run-finished` include
  `retainedRetries` counts by that code. Counts include rejected repeats;
  `errors` continues to count failed driver iterations. Zero driver errors
  therefore does not imply zero checkpoint refusals. Causes survive page
  reloads within a driver process; unavailable historical causes are explicitly
  counted as `UNKNOWN`.
- Retained recovery waits for a new outgoing send before looking up its receipt,
  then waits for the receipt associated with that send's sequence. Delayed sends
  and old receipts for a reused request ID cannot complete the wait early.
- The changelog now names the unconfigured native/harness path and states that
  configured browser sessions already received consumed-dialog cleanup.

Self-review retained the generic executor cleanup. `EXECUTE_STEP` identifies a
consumed command and dialog identity protects a replacement; skipped/unhandled
commands retain the offered dialog. This applies the existing configured-session
contract to unconfigured native callers. A Bone Head-specific workaround would
leave the same configuration dependency in other native reroll handlers. The
four-case regression and previously passed optional-reroll/reaction suites cover
the affected contract; this is not exhaustive coverage of all skill combinations.

The new regression's reflected state access and fixture coupling are recorded
on the existing [#544 consolidation workstream](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/544#issuecomment-6928798186).
No additional accessor was introduced. Java indentation now follows the
surrounding tests, and duplicate match-counting blocks use one helper.

Review validation: the five new deterministic retry tests failed against the
previous behavior and pass with the fix. They exercise delayed sends, receipt
timing, rejected retries, reused request IDs, unknown causes and refusal logging.
The full browser suite passes **545 tests**; the focused native regression passes
**4 cases**. Driver syntax and whitespace checks pass. No production Java source
changed in this follow-up; the Java test edit is whitespace-only.

The second review identified two further driver issues. Recovery now selects
the first outgoing send after the click, so later setup load/status traffic
cannot replace the retry or acknowledge it. Refusal capture uses a highest-sequence
cursor stored with the page instrumentation and leaves the bounded failure queue
intact for action polling. Navigation resets the cursor with the instrumentation.
Two additional regressions cover later accepted setup traffic, preserved failures,
deduplicated logging and cursor reset. All seven focused retry tests and all
547 browser tests pass; driver syntax and whitespace checks pass.
The mounted-ADC probe still reports `SESSION_EXPIRED`. After renewal, first run
a short live check that resumes an active match and observes a real retained retry
with its counted cause; only then begin the fresh three-hour acceptance window.

## Other choice-handler audit

The basic-judgment handler ranks offered choices; it does not create native
commands or persist action IDs. Audited categories:

- Reroll and Pro-test choices use the native reroll lifecycle. Existing deferred
  Pro/optional-reroll tests exercise replacement decisions; identity checking
  retains those replacements. The fix also covers other trait rerolls sharing
  this lifecycle.
- Block-die choices advance native block selection. Push and touchback handlers
  clear their dialogs during execution; follow-up choices publish the selected
  value and leave the follow-up step. No matching reroll-style cycle appeared
  in the three seeded matches.
- Skill/reactive-skill/kick-skill choices retain their existing configured-policy
  cleanup and native pending-choice handling. Nine optional-reaction and twelve
  optional-reroll cases passed in the affected suite.
- Kick-off movement/selection retains #558's native bounds. Reaction movement,
  reactive squares and on-the-ball choices depend on native movement/selection
  progress. Injury/apothecary/bribe/argue choices use `resourceDecision` before
  the generic judgment path. No additional loop was identified in this audit;
  it is not an exhaustive proof for every BB2025 skill combination.

A follow-up seed-73 run used `--trace-choices` and completed in 31.0 seconds:
737 decisions, largest turn 61, largest kick-off 7, zero guard warnings,
rejections or stalls, 19 exact retries and 7 restores. The trace contains 42
Bogruk `basic-judgment` choices. Consecutive counts require adjacent accepted
revisions; a revision gap resets the streak. Per-turn counts use half, drive and
both turn counters. These measurements cover only the observed categories:

| Choice kind | Total observed | Maximum consecutive accepted revisions | Maximum in one turn |
| --- | ---: | ---: | ---: |
| Reroll | 6 | 1 | 2 |
| Push | 11 | 1 | 2 |
| Follow-up | 11 | 1 | 2 |
| Block die | 13 | 1 | 2 |
| Touchback | 1 | 1 | 1 |

Other choice categories were not observed in this trace. Local receipts:
`.tools/564-review-choices-73.jsonl`, `.tools/564-review-engine-73.json` and
`.tools/564-choice-audit.json`.

## Validation

Affected-test manifest: `RerollChoiceProgressTest`, `ComputerPolicyRecoveryTest`,
`OptionalReactionSkillUseTest`, `OptionalRerollSkillUseTest`,
`ReRollApiEquivalenceTest`; computer-player and browser unit suites; browser
production build; full pinned Maven clean install; three native matches; local
startup and three-hour UI soak.

- Affected Java tests: **39 passed**, zero failures/errors.
- Computer-player `npm test`: **56 passed**. The initial sandbox invocation
  lacked Windows process-inspection permission; the owner-account run passed.
- Browser `npm test`: **540 passed**.
- Browser TypeScript/Vite production build passed during dev-local assembly.
- Soak-driver recovery was verified against an actual retained setup request at
  revision 226: the supported exact retry cleared the recovery control without
  changing that revision. `node --check browser-client/test/overnight-soak.mjs`
  passed. The driver now retries retained requests in every phase and waits for
  acknowledgment before deriving another intent, rather than only retrying at
  match boundaries.
- Full pinned `mvn clean install`: **passed** in 20 minutes 16 seconds. Reported
  1,184 cases, zero failures/errors, 22 standard environment/fixture-gated skips:
  19 common, 865 server and 300 native. Started 05:41:31 UTC, finished 06:01:51 UTC.
  Receipt: `.tools/561-full-build.status.json`, log and
  `.tools/561-full-test-counts.json`. Production, regression and engine-runner
  hashes match the validation manifest; no Java source changed during the build.

Native command: `node computer-player/test/engine-match.mjs --java <pinned-jdk>/bin/java.exe --classpath <current-test-and-runtime-classpath> --home-roster Orc --away-roster Human --seed <seed> --timeout-ms 240000 --output <receipt.json>`.
Recklessness is on and the exclusive turn ceiling is 200.

| Seed | Full time | Decisions | Largest turn | Largest kick-off | Guard warnings | Exact retries | Restores | Score | Time |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 73 | Yes | 737 | 61 | 7 | 0 | 19 | 7 | 0–3 | 52.4 s |
| 74 | Yes | 767 | 55 | 26 | 0 | 20 | 7 | 0–4 | 49.8 s |
| 75 | Yes | 730 | 55 | 7 | 0 | 19 | 7 | 0–2 | 60.3 s |

All three have zero rejected actions and zero stalled responses. Receipts are
ignored `.tools/561-engine-{73,74,75}.json` with matching logs.

## Dev-local and soak

`node tools/dev-local.mjs --start --quick` assembled the browser, built the server,
passed the real browser/proxy initial-connection and reconnect auth-gate check,
and started Hosting and the computer daemon at `http://localhost:5000/play`.

The first soak attempt stopped before creating a match. The server exhausted its
heap while resuming existing matches and exhausted three container restarts; the UI
reported authentication failure while the server was unavailable. The user
explicitly approved clearing old dev-local games. The repository clear script
removed game records and retained accounts, identities, saved teams, settings
and skill preferences. No unrelated checkout changes were touched.

The clean restart had healthy engine/ADC probes and zero container restarts, but
the browser initially still reported authentication failure. A restart enabling
the server's existing payload-free auth diagnostics was followed by successful
sign-in and a one-minute smoke match (13 decisions, zero errors); no credentials
were changed. The transient rejection was not reproduced with diagnostics on,
so its exact cause is not claimed.

The next soak exposed a driver limitation after a real checkpoint-budget refusal:
it tried new setup actions while the browser retained the original request.
The existing Repeat retained request control resolved this with an exact retry.
That recovery is now in the driver's main loop. Earlier UI runs used the driver's
default random coach and are startup/recovery evidence only. The final acceptance
run explicitly selects `--opponent 'Bogruk the Almost Clever'`; its three-hour
clock started at 06:06:09 UTC / 01:06:09 America/New_York.

The Bogruk attempt reached 24 minutes, 119 home decisions and revision 612 in
half 2, score 0–2, with zero decision-limit warnings, heap failures or container
restarts. It did not finish a match. Four driver errors occurred around repeated
checkpoint-budget refusals. At revision 581 the match stopped advancing for at
least 5.3 minutes, then resumed before the driver was stopped. The daemon also
cycled through unfinished diagnostic matches from earlier attempts; this run
does not establish a quiet three-hour acceptance result.

The driver was stopped; the healthy dev-local stack remained running for manual
testing. A read-only inventory found 5 games, 5 recovery records and 45 journal
rows. Clearing these additional validation-period games was rejected by
automatic approval review because the prior permission covered the original
old-game set, not these newly accumulated records. Deletion waited for approval.
The user explicitly approved clearing this additional set and continuing the
soak on 2026-11-16. The repository clear script then removed those 5 games and
their recovery/journal records, retaining teams, accounts and preferences. The
stack restarted with `--quick`, passed proxy and ADC checks, and a dry run
confirmed zero game records before the next driver started.

The isolated Bogruk measurement started at **06:56:52 UTC / 01:56:52
America/New_York**, with exactly one tracked driver and an empty match database.
It uses `.tools/561-soak-isolated/` and matching stdout/stderr logs. Production
and regression source hashes still match the completed validation manifest.

The clean run reached revision 622 in half 2 (turns 6/6), with 98 home decisions
in its last periodic progress receipt and no guard warning, heap failure or
restart. Checkpoint-budget refusals still occurred with only that one match.
Inspection showed the match remained connected, offered legal home actions and
held an exact request for retry; the driver had misclassified automatic match
resumption as an unavailable lobby. Its earlier wait for the retry button to
disappear could also return before the request was acknowledged.

The driver now associates replies with the latest send of a reused request ID,
waits for the matching `ACCEPTED` receipt before continuing, and recognizes an
automatically resumed active match. It also retries a held request before using
the generic UI-action fallback. Syntax checks pass; all 540 browser unit tests
passed again. The real resumed-match/receipt check remains pending.

The attempted continuation could not sign in. A direct mounted-ADC probe
returned **`SESSION_EXPIRED`**, unlike the earlier successful probe. The
repository's recovery script opened Google sign-in and is awaiting the user's
interactive authentication. Existing match data was retained. A diagnostic-only
server recreation enabled the existing payload-free auth diagnostics; no
additional data reset occurred. The interrupted window is not counted as a
completed three-hour soak. A fresh full window will start after credential
recovery and verification that the same match resumes.

At review follow-up, the server remains running and healthy with zero restarts;
the mounted-ADC probe still returns `SESSION_EXPIRED`. No new reset or soak was
performed for these review updates. The live resumed-match/receipt check and a
fresh full three-hour measurement remain pending interactive credential recovery.

Three-hour soak acceptance: **incomplete, awaiting Google sign-in**.
The checkpoint-budget refusal is distinct from the fixed stale reroll dialog;
the existing memory/persistence workstreams remain relevant to the soak.

## Independent review

[Draft PR #564](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/564)
contains the implementation and report. All applicable checks at code commit
`232a596e9` passed, including Java 21 target verification and four native shards,
browser assets/unit/build checks, local lifecycle/computer-player tests,
Firebase service checks, validation, security/lint checks and CodeQL. The optional
`full-browser` job retained its standard skip. No merge or auto-merge was enabled.

## Completion status

The code fix, minimal regression, affected suites, full build, seeded acceptance
and independent CI checks are complete. The three-hour Bogruk soak remains
incomplete; #563 and the parent acceptance gate remain open, and the PR remains
draft. The original checkout's unrelated soak-review edit is preserved. There
was no merge, auto-merge or remote deployment.
