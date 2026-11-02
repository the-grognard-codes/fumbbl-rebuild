# Bug fix roundup #5

Owner-approved scope, 2026-11-01. Branch: `fix/bug-fix-roundup-5`; base: `82ed067ea` (`main`).

Gameplay: BB2025 only. Implementation, self-review, tests and dev-local startup are authorized. Commits, push, PR, merge and remote publication are not authorized.

GitHub tracking: issues #394–#406, one per approved item. Implementation results and validation are recorded in [the outcome report](bug-fix-roundup-5-results.md). CLI authentication works through the host Windows credential store.

# Item 1: Keep successful movement rolls from pausing player actions

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/394

## Abstract
Bug fix roundup #5, item 1. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Keep successful movement rolls from pausing player actions.

## Context / Existing Behavior
Successful dodge, rush and pickup rolls visibly stall movement after smooth-clock changes.

## In Scope / Functional Requirements
Present successful action rolls at the corresponding board movement without waiting for dice display lifetime. New rolls may replace earlier displays; retain every result in the log. Failed rolls retain normal decisions and rerolls.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Deterministic presentation timeline tests for dodge, rush, pickup, consecutive successes and failure decisions.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 2: Remove duplicate native tooltips from MUTP hover controls

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/395

## Abstract
Bug fix roundup #5, item 2. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Remove duplicate native tooltips from MUTP hover controls.

## Context / Existing Behavior
Hovering resources and other controls shows both native and MUTP tooltips.

## In Scope / Functional Requirements
Keep only the MUTP blue/gold tooltip where custom hover help exists. Preserve accessible names and keyboard focus behavior.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Browser assertions for resource hover and representative shared controls; inspect actual rendered tooltip.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 3: Expire weather dice after three seconds

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/396

## Abstract
Bug fix roundup #5, item 3. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Expire weather dice after three seconds.

## Context / Existing Behavior
Weather dice persist until another roll occurs.

## In Scope / Functional Requirements
Hold the settled weather result for three seconds then use default fade-out. Preserve default fade-in. A later roll may replace it sooner.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Controlled-clock weather expiry and replacement tests plus visual browser check.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 4: Skip Kick decisions when both results cause a touchback

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/397

## Abstract
Bug fix roundup #5, item 4. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Skip Kick decisions when both results cause a touchback.

## Context / Existing Behavior
Kick is offered even when both original and reduced deviation end in touchbacks.

## In Scope / Functional Requirements
For BB2025 suppress Kick choice only when accepting and declining both inevitably cause touchback. Continue remaining kickoff steps and touchback assignment normally. Keep meaningful choices.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
BB2025 native tests for both-touchback, only-one-touchback, legal endpoints and no eligible kicker.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 5: Restore Enter-to-chat focus and close behavior

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/398

## Abstract
Bug fix roundup #5, item 5. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Restore Enter-to-chat focus and close behavior.

## Context / Existing Behavior
Chat remains open after sending and Enter no longer focuses it.

## In Scope / Functional Requirements
Successful send clears draft and closes input. Enter reopens and focuses. Empty Enter/Escape closes. Escape with nonempty text closes but preserves draft for reopening. Preserve normal input and dialog keyboard handling.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Browser keyboard tests covering repeated sends, whitespace/empty dismissal, preserved drafts, focus and failed sends.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 6: Expose Jump Up block targeting and confirmation in Browser V2

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/399

## Abstract
Bug fix roundup #5, item 6. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Expose Jump Up block targeting and confirmation in Browser V2.

## Context / Existing Behavior
Prone Jump Up players cannot access the alternate agility-test Block flow.

## In Scope / Functional Requirements
For BB2025 show a Jump Up mode and new matching icon when an eligible prone player begins activation beside a standing opponent. Select target then Confirm to commit and roll; allow changing/cancelling before confirmation. Success stands and blocks normally; failed final test ends activation prone. Reuse server skill/reroll rules.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Native and browser tests for eligibility, target selection, cancellation, success, failure and ordinary free stand-up.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 7: Allow prone Throw Teammate declarations and verify Kick Teammate

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/400

## Abstract
Bug fix roundup #5, item 7. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Allow prone Throw Teammate declarations and verify Kick Teammate.

## Context / Existing Behavior
Prone players cannot declare Throw Teammate; Kick Teammate may share the issue.

## In Scope / Functional Requirements
For BB2025 allow legal Throw Teammate declaration while prone without requiring any available or reachable throwable teammate. Preserve normal movement and subsequent execution legality. Verify Kick Teammate equivalent and fix if reproducible.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Native declaration tests for prone/no teammate/unreachable teammate and Kick Teammate; browser menu coverage.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 8: Restrict kickoff ball cursor to the placing coach

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/401

