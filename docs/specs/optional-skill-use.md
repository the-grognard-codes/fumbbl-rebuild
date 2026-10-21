# Feature: Optional Skill Use

## Abstract
Allow authenticated browser BB2025 coaches to choose Always Use or Always Ask independently for the 18 approved skill use cases.

## Objective
Allow tactical declines, including Dodge block protection and Stand Firm, while retaining convenient automatic use. Preferences belong to the coach account across matches and devices.

## Context / Existing Behavior
Native skill use mixes automatic effects, binary prompts and combined reroll/player selections. Browser display preferences are local-only; gameplay use has no account preference service. The approved design is [the skill inventory](optional-skill-use-inventory.md), including the user's edited defaults and final Q11-Q13 signoff.

## In Scope
| Use case | Included decision | Default |
| --- | --- | --- |
| `catch.1` | [Catch](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Catch.java): Catch reroll | **Always Use** |
| `dodge.1` | [Dodge](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Dodge.java): Movement dodge reroll | **Always Use** |
| `dodge.2` | [Dodge](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Dodge.java): Avoid a Stumble knockdown during a block | **Always Use** |
| `sure-feet.1` | [Sure Feet](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/SureFeet.java): Rush reroll | **Always Use** |
| `fend.1` | [Fend](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Fend.java): Prevent the attacker following up | **Always Ask** |
| `steady-footing.1` | [Steady Footing](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/SteadyFooting.java): Attempt to avoid knockdown or falling over | **Always Use** |
| `strip-ball.1` | [Strip Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/StripBall.java): Make a pushed ball carrier drop the ball | **Always Use** |
| `sure-hands.1` | [Sure Hands](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/SureHands.java): Pickup reroll, excluding Secure the Ball | **Always Use** |
| `tackle.1` | [Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Tackle.java): Prevent an opponent using the Dodge movement reroll | **Always Use** |
| `tackle.2` | [Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Tackle.java): Prevent Dodge protecting against a block Stumble | **Always Use** |
| `taunt.1` | [Taunt](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Taunt.java): Require the attacker to follow up | **Always Ask** |
| `wrestle.1` | [Wrestle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Wrestle.java): Use on Both Down as attacker | **Always Ask** |
| `wrestle.2` | [Wrestle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Wrestle.java): Use on Both Down as defender | **Always Ask** |
| `pass.1` | [Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Pass.java): Ball pass reroll | **Always Use** |
| `pass.2` | [Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Pass.java): Bomb throw reroll | **Always Use** |
| `grab.1` | [Grab](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Grab.java): Use expanded push destinations, retaining square selection | **Always Use** |
| `stand-firm.1` | [Stand Firm](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/StandFirm.java): Decline a push, including a chain push | **Always Ask** |
| `pick-me-up.1` | [Pick-me-up](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/PickMeUp.java): Choose which nearby prone teammates attempt to stand | **Always Ask** |

Sure Hands is selected for its pickup reroll only; its separate Strip Ball immunity row was not selected. Pass includes the ball and bomb reroll rows explicitly marked in the inventory. Other unselected core rows are deferred.

## Out of Scope
- All special abilities, unselected core use cases, other rulesets and Java desktop settings.
- Per-player/team overrides or automatic team/Pro resource and die choices.
- UI / UX changes outside those required for presenting additional skill decisions and/or creating the new game settings menu options.

