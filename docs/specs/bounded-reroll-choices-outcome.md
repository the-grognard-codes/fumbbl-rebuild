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

Three-hour soak acceptance: running; final result to be recorded.

## Completion status

The code fix, minimal regression, affected suites, full build and seeded
acceptance are complete. The final Bogruk local-soak result remains to be
recorded before final handoff. Publishing a review PR is authorized; merging
and auto-merge are not.