## Abstract
Bug fix roundup #5, item 8. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Restrict kickoff ball cursor to the placing coach.

## Context / Existing Behavior
Receiving coach sees a ball following their cursor during kick placement.

## In Scope / Functional Requirements
Show the cursor ball only to the kicking coach during initial kick placement. Receiving coach and spectators never receive this placement preview; clear after placement.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Role and phase matrix tests plus browser pointer check.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 9: Apply Eye Gouge only after qualifying standing push outcomes

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/402

## Abstract
Bug fix roundup #5, item 9. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Apply Eye Gouge only after qualifying standing push outcomes.

## Context / Existing Behavior
Eye Gouge is missing or incorrectly timed after push/stumble block outcomes.

## In Scope / Functional Requirements
BB2025 Block and Blitz push or stumble applies Eye Gouge when the target was pushed and remains standing after block resolution. Stand Firm preventing push does not apply it. Preserve status lifecycle.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Native outcome tests including push, stumble with/without Dodge, knockdown, Stand Firm and Blitz.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 10: Resolve On The Ball kickoff and pass reactions without hanging

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/403

## Abstract
Bug fix roundup #5, item 10. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Resolve On The Ball kickoff and pass reactions without hanging.

## Context / Existing Behavior
On The Ball kickoff decision hangs; pass reaction requires verification.

## In Scope / Functional Requirements
For BB2025 expose optional On The Ball choices and legal movement during kickoff and pass reactions. Use normal skill rules and existing optional-skill UI. Accept, decline and finish all resume the correct sequence.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Native-to-browser regressions for kickoff/pass accept/decline/movement/finish, permissions and recovery.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 11: Resolve Pile Driver decisions and preserve limited-action accounting

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/404

## Abstract
Bug fix roundup #5, item 11. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Resolve Pile Driver decisions and preserve limited-action accounting.

## Context / Existing Behavior
Eligible Pile Driver decision/foul hangs and free foul may display a consumed-action marker.

## In Scope / Functional Requirements
For eligible BB2025 ordinary Block actions, offer optional Pile Driver and resolve the skill's foul under normal rules. Mark limited action use only when an allowance is actually consumed. Preserve existing eligibility; expanding to Blitz is excluded.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Native/browser accept/decline and foul completion tests, referee decisions and free-foul action marker checks.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 12: Complete Punt direction planning with cardinal arrows

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/405

## Abstract
Bug fix roundup #5, item 12. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Complete Punt direction planning with cardinal arrows.

## Context / Existing Behavior
Punt exists in server/debug flow but product targeting is incomplete and uses dotted squares.

## In Scope / Functional Requirements
For BB2025 declare Punt from player menu and move normally. Punt mode offers existing direction arrows north/south/east/west. Selecting direction enables Confirm. Right-click clears direction/exits Punt selection while preserving planned movement; allow more movement, reselecting Punt or normal end activation.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Browser/native tests for four directions, planning, confirmation, cancellation with route preservation and execution.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.

---

# Item 13: Animate only the selected die during partial rerolls

GitHub: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/406

## Abstract
Bug fix roundup #5, item 13. Shared branch: `fix/bug-fix-roundup-5`.

## Objective
Animate only the selected die during partial rerolls.

## Context / Existing Behavior
Rerolling one die animates every die in the pool.

## In Scope / Functional Requirements
Animate only the rerolled die; other dice retain values, positions and static presentation. Preserve full-pool reroll animation and normal selection.

## Out of Scope
Prior rules editions, unrelated redesign, commit/push/PR/merge and remote deployment.

## Acceptance Criteria
- The behavior described above works through Browser V2 and the authoritative BB2025 flow where applicable.
- Regression coverage exercises the reported symptom and relevant failure/cancel paths.
- Existing MUTP presentation, accessibility and supported platform behavior are preserved.

## Constraints
Gameplay changes are BB2025 only; shared presentation remains reusable. Preserve unrelated work. Isolate rules changes in the correct ruleset package; no cross-ruleset inheritance. Record user-visible changes in CHANGELOG.md. Do not update site/updates.json before merge.

## Implementation Guidance
Reuse existing server rules and Browser V2 patterns. Local mirror: docs/specs/bug-fix-roundup-5.md. Scope confirmed by owner on 2026-11-01.

## Validation
Deterministic per-die identity and browser animation tests including same-value reroll and full-pool reroll.
Focused regressions, relevant Java and browser builds/tests, complete mandatory dev-local validation, and a started healthy dev-local instance for owner testing.

## Completion Notes
Authorized for implementation, self-review, validation and dev-local startup. Leave changes uncommitted; record results in the local outcome report and this issue.