## Functional Requirements
- Provide account-wide preferences across matches and devices, applying to all players owned by that coach. No player or team overrides in this release.
- Create an Automatic Skill Use section within Game Settings > Skills & Traits, with radio buttons for Always Use and Always Ask for each approved use case.
- Always Use accepts an eligible binary skill decision before opening a prompt or starting a decision deadline. It also operates while its coach is disconnected, subject to existing match pauses.
- Always Ask uses the existing server-owned timed decision and its normal timeout result. Newly exposed optional decisions need equivalent timed behavior.
- Live preference changes apply to the next eligible decision. They do not answer or restart an already-open prompt.
- An explicitly configured Always Use may consume a limited-use skill allowance. All special abilities are excluded. Grab still requires the normal push-square input. Pick-me-up is the agreed exception: Always Use attempts recovery for every eligible teammate, while Always Ask retains recipient selection. Other target, square, die, action, and resource selections stay manual.
- Declining a skill reroll skips only that skill for the current roll and retains other legal reroll sources. Do not automatically spend a team reroll or Pro.
- Under Always Ask, skip provably irrelevant applications without moving decisions past their legal timing or revealing extra dice.
- Keep native eligibility, skill cancellation, owner routing, and sequence order. Compulsory rules and compulsory subcases take precedence over preferences.
- Replays use recorded decisions and do not consult current preferences. Recovery preserves accepted decisions and an already-pending decision rather than applying it twice.
- Exclude UI / UX changes outside those required for presenting additional skill decisions and/or creating the new game settings menu options. Preserve MUTP themes and existing scaffolding.

## Acceptance Criteria
- All selected cases expose independent accessible radio controls in Game Settings > Skills & Traits > Automatic Skill Use with the approved defaults.
- Preferences persist by verified account identity and load in another match/device; users cannot access another account's settings.
- Always Use bypasses the binary prompt and deadline, including native automatic/conditional branches and disconnected owners.
- Always Ask opens the normal timed decision only where the skill can affect legal play. Decline/timeout skips only the selected skill and retains other legal reroll resources.
- Required Grab destination input remains manual. Pick-me-up automatic mode attempts every eligible teammate and stands only successful rolls; ask mode retains recipient selection.
- A preference edit does not answer/restart an already-open decision. Recovery retains decision state/deadlines and applies no choice twice. Frozen replay depends only on recorded decisions.
- Native legality, owners, cancellation, ordering, limited allowances, compulsory exceptions and other rulesets remain correct.

## Constraints
- Implementation branch: `feature/optional-skill-use`, based on `926dc8ea9` main.
- Preserve the approved inventory and unrelated edits. The user subsequently authorized staging, committing, pushing, opening a PR, merging after CI and deleting the working branch. Hosted deployment remains outside this authorization.
- Preserve MUTP styling and all supported browser themes/layouts on Android, Windows and Linux.
- Follow Java service/import/ruleset isolation conventions. Add the latest ChangeList entry.

## Implementation Guidance
Use an authenticated v2 settings route backed by an account-keyed JDBC repository and explicit schema migration. Bridge match role to durable account membership so disconnected decisions use account policy. Native code consumes a small policy service enabled only by browser BB2025 sessions. Persist pending native decision state at existing checkpoint boundaries; never consult current preferences during frozen replay reconstruction.

## Validation
Build an affected-test manifest. Run focused model/repository/auth/protocol/native checks first, followed by relevant unit/browser suites and server/browser builds. Exercise affected settings/live-play/replay/reconnect/recovery UI paths and themes; update timing/appearance assertions. Classify and repair failures, then report exact commands/results and any remaining gaps.

## Completion Notes
User authorized the usual implementation workflow on 20 October 2026, then accepted the changes and authorized delivery through a PR after CI passes. All slices below are implemented, self-reviewed and validated; the PR closes their tracking issues on merge.

| Slice | Issue | Dependency | Status |
| --- | --- | --- | --- |
| Account preference model, persistence, authenticated API and UI | [#315](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/315) | None | Implemented and validated; approved for delivery |
| BB2025 ordinary skill rerolls | [#316](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/316) | #315 contract | Implemented and validated; approved for delivery |
| BB2025 block/reaction decisions and integrated validation | [#317](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/317) | #315 contract; integrate #316 | Implemented and validated; approved for delivery |

Validation evidence, self-review findings and delivery limits are recorded in [the outcome report](optional-skill-use-outcome.md).
