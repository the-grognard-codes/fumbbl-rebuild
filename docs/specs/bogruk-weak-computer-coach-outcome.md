# Bogruk delivery outcome

Implementation: [PR #308](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/308), branch `docs/bogruk-bb2025-references`, based on `c4fbb7c34`. Delivery validation is in progress; this report will be finalized before merge.

Pending acceptance: renew the owner's expired local Google ADC, finish the retained real browser match, and verify its completed result and backward replay seek. Final PR checks must pass before merge. The PR remains draft; no deployment has run.

Tracking: [parent #301](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/301), [identity/recovery #302](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/302), [decisions/runtime #303](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/303), [acceptance #304](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/304), [Secure the Ball prompt #309](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/309). The [agreed spec](bogruk-weak-computer-coach.md) remains the design record.

## Result against the plan

| Requirement | Delivered behavior and evidence |
| --- | --- |
| Selection and identity | Bogruk appears as Weak with the agreed description. Both selectors retain independent roster cloning and start the chosen coach. Identity, policy version and seed are frozen privately with the prepared match. |
| Existing Bugman | Its random-policy and daemon implementations remain unchanged. The dispatcher selects either policy from the server identity; legacy Bugman documents remain readable. |
| Purposeful offense and defense | Bounded board estimates pursue loose balls, forward possession, support, carrier pressure, favorable blocks and useful short passes/handoffs. Scenario tests cover successive activation intent and both attack directions. |
| Scoring and detours | A whole route requiring no dice takes priority over violence or recklessness. Necessary detours can reach a forward endpoint; stalling, protective retreats and reformation are not objectives. Native pitch coordinates retain the same attacking direction across halves; the server projects it explicitly. |
| Mistakes and frustration | Default turn chances are 30/50/70% after zero/one/two-or-more stalled possession turns. Progress, possession changes and new drives reset frustration. A deliberate mistake is a legal purposeful gamble that could succeed. An accepted deliberate choice consumes its allowance regardless of the dice result; ordinary bad dice do not. |
| One mistake and reproducibility | Seeded purpose-specific draws, a stable turn gate, saved spent flag/action count and bounded activation intent survive recovery. The server prevents replenishing a spent allowance within a turn. Accepted actions and memory checkpoint together. |
| Blocks, fouls and prompts | Basic strength/assist/skill/outcome guidance, face/push/follow-up judgment, a documented removal-versus-sending-off foul estimate, rerolls and mandatory legal fallbacks are implemented. Unusual mechanics do not receive bespoke tactics. |
| Setup and kicks | Cheap players take the line where legal; valuable players deploy deeper. Gaps remain. Kicks vary shallow/deep and across the width. No Mid formation library was added. |
| Save, resume and privacy | Bogruk accepts the human's save/resume proposals and waits while suspended. These controls preserve tactical counters. Private plans are excluded from human/spectator snapshots and public transcript decisions. |
| Bounds and diagnostics | Each player search settles at most 390 squares and removes at most 1,800 queued nodes; per-decision paths are cached. A 192-decision safety bound ends exhausted activations. Workers log brief reasons and deliberate risks. |
| Roster and rules scope | Current browser BB2025 Human and Orc rosters are covered. Other rulesets and game rules were not changed. The [dated rules register](bb2025-rules-reference.md) links Blood Bowl Base and current official errata/commentary. |
| Presentation and release | Existing UI scaffolding and styling are reused; desktop and 390px browser selection were inspected. A feature entry was added to the latest change list. Deployment is outside this work. |

## Executed validation

| Check | Result |
| --- | --- |
| `npm test` in `computer-player` | 33 passing policy and transport tests, including no-dice scoring, plausible risky alternatives, frustration, save controls, protective-retreat exclusion and exact unanswered-request retry. |
| Clean focused native/server suites | 98 passing after the Secure the Ball fix: 82 server tests across policy state/recovery, preparation, adapter, movement, placement, activation recovery, concession and live publication, plus 16 native reroll tests. Publication and Secure the Ball regressions failed before their fixes and passed afterward. |
| Browser unit suite | 335 passing after integrating main's pass/handoff planning. |
| Browser production build | `npm run build:play` passed. |
| Full Maven reactor | The initial feature reactor passed `mvn clean install`: 903 test cases reported, 0 failures/errors, 9 existing opt-in skips. Later publication/native-prompt corrections were checked by the clean 98-test focus, Linux Docker server build, and PR checks. |
| Linux Docker server build | Merged source passed 461 server tests, 0 failures/errors, 2 existing opt-in skips, then packaged and started the review server. |
| Computer selector browser integration | Bogruk and Bugman both pass selection, clone request, activation and match-window subscription. Desktop/mobile screenshots inspected. |
| Complete browser gate | All 51 suites passed at merged code commit `2adee4aca8b8c6721709c00915ce8994d86d1158`: 41 interaction suites and 10 hosted suites. The combined execution-report gate passed, verifying every report's commit and suite inventory. |
| Validation tooling | 15 passing browser inventory and execution-report tests. |
| Native validation tooling | 12 passing shard-inventory/report checks; the new native regression is registered in shard 3. |
| Native full match, Human home / Orc Bogruk, seed 42 | FULL_TIME, 1,024 decisions, 0 invalid, 0 stalled responses, 27 duplicate checks, 10 checkpoint restores, 6 deliberate gambles. Final score 0–4. |
| Native full match, Orc home / Human Bogruk, seed 73 | FULL_TIME, 986 decisions, 0 invalid, 0 stalled responses, 26 duplicate checks, 9 checkpoint restores. Final score 0–6. |

These native matches use real engine actions and recovery artifacts with seeded random choices for the human seat. They establish participation, scoring and recovery, not a casual-player win rate. No numerical win-rate guarantee was agreed.

Local detailed logs, native summaries and screenshots are in ignored `.tools/bogruk/`. They contain validation output and are not release assets. Durable conclusions are recorded here and on the PR/issues.

## Standards

Independent standards review found missing public exception declarations and repeated JavaScript gameplay-operation lists. Both were corrected: new identity APIs declare their validation exception, and the worker, policy and engine runner share one operation predicate. No remaining substantive documented-standard finding was reported.

## Spec

Independent spec review found no remaining substantive mismatch. Review also checked that save/resume controls cannot overwrite policy memory or consume the gameplay allowance. Tests protect the correction and recovery boundary.

The final primary-agent pass found that an opponent's push could advance Bogruk's carrier without clearing frustration. Progress now resets it during either team's turn; a focused regression protects that case.

The real browser match also exercised the no-dice scoring priority: Bogruk selected the carrier at revision 203 and followed four no-dice route steps into the end zone at revisions 204–207. The native prospective staller report was cleared by the immediate touchdown; it did not indicate a prior-turn stall.

It also found that transfer safety could outweigh losing ground. A regression first reproduced Bogruk choosing that protective backward handoff. Passes and handoffs now exclude receivers behind the carrier or planned transfer endpoint, including deliberate-risk choices. Tests cover both directions and preserve useful forward transfers. Ordinary movement detours remain available.

Real browser acceptance exposed a publication defect that fixture scenarios did not exercise: relabelling an acting coach's state as a spectator retained coach-only threat guidance, which the browser correctly rejected. Spectator broadcasts now remove both private computer memory and coach-only threats. Chat also skips computer service viewers, preserving their gameplay subscriptions without applying human authorization to a service identity. Two boundary regressions protect these fixes.

The real-server harness was aligned with current-tab startup, persistent debug drawers and movement-preview messages. Explicit player declarations use the existing server-action selector; choosing Move on the pitch starts a route preview. Its convergence comparison excludes legitimate coach-only threat guidance, and it independently decodes live state frames using the appropriate coach or spectator role. Camera, Undo/Clear and other interaction coverage remains in the complete browser suites.

Main advanced with PR #307 during delivery. It was merged into the feature branch, preserving both change-list entries. Focused independent standards and spec reviews found no new integration issue: transfer planning retains Bogruk's metadata checks, authoritative progress observation and checkpoint boundary.

Linux CI exposed two existing kickoff-dependent movement assertions. The fixture uses six-MA linemen, but Dodgy Snack can reduce a selected player's effective MA by one. The special-turn test now captures the inactive player's regular allowance and checks that both special modes preserve it, while the active player remains capped at two. The standing-up test removes that kickoff modifier and establishes MA6 before checking the exact three-point standing cost. The separate modifier-preservation regression remains intact; production movement logic was unchanged.

Real second-half play found an existing BB2025 Secure the Ball bug: the native step skipped Sure Hands, but generic reroll prompting offered it again. Its unhandled command left the same prompt in place, so the sensible free-reroll preference repeatedly selected it. [Sure Hands excludes Secure the Ball](https://bloodbowlbase.ru/bb2025/core_rules/skills_and_traits/#sure-hands-active). Issue #309 tracks the correction: the BB2025 step excludes that pickup skill from the existing reroll service while retaining applicable sources. An obsolete saved choice refreshes the legal prompt without rolling or consuming a resource; without a legal source, the existing failed-pickup path resolves. This repair requires the acting coach. Ordinary pickup skill rerolls and other rulesets retain their behavior. Three native regressions failed before the fix and cover both coach roles, legal team rerolls, no-source failure, unchanged ordinary pickup, and exact recovery with opponent-request rejection.

The retained real match then recovered the obsolete choice at revision 1138, offered a legal team reroll at 1139, and returned to ordinary second-half play. A later run encountered a host clock jump during its fixed turn-completion wait. The harness now waits for bounded advancing revisions, with a per-update liveness timeout, rather than imposing 120 seconds on an entire computer turn. Google ADC subsequently reported `SESSION_EXPIRED`; final full-time/result/replay acceptance awaits owner reauthentication. This is not recorded as a completed live match.

The broad browser run exposed an existing asset-readiness race in a reroll fixture: it inspected an image before decoding completed. The assertion now waits for `image.decode()` and still verifies the expected loaded asset. The new selector suite is registered in the existing browser manifest.

All 50 browser suites passed in the next run, but its combined gate rejected mixed commit identities because the final fixes were committed while shards were running. A further pass held the revision fixed and passed the combined gate. Execution reports were not relabelled or reused across commits.

After integrating main, concurrent browser shards and server builds produced a navigation timeout. Three shards passed; the failed shard was rerun with one worker, then the queued hosted suites ran. The combined gate accepted all 51 suites at the same merged revision. No report identities were changed.

## Limits and process findings

- Rules research supplies a dated linked register, not an offline copy of copyrighted rulebooks or complete commentary. The source document records inspected coverage and file-size/language limits.
- Windows Java 21/Node 26 and Chrome are exercised locally, with the real review server built and run in Linux Docker. A 390px viewport is a layout check, not an Android device test. Android execution is not claimed. GitHub's Linux validation is recorded with the final PR checks.
- Heuristics remain intentionally weak: future-step probabilities, foul value and uncommon skill interactions are estimates; the server decides legality and dice.
- New computer records and checkpoints require compatible readers. Existing records remain readable, but rolling back a deployed server to an older binary requires preserving the new readers or completing/retiring matches written in the new format. No SQL schema migration or deployment runs as part of this change.
- Environment follow-up: the Windows sandbox can report false GitHub authentication failures and deny compiler class reads. Approved execution outside that sandbox resolved both; project code and credentials needed no workaround. A documented environment probe would shorten future diagnosis.
- Tooling follow-up: local lifecycle startup deliberately hides arbitrary exception text. A safe error code for browser-inventory failures would have made the missing test-manifest entry immediately clear. The existing inventory guard caught the omission and it was fixed.