## Preparation and validation record

- Created isolated worktree `.tools/worktrees/bug-fix-roundup-5` on `fix/bug-fix-roundup-5` from local `main` at `82ed067ea`.
- Preserved the main checkout's modified TODO.md and three untracked specs.
- GitHub access works through the host CLI and existing Windows credential store. Created issues #394–#406; sandboxed credential access and integration write permissions were the initial obstacles.
- Individual issue bodies and their creation manifest are retained under `.tools/roundup5-issues/`; each item above links its GitHub issue.
- Installed browser lockfile dependencies. Reused existing project Maven 3.9.9 and repository caches through worktree-local junctions; copied the existing configured Java-home reference. `tools/target-build.ps1 info` reports Java 21.0.11 / Maven 3.9.9.
- Baseline: `node --experimental-strip-types --test test/pitch-playback.test.ts test/dice-stream.test.ts test/dice-presentation.test.ts test/kickoff-ball-presentation.test.ts` from browser-client: 17 passed.
- Initial chat reproduction failed `Successful sending closes the composer` (visible input count 1, expected 0). The assertion is now in the maintained chat suite and passes; the temporary harness was removed.
- Implementation is complete. Final verification, review findings, limits and dev-local status are recorded in [the outcome report](bug-fix-roundup-5-results.md).
- Posted completion evidence to all thirteen GitHub issues (#394–#406), leaving them open for owner review. Dev-local is running from this worktree at http://localhost:5000/play.
- Owner follow-up for #405: after declaring Punt, expose a separate **Target Punt** pop-out beside the declaration. Reuse Jump/Jump Up sizing and shape, distinguish its icon with a crosshair, and keep it enabled when the declaration is spent but native Punt targeting remains legal. Cover declaration-to-targeting, local cancellation, one confirmed native direction, desktop and touch presentation.
- Owner follow-up for #403: offer On the Ball through the shared circular Yes/No skill prompt. Yes begins a limited activation for the selected eligible player, supporting a planned path of up to three squares in one confirmation while native tackle-zone and other restrictions remain authoritative. Preserve interruption/reroll handling and finish/decline. Fix the computer player's repeated finish/reselect loop during a pass, and verify that explicitly finishing consumes that player's reaction opportunity even without moving. Cover both passing and kickoff reactions with captured native projections and browser route tests.

### Affected validation manifest

- Owner follow-up for #395: resource help and player-card tooltips must paint above other match controls, including the overlapping Debug button. Preserve hover/focus behavior and keep resource help inside the viewport.
- Owner reversal for #396: withdraw the three-second weather-expiry change and restore the pre-roundup weather presentation, including retained results for pending choices and recovered snapshots. Do not add a new arbitrary join delay. This supersedes the original weather requirement. Dev-local was initially kept unchanged while further fixes were collected; the owner subsequently authorized restarting with all latest changes.

- Owner follow-up for #399: selected Jump Up blocks must show the normal native assist markings and proposed signed dice count. Forecast the block after a successful Jump Up without changing the live prone player or rolling dice. Changing/cancelling targets updates/clears the private preview. The requested restart now includes these changes, tooltip layering, and restored weather timing. All 70 mandatory browser suites and the server build passed; dev-local is healthy at http://localhost:5000/play. Latest evidence is in the outcome report and `.tools/roundup5-latest-dev-local.log`.

- Movement/roll timing: pitch-playback, provisional-movement, dice-stream and real-server-presentation tests; add a success-with-movement timing regression at the hook/browser seam.
- Tooltips: actual resource/dugout/player hover coverage using existing HUD and roundup-dice-hover browser harnesses.
- Weather: dice-stream expiry and weather presentation/browser tests with controlled time.
- Chat: maintained chat-ui.mjs; repeated sends, empty dismissal, draft restoration and failed-send behavior.
- Kick, Throw/Kick Teammate, Eye Gouge: focused BB2025 native rule/action tests, including unchanged older-edition behavior where shared implementations are split.
- Jump Up and Punt: native legal-action projection plus player-action-menu and movement-interaction browser harnesses; add target/Confirm/cancel coverage.
- Kick cursor: coach/spectator and phase matrix at actual cursor rendering seam.
- On The Ball and Pile Driver: native reaction/decision tests plus reactive-decisions/skill-prompts browser harnesses, including accept/decline and completion.
- Partial rerolls: per-die identity unit tests and actual PolygonDie animation checks, including same-value rerolls.
- After all focused checks pass: project-required Java tests/build, TypeScript/browser build, complete browser preflight through `node tools/deploy.mjs --environment dev-local`, healthy service checks and actual browser validation. Record report beside this spec and update every GitHub issue with results.
