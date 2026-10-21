# Optional Skill Use — implementation outcome

Implementation branch: `feature/optional-skill-use`, based on main `926dc8ea9e1e245161f86b198d0bf0c5bd128c6b`. At initial handoff, changes remained uncommitted. The user subsequently accepted the changes and authorized staging, committing, pushing, opening a PR, merging after CI passes and deleting the working branch. Hosted deployment remains outside this authorization. Subsequent authorized dev-local startup and compatibility repair are recorded below.

The [approved inventory](optional-skill-use-inventory.md) and [feature specification](optional-skill-use.md) remain the scope authority. All 18 selected cases across 14 core skills/traits are implemented with the approved independent defaults. Special abilities and other rulesets have no settings controls.

## Slices

| Issue | Delivered behavior |
| --- | --- |
| [#315](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/315) | Immutable account policy; per-case JDBC persistence; strict authenticated v2 API; schema-8 migration/bootstrap verification; accessible Automatic Skill Use radio groups; save/error/reload handling; local provisioning and maintenance compatibility. |
| [#316](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/316) | Catch, Dodge movement, Sure Feet, Sure Hands pickup, Tackle movement and separate Pass ball/bomb policies. Declining a skill retains legal team/Pro/modifier alternatives without reoffering that skill. |
| [#317](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/317) | Dodge block, Tackle block, Strip Ball including Juggernaut pushes, Grab, Fend, Taunt, both Wrestle roles, Stand Firm, Steady Footing and Pick-me-up. Native decisions, deadlines and pending choices survive recovery. |

Implementation and validation results are also recorded on [#315](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/315#issuecomment-6283898070), [#316](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/316#issuecomment-6283899632) and [#317](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/317#issuecomment-6283901045).

## Acceptance review

| Requirement | Implementation and evidence |
| --- | --- |
| Complete list and user signoff before implementation | Inventory retains all core candidates and the user's selected rows/defaults; implementation followed final signoff. |
| Independent account preferences across matches/devices | Verified principal supplies identity; durable match membership resolves each coach's policy before actions and watchdog expiry. Per-case upserts retain concurrent changes to other settings. Real MariaDB integration exercised concurrent devices and account isolation. |
| Always Use bypasses binary prompts/deadlines | Policy resolves within the native executor before browser projection. Native reaction tests cover automatic effects, limited allowances, coach order, Pass ball/bomb separation and no reaction timer. |
| Always Ask uses normal timed decisions | Existing native prompt projection and server expiry cover the new cases. Owner checks, wrong-actor rejection, deadlines and timeout declines are covered by native tests. |
| Retain other reroll choices after a decline | Native reroll tests cover Catch, Dodge, Sure Feet, Sure Hands and Pass; remaining team/Pro choices stay unspent and the declined/cancelled source is absent. |
| Preserve required selections | Grab Always Use expands legal destinations and still waits for a manual square. Pick-me-up Always Use attempts every eligible recipient; failed rolls remain prone. Ask retains recipient selection. |
| Skip irrelevant prompts and preserve native information | Tackle movement waits until a native Dodge-reroll opportunity exists, retains the original die across the opposing coach's choice, and skips successful dodges. Grab skips its gate when destination sets are identical. Tackle block preserves native cancellation exceptions. |
| Pending edits/reconnect/recovery | Preferences do not execute the game. Pending step answers and held rolls are serialized; native tests retain reaction identity/deadline across recovery and changed policy. Older native Dodge prompts retain their manual answer when preferences become enabled. |
| Replay follows recorded outcomes | Frozen transcript/replay remains independent of current account preferences. Existing replay/seek, authoritative dice, reconnect and retained-retry browser journeys passed. |
| Preserve themes and supported layouts | Settings UI checks cover 18 groups/36 radios, keyboard access, confirmation/error states, replay/spectator exclusion, existing markers and four viewport sizes. Desktop and narrow-screen screenshots were inspected. |
| Preserve unrelated changes and delivery boundaries | Approved inventory was retained; implementation uses the requested branch. Publishing and merging were authorized separately after user acceptance. |

## Self-review findings fixed

- Consumed native skill dialogs could survive into a later step and be accepted repeatedly. Executor cleanup now removes the same consumed dialog after a successful command while preserving replacement decisions, including manual answers and timer declines.
- A skill reroll's expired deadline could carry into the remaining resource chooser. Selected skill prompts now have a distinct decision identity; their decline/timeout leaves a fresh legal reroll decision. Diving Tackle's explanation remains available in both phases. Consumed older combined reroll dialogs are also cleared before the next step can apply current policy to them.
- A generic reroll request could rediscover Dodge after Tackle cancelled it. Browser BB2025 uses the native mechanic with the explicitly available source, preserving cancellation and other resources.
- Tackle movement originally asked before the original roll. It now follows the native reroll opportunity and persists the held original roll, avoiding irrelevant successful-dodge prompts or duplicate dice.
- BB2025 Dodge behavior requires a public abstract superclass for the existing ClassGraph discovery path. Registration is asserted by the block regression fixture.
- Strip Ball re-entry could repeat Dodge/Watch Out hooks. The specialized BB2025 step persists completed hooks and applies each report/effect once.
- Grab avoids a preference prompt when it cannot change destinations; Watch Out keeps its existing special-ability behavior. BB2020/shared behavior remains isolated from BB2025 policy.

## Validation

The full multi-module `clean install` passed. Final review then added three regression cases and repaired reroll deadline/dialog handling; a second clean common/server build and the affected native suite validate those final changes. All reported runs have zero failures and errors. Opt-in skips are identified separately below.

| Check | Result |
| --- | --- |
| Full multi-module Maven `clean install` | Passed: 971 tests discovered, 961 passed, 10 opt-in skips. Common 175; server 516 (3 skips); client logic 23; native state tests 257 (7 skips). All modules compiled, tested and packaged. |
| Final-source clean common/server `package` | Passed: common 175 and server 519 (3 opt-in skips), including all 38 optional block/reaction/reroll and reactive-decision checks. Server JAR and ZIP packaged successfully. |
| Final-source affected native suite | 73 tests passed, 0 skipped: ManualSkillRerollTest, GameStateExecuteStepTest, RecoverySessionTest, CoreTurnActionsTest, PassWorkflowTest, BlockTest and SecureBallRerollTest. |
| Focused native optional-skill/reaction suite | Final server run passed OptionalBlockSkillUseTest (7), OptionalReactionSkillUseTest (9), OptionalRerollSkillUseTest (9) and ReactiveSkillDecisionTest (13). |
| Foundation/API/application/schema focused suite | 71 tests, 0 failures/errors, 1 existing opt-in skip. The new real MariaDB integration executed successfully. |
| Browser unit suite, `npm.cmd test` in `browser-client` | 344 passed, 0 skipped. |
| Browser production build, `npm.cmd run build:play` | TypeScript and Vite production build passed. |
| Interaction shard 1 | All 12 suites passed: reroll choices/readiness, apothecaries, reactive timers, pitch/push controls, logs and dice alignment. |
| Interaction shard 4 | All 15 suites passed: passes/transfers, movement, preparation/computer selection, threats, confirmation/actions, playback, teammate actions, manual reroll reconnect/retry and route checks. |
| New settings UI and existing Game Menu UI | Passed; desktop/mobile screenshots inspected. |
| Maintenance/provisioning checks | 12 maintenance tests, script syntax and browser-manifest coverage passed. |
| Whitespace | `git diff --check` passed. |

Java validation uses Temurin `21.0.11+10-LTS`, Maven `3.9.9`, profile `mockito5`, and the existing `.tools/repository` dependency cache. The system's pinned-JDK directory was incomplete, so the cached exact JDK archive was extracted into `.tools/optional-skill-toolchain/jdk-21.0.11+10`.

Background Java compilation wrote unresolved-type stubs into the checkout's `target` directories. Java checks therefore used isolated source copies with independent build output: `.tools/optional-skill-build` for the broad clean install, then `.tools/optional-skill-final-build` for the final clean server build and native regressions after review fixes. These copies omit unrelated artwork/public assets and include all Maven module sources, resources and bundled repositories. They do not modify the source checkout.

Before the subsequent compatibility repair, byte comparison confirmed all 4,666 Maven source/resource/POM files matched the source checkout. That handoff snapshot's sorted path-and-content SHA-256 is `a91ccdf315b8b6a56df78c13b970c96ed78e3237fe1caf8f69c1bdf64e586224`; evidence is in `.tools/optional-skill-validation/maven-source-snapshot.json`. The follow-up Docker build below tests the corrected checkout directly.

Java commands use the repository's pinned target toolchain:

```powershell
$env:JAVA_HOME = '<workspace>/.tools/optional-skill-toolchain/jdk-21.0.11+10'
$env:MAVEN_SKIP_RC = 'true'
# Working directory: <workspace>/.tools/optional-skill-build
& '<workspace>/.tools/apache-maven-3.9.9/bin/mvn.cmd' --batch-mode --no-transfer-progress `
  --settings .mvn/settings.xml --global-settings .mvn/settings.xml `
  '-Dmaven.repo.local=<workspace>/.tools/repository' -Pmockito5 clean install

# Working directory: <workspace>/.tools/optional-skill-final-build
# Same executable, environment and settings/cache arguments:
mvn --offline -Pmockito5 -pl ffb-server -am clean package
mvn --offline -Pmockito5 -pl ffb-statetest -am `
  '-Dtest=ManualSkillRerollTest,GameStateExecuteStepTest,RecoverySessionTest,CoreTurnActionsTest,PassWorkflowTest,BlockTest,SecureBallRerollTest' `
  '-Dsurefire.failIfNoSpecifiedTests=false' test
```

Browser interaction commands, run from the source checkout:

```text
node tools/validation/browser-suites.mjs --family interaction --shard 1 --report-directory .tools/optional-skill-validation
node tools/validation/browser-suites.mjs --family interaction --shard 4 --report-directory .tools/optional-skill-validation
```

Settings checks ran with `node test/skill-use-preferences-ui.mjs` and `node test/game-menu-events-ui.mjs` from `browser-client`. The new settings suite records four screenshots when `SKILL_USE_EVIDENCE_DIR` points to `.notes/verification/optional-skill-use-ui`.

Broad-build skips were the opt-in Marker6SchemaTest, SkillUsePreferenceSchemaIntegrationTest and V2PreparationJdbcTest server checks, plus R5CompletedFixtureGeneratorTest, R5RestoredContinuationTest, two RecoveryApplicationTest checks, RecoveryArtifactInspectionTest and two V2RuntimeIntegrationTest checks. The new skill-use schema integration was separately enabled and passed against disposable MariaDB; the other opt-in checks were not enabled.

Local evidence: `.tools/optional-skill-full-build.log`, `.tools/optional-skill-final-server-build.log`, `.tools/optional-skill-final-native.log`, `.tools/optional-skill-isolated-gameplay.log`, `.tools/optional-skill-browser-unit.log`, `.tools/optional-skill-browser-build.log`, `.tools/optional-skill-validation/interaction-{1,4}.json`, and `.notes/verification/optional-skill-use-ui/` screenshots.

## Delivery limits

Production requires the explicit [schema-8 migration](../operations/skill-use-preferences-schema.md). Production startup verifies schema and does not silently migrate it. At initial handoff, migration/JDBC behavior had been exercised only in a dedicated disposable MariaDB 11.8.9 database. The subsequent authorized dev-local migration is recorded below; no production database was changed. The full database-copy provisioning workflow was syntax checked rather than executed.

No remote release or deployment was performed. The approved delivery PR closes the three implementation issues when merged after CI passes.

## Subsequent dev-local verification and persistence repair — 20 October 2026

The user requested a clean dev-local restart. All existing review services were stopped, database volumes retained, and the current Hosting/server artifacts rebuilt. The review database was still marker 7, so a stopped-service SQL backup was saved before the protected `schema-bootstrap` migrated it to 8. Counts and INSERT data for all 17 existing tables matched the backup. The user renewed expired Google ADC; Firebase access then passed. All four interaction shards and the hosted group passed (53 suites, 62 reported checks, zero skips). The live proxy initial/reconnect test passed, and the computer daemon registered and resumed retained matches. Evidence: `.tools/dev-local-restart-20261020/result.md`.

The user then reported `PERSISTENCE_FAILED` on Play. Inspection found an omitted compatibility guard: `JdbcSavedTeamRepository.lockWrites` still accepted only marker 7 for account-team inserts and updates. Reads and authentication continued to work on 8. A new repository regression failed with `Saved-team schema unavailable` before the fix; the guard now accepts exactly 7 and 8. Legacy profiles and unknown future markers still fail closed. A real migration regression now creates a named team on 7, migrates to 8, edits and creates teams, verifies exact create retries and account isolation, and rejects duplicate names. Its dedicated disposable MariaDB database was removed afterward. All nine retained saved-team rows also passed a read-only metadata consistency check.

Follow-up validation passed:

- `JdbcSavedTeamRepositoryTest,SavedTeamServiceTest,BrowserSavedTeamJsonTest,BrowserSkillUsePreferencesTest`: 31 tests, zero skips.
- Enabled `SkillUsePreferenceSchemaIntegrationTest` against disposable MariaDB: 1 passed, zero skips.
- Current-source Docker common/server package: 175 common and 521 server checks, zero failures/errors, 3 opt-in server skips. Server image rebuilt and replaced only the dev-local game service.
- `npm.cmd test --prefix browser-client`: 344 passed, zero skips.
- `node tools/match-review-adc-check.mjs` and `node --test deployment/game-service/proxy/live-local-test.mjs`: passed after restart. `git diff --check`: passed.

Logs are `.tools/dev-local-restart-20261020/saved-team-schema-{red,green}.log`, `schema-integration.log`, `schema-fix-image-build.log`, `schema-fix-server-restart.log` and `schema-fix-browser-unit.log`.

The user then confirmed the trigger was **Create game** and authorized one explicit retained retry. Reconnecting succeeded, but that retry still returned `PERSISTENCE_FAILED`; the saved-team repair was necessary but did not resolve the remaining activation failure.

A disposable clone of the live review database reproduced the distinction: all nine saved-team loads, nine human creations and nine computer creations succeeded, while both retained setup activations returned `PERSISTENCE_FAILED`. `JdbcRecoveryRepository.reserveRetention` rejected marker 8 with `Recovery schema unavailable`, preventing the first checkpoint from being saved. A permanent regression failed on that exact guard before the fix. Initial recovery admission now accepts published markers 5 through 8 and rejects earlier/unknown future markers. The real migration test also creates a checkpoint before migration, admits a fresh one on 8 and updates the retained checkpoint after migration.

Final recovery-fix checks passed:

- Focused recovery/application suite: 17 passed, zero skips (`JdbcRecoveryRepositoryTest` and `SetupApplicationSkillUsePreferencesTest`).
- Expanded real MariaDB migration test: 1 passed, zero skips.
- Fresh live-data clone: all 9 team loads, 9 human creations, 9 computer creations and both retained setup activations returned `ACCEPTED`. The previously failing native activation path is now green.
- Current-source Docker package: 175 common and 523 server checks, zero failures/errors, 3 opt-in server skips. The image replaced only the local game server; Firebase access and live initial/reconnect routing passed.
- Clean browser/site/Hosting build and browser units: 344 passed, zero skips. Temporary diagnostic logging was removed; `git diff --check` passed.

Evidence: `.tools/dev-local-restart-20261020/recovery-schema-{red,green}.log`, `schema-integration.log`, `probe-cloned-preparation.log`, `recovery-fix-image-build.log`, `recovery-fix-server-restart.log`, `persistence-clean-browser-build.log` and `recovery-fix-browser-unit.log`. Disposable cloned databases, dumps and temporary credentials were removed. No live match request was submitted by the diagnostic probes.

The first post-restart proxy probe timed out while startup/restoration was in progress. Repeating the same read-only initial/reconnect check after startup settled passed in about one second; see `recovery-fix-proxy-check.log`. No routing or timeout code was changed.

Browser inspection lost access to the original tab during reload, so the user refreshed Play and retried the retained request after this final repair. The user confirmed **“The game proceeds normally.”** This completes the original live-browser verification as well as the native copied-data reproduction. No retained intent or user data was discarded.

The user subsequently confirmed that a hard refresh cleared the remaining browser state and accepted the feature changes.

## Session retrospective

Reviewed this session using [the repository retro skill](../../.agents/skills/retro/SKILL.md) and its [writing guidance](../../.agents/skills/writing-for-agents/SKILL.md).

1. **Build isolation:** the Java language service and Maven shared `target` output, producing unresolved-type stubs and misleading type errors. A build-tool option for an isolated output directory would avoid these collisions without changing an editor's global settings. The current toolchain preflight already rejects the wrong JDK; the remaining environment issue is a complete pinned installation and independent output, rather than another prose instruction.
2. **Reroll request contract:** `reRollSkill(null)` currently rediscovers the skill. Callers that have deliberately declined or cancelled a source need explicit suppression. This feature delegates those cases directly to the ruleset mechanic and tests that the skill stays absent. A future shared API change should represent discovery and suppression separately and test both; changing all rulesets was outside this feature's scope.
3. **Migration verification:** schema shape, account preference writes and read-only service health did not catch independent schema guards in team creation and initial recovery admission. The permanent MariaDB migration check now exercises both kinds of writes across the version change. A copied-data native activation probe confirmed the reported failure and its repair without mutating live requests.
