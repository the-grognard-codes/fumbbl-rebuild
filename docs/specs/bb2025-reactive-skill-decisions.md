# Feature: BB2025 reactive skill decisions

## Abstract

Expose native reactive decisions to the correct browser coach and bound each optional activation to 30 seconds on the server.

## Objective

Implement the inventory and behavior approved by the user on 2026-10-17. Tracking issue: [#294](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/294). Delivery: [PR #295](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/295), with issue closure on merge and ongoing live-play validation afterward.

## Context / Existing Behavior

The native engine already interrupts actions for skill decisions. The browser adapter omits player-choice and some custom movement/placement flows. Native dialogs have no browser activation deadline.

## In Scope

| Skill / trait | Decision to audit and expose |
| --- | --- |
| Diving Tackle | Choose tackler or decline after the dodge and rerolls; show effect and known roll |
| Tentacles | Choose eligible player or decline before movement |
| Shadowing | Choose eligible shadower or decline after successful movement; show native target |
| Arm Bar | Preserve automatic single-player use; choose among eligible players when required |
| Dodge | Preserve automatic use; expose conditional block-result choice |
| Stand Firm | Use or decline, including own-turn chain pushes |
| Side Step | Use and choose square, including own-turn chain pushes |
| Wrestle | Separate attacker and defender decisions in native order |
| Fend | Defender use or decline before follow-up |
| Taunt | Defender use or decline before follow-up |
| Dump-Off | Optional use and required pass target selection |
| Trickster | Optional use and destination, then native pickup continuation |
| Steady Footing | Optional use when the native falling-down sequence offers it |
| Safe Pair of Hands | Optional use and ball placement |
| Saboteur | Separate affected coach decisions in native order |
| On the Ball | Eligible player selection and bounded movement; retain completed movement on expiry |
| Diving Catch | Declare/select eligible catcher using native sequence |
| Catch | Optional skill reroll and any native catcher selection |
| Dwarfen Grit | Victim-owned injury modification choice |

Audit skill properties and temporary grants rather than restricting eligibility to roster names. Preserve existing automatic resolutions. Other attacker-only skills, unrelated interception/apothecary choices, settings UI and graphics changes are excluded.

## Out of Scope

- Changes to unrelated rules or themes.
- New global automatic-use settings. Future options are **Always use** and **Always ask** only.
- Complex deadline persistence or pause infrastructure solely for this feature.

## Functional Requirements

- Route decisions by the owning coach, independent of whose normal turn it is; suspend the triggering sequence until resolved.
- Enforce one server-owned 30-second deadline per activation, including initial player/target/square selections. Reconnecting must not reset a resident deadline.
- Resolve unanswered optional choices as No/Decline. Avoid committing optional skills before required inputs where possible. Mandatory continuations after commitment require a documented legal fallback.
- For On the Ball, keep completed moves/results, decline the current optional choice and end remaining optional movement on expiry. Never rewind revealed rolls.
- If the other coach reacts to On the Ball movement, give that skill its own deadline and retain the movement coach's unused response allowance while the interruption resolves.
- Pause normal turn/bank time for an opponent decision; keep the normal clock running for own-turn choices.
- Show a countdown, skill/player context, native target number when relevant, and known roll/effect in the decision box.
- Preserve current automatic behavior. Future automatic policy must resolve before a prompt/deadline is opened.
- Recovery/replay must not execute a choice twice or expose actionable historical prompts. Document restart/pause behavior.

## Acceptance Criteria

- All inventory entries are traced to native decisions, with browser coverage and regression evidence or a specific unresolved rule-source gap.
- A silent/disconnected coach cannot indefinitely block a covered optional activation.
- Late/wrong-owner/stale responses cannot win after an authoritative timeout.
- Chained decisions retain native ordering and independent ownership.
- Android, Windows and Linux layouts preserve MUTP styles and existing themes.

## Constraints

- Branch: `feature/bb2025-reactive-skill-decisions`.
- Preserve unrelated working-tree changes. The user authorized committing, pushing and merging through a pull request on 2026-10-17.
- Follow repository conventions; isolate BB2025-only rule changes from other rulesets.

## Implementation Guidance

Reuse native commands and mechanics. Put deadlines and expiry mutations on the serialized engine worker; checkpoint before publishing. Public live timing metadata must not enter frozen replay snapshots. Prefer a small decision service over scattered per-skill timer logic.

Rules baseline: Third Season / BB2025 and the [May 2026 official FAQ](https://assets.warhammer-community.com/eng_20-05_blood_bowl_faq_errata-gytvlserev-ngihd3chox.pdf). The full printed rulebook is not available in the workspace; distinguish source-confirmed corrections from native-code preservation and flag remaining verification gaps.

## Validation

Add focused tests for choice projection/ownership, timeout/no-response, chained inputs, automatic paths, late responses, reconnect/recovery, and frozen replay. Run affected unit/browser checks and server/browser builds. Exercise live decision UI and update changed appearance/timing assertions. Record exact commands and outcomes below.

## Completion Notes

### Implemented behavior

- The browser projects native player choices, skill uses, rerolls, placement and On the Ball movement. The engine still determines eligibility, temporary skill grants, dice and sequencing.
- Side Step, Trickster, Safe Pair of Hands and Dump-Off offer a destination before committing native use; the server submits use and destination within one serialized mutation.
- A server watchdog enqueues deadline checks independently of socket traffic. Timeout mutations use native commands and checkpoint before publication. Late actions receive the current state with `STALE_REVISION`.
- Absolute deadlines survive reconnect and private checkpoint recovery. Older checkpoints without a deadline receive one when recovered. Live timing metadata does not enter frozen replay events.
- Already-committed destinations restored from older checkpoints use the first deterministic native legal choice on expiry (Side Step square, ball placement, Dump-Off pass target, or mandatory catcher). Optional use always declines. Completed On the Ball movement remains committed.
- Official suspension stops expiry processing, but the absolute deadline is not extended: an overdue optional choice declines when play resumes. This intentionally uses the existing suspension mechanism.
- Native automatic resolutions still bypass browser prompts and timers. Future **Always use / Always ask** preferences can resolve at that existing native boundary before the pending-decision service observes a prompt.

### Native audit

The following paths are under `ffb-server/src/main/java/com/fumbbl/ffb/server/` unless stated otherwise.

| Inventory entries | Native path retained / corrected |
| --- | --- |
| Diving Tackle | `skillbehaviour/bb2025/DivingTackleBehaviour`: native dodge calculation and known final roll now accompany the choice |
| Tentacles | `skillbehaviour/bb2025/TentaclesBehaviour`: native strength-dependent target is reused for the prompt |
| Shadowing | `skillbehaviour/bb2025/ShadowingBehaviour`, `step/bb2025/move/StepShadowing`: remove the unrelated used-activation eligibility restriction, retain rooted/pinned restrictions and native per-turn limit; repair recovery of the Shadowing decision flag |
| Arm Bar | `step/bb2025/move/StepMoveDodge`: preserve automatic single-player use and native multi-player choice |
| Dodge | `step/bb2025/block/StepBlockDodge`: retain conditional choice and automatic cases |
| Stand Firm, Side Step | `skillbehaviour/bb2025/StandFirmBehaviour`, `SidestepBehaviour`, `step/bb2025/block/StepPushback`: retain cancellations, native chain-push ordering and destinations |
| Wrestle | `skillbehaviour/bb2025/WrestleBehaviour`: retain separate attacker/defender choices |
| Fend, Taunt | `step/bb2025/block/StepFollowup`: retain native follow-up decisions and cancellations |
| Dump-Off | `skillbehaviour/bb2025/DumpOffBehaviour`, `step/mixed/pass/StepInitPassing`: native pass sequence; the BB2025 `PassMechanic.isInRange` override now enforces Quick Pass range for both browser offers and native commands (May 2026 FAQ, page 3) |
| Trickster | `step/bb2025/block/StepTrickster`: native destinations and optional pickup continuation |
| Steady Footing | Native `canAvoidFallingDown` behavior and skill-use/reroll dialogs |
| Safe Pair of Hands | `step/bb2025/shared/StepPlaceBall`: fix the team-dependent pause flag and retain own-turn context in new checkpoints |
| Saboteur | `skillbehaviour/bb2025/SaboteurBehaviour`: retain attacker then defender ownership |
| On the Ball | `step/mixed/pass/StepPassBlock`: browser selection/movement uses native commands and preserves committed results |
| Diving Catch, Catch | `step/bb2025/shared/StepCatchScatterThrowIn`: retain active/passive catcher ordering and native Catch reroll choices |
| Dwarfen Grit | `step/bb2025/shared/StepHandleDropPlayerContext`: retain victim-owned injury modification |

This audit verifies the adapter's use of native mechanics and targeted regressions. It is **not a complete line-by-line certification against the printed Third Season rulebook**, which was not supplied. Public official FAQ evidence does not contain every skill's full wording; unmodified native timing/formula assumptions remain subject to that source comparison.

### Validation evidence

All final checks below passed. On 2026-10-17, the user accepted the implementation for merging through a pull request and closing issue #294, with continued validation during real play.

Ongoing validation should cover all 19 inventory entries over time, especially own-turn chain pushes, nested On the Ball reactions, silent/disconnected coaches, expired decisions after recovery, and automatic-use paths. Compare remaining native timing/formula assumptions against the full printed Third Season rulebook when available. Issue closure records implementation completion; live-play validation continues and any discovered defects should be tracked in follow-up issues.

- Browser unit suite: `cd browser-client; npm.cmd test` — **310 passed** on the final browser sources.
- Browser focused protocol/reaction suite — 24 passed after the decoder and committed-push changes.
- Browser interaction: `node test/reactive-decisions-ui.mjs`, `node test/follow-up-ui.mjs`, `node test/playback-ui.mjs`, `node test/reconnect-ui.mjs` — passed.
- Local startup recovery: registered `reactive-decisions-ui.mjs` in `tools/validation/browser-shards.json`; the missing inventory entry caused the immediate generic startup failure. A later overlapping `npm ci` partially removed dependencies and failed on a Windows file lock; a single subsequent startup restored them.
- Full `node tools/dev-local.mjs --start` passed after correcting compact prompt placement when only reduced destination spacing fits. The existing Hit and Run layout regression now forces the cramped 640×330 case; the focused check passed three consecutive runs and the fixed-size check passed. All **47 browser validation suites** passed (five shard reports in `.tools/validation/local-browser-S7WETq`). The Docker build passed **175 common and 428 server tests**, with two existing opt-in server skips. The live proxy connection/reconnect check passed; Hosting, healthy review database/server and the computer player started successfully. Log: `.tools/dev-local-recovery-final.log`.
- Browser builds: `npm.cmd run build --ignore-scripts` and `npm.cmd run build:play --ignore-scripts` — passed.
- Computer player: `cd computer-player; npm.cmd test` — 13 passed, including off-turn reactive policy decisions.
- Game service: Java 21 Maven `-f game-service/pom.xml verify` — 29 tests passed; package built.
- New `ReactiveSkillDecisionTest` — **13 passed**, covering all 19 inventory entries through native skill/player-choice catalogs plus live native sequences, deadlines, wrong-owner/late responses, atomic destinations, committed movement, nested interruptions and recovery.
- New transport deadline regression passed in `BrowserMatchTransportTest`: bounded worker enqueue, retry after rejection/exception, and shutdown behavior.
- Pre-merge independent review found and corrected two nested On the Ball cases: distinct same-coach reactive skills now receive separate deadlines, and the normal turn coach's nested choice runs the normal clock. The extended recovery regression failed before the deadline fix and passed afterward; `ReactiveSkillDecisionTest,BrowserMatchTransportTest` passed **17 tests** on the corrected sources. Review found no remaining actionable standards/spec issues. Logs: `.tools/reactive-nested-review-red.log` and `.tools/reactive-nested-review-green.log`.
- Full unsharded Java clean verification: `tools/target-build.ps1 verify -JavaHome .tools/jdk-21.0.11+10` — passed before the final refinements: 175 common, 424 server, 23 client-logic and 254 native tests; 9 existing opt-in tests skipped.
- Final clean verification of the finished sources used the exact source snapshot in `.tools/reactive-validation-20261017`, Java 21, Maven 3.9.9, profile `mockito5`, and the checked-in `bb2025-reactive-skills-native-tests.txt` manifest. **691 tests passed**: 175 common, 428 server, 23 client-logic and 65 affected native; 2 additional existing server opt-in tests skipped. All eight modules built successfully. Logs: `.tools/reactive-isolated-verify.log`.
- Actual native/browser boundary: `node --experimental-strip-types browser-client/test/reactive-native-contract.mjs .tools/reactive-live.jsonl` — **19 public native frames decoded**, including 16 reactive decisions. The fixture comes from the new native tests via `-Dreactive.fixture=<absolute JSONL path>`; it contains synthetic public match state only.
- `git diff --check` — passed.

Reproduce the final Java run with the repository-local Maven/JDK and these arguments (use absolute paths for the two files):

```text
mvn --batch-mode --no-transfer-progress --settings .mvn/settings.xml --global-settings .mvn/settings.xml -Dmaven.repo.local=<repository cache> -Pmockito5 -Dnative.shard.includesFile=<bb2025-reactive-skills-native-tests.txt> -Dreactive.fixture=<public JSONL export> clean verify
```

The final build ran in an isolated worktree because the workstation's background Java compiler rewrote Maven output with Java 8 classes during a prior run, producing a mixed-class `NoSuchMethodError`. `javap` confirmed the version mismatch. The isolated build passed the previously affected activation/recovery check and all final suites; source hashes matched the main working tree. The actual boundary check also caught a paused-clock schema mismatch, which was fixed before the successful final run.

Screenshots in `.tools/reactive-review` cover both **Old World Classic** and **Badlands Brawl**, desktop 1366×768/1280×800 and Android-size portrait 390×844/landscape 844×390. Countdown and decline controls fit and remain usable. Physical Android/Linux devices were not tested. The existing portrait camera/scenery failure remains visible in the captures and is outside this feature's changes.

The baseline Java 8 build command cannot compile the repository's current Jetty dependency. Validation uses the repository's Java 21 target toolchain. Sandboxed Maven and computer-process checks initially hit filesystem/process access restrictions; permitted runs outside that sandbox resolved those environment failures.
