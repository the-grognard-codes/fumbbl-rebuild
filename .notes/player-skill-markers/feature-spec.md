# Feature: Player Skill Markers

## Abstract

Show skill and trait markers above players so coaches can assess abilities directly on the pitch. This feature targets the browser client with BB2025 rules on Android, Windows, and Linux.

## Objective

Produce a reviewed manifest of the **108 core BB2025 skills and traits** with letter-only abbreviations and two approved marker packs: text and illustrated. Then add browser settings and pitch rendering without changing game mechanics. Unique star-player abilities belong on the player profile card opened by click or hover.

## Context / Existing Behavior

The browser pitch displays player art, numbers, selection and state indicators, and skill-specific threat overlays. The player detail card lists skills as text. Dedicated skill badges are absent. Browser player projections currently flatten skill details to names; category, provenance, and values will need authoritative presentation data for filtering and parameterized abilities.

## In Scope

- Exactly 108 core BB2025 marker identities: 72 category skills and 36 traits, matching the curated `SkillDefinitions` catalog.
- Two marker packs, using 1–3 letters for text markers. Text markers never include skill values or target numbers. Any illustrated variants are reviewed as variants of these identities during art design.
- A scrollable **Skills & Traits** tab with a **Skill Markers** heading in browser Game Settings.
- Persisted visibility, style, and size preferences and consistent presentation in live play, replay, and recovered matches.
- Unique star-player abilities presented on the player profile card shown on click or hover. A star's ordinary core skills remain eligible for pitch markers under the same filters as other players.

## Out of Scope

- Pitch markers or icon assets for unique star abilities, permanent stat changes, or named temporary effects such as Dodgy Snack, Greasy Cleats, and Iron Man.
- BB2016, BB2020, and Java desktop client changes.
- Game mechanics, sequence, or skill eligibility changes.
- Availability, cooldown, or spent-use indicators.
- Other UX changes and copying the reference game's artwork.

## Functional Requirements

1. The manifest identifies each core ability, category, source, recommended abbreviation, and any variants requiring artwork review. Block, Dodge, Guard, and Tackle receive single-letter priority; Mighty Blow retains **MB**. This presentation priority is separate from the rules' Elite designation.
2. Category colors are General blue, Agility yellow, Strength red, Mutation purple, Passing green, and Devious orange. Text markers retain the approved MUTP palette. Following illustrated round 1 review, the owner authorized modestly deeper illustrated panels in those same hues to improve contrast with ivory symbols; the text fills remain unchanged. All 36 core traits, including positive traits, use black. Ordinary core skills on star players retain their category colors. Unique star abilities have no pitch badge.
3. Initial settings are own team on, opponent on, base skills off, acquired skills on, traits on, **Show Big Guy negatraits and Secret Weapon** on, Text style, and Medium size. Size is a stepped Small / Medium / Large slider. Style is Text / Illustrated.
4. Team switches gate all markers. Traits use their own switch regardless of origin. The additional Big Guy toggle filters exactly **Bone Head, Really Stupid, Always Hungry, Animal Savagery, Unchannelled Fury, and Secret Weapon**. Turning it off must not suppress **Loner** or other traits; Show traits remains the master trait switch. Keep the two trait preferences independent and persistent. Base/acquired switches govern other core skills; temporary gains of a core skill use acquired. An effect that grants a core skill reuses that skill's marker; its effect name does not receive a separate badge.
5. Neutral spectators and replays use **Home team** and **Away team** labels in place of own/opponent. Apply the corresponding stored visibility switches consistently.
6. Show currently possessed core abilities, including temporary gains while present. Temporary inability to use an ability or spending its use does not remove its marker. Remove a temporary gain when it expires.
7. Text badges omit numeric values. Keep the complete value or target in player details. Illustrated variants may use subtle visual differences and a number if readable; choose the exact variants during artwork review. Do not create BB2020 Mighty Blow +2 or Dirty Player +2 artwork.
8. Show unique star-player abilities in the player profile card opened by click or hover, together with the player's complete skill/trait information. Pitch marker visibility filters do not hide the information in the profile card. Do not add a generic star-ability badge in place of the excluded unique-ability icons.
9. Use an overhead strip of up to three portrait badges and a **+N** overflow indicator. Order negative traits first, then prioritized elite skills, then other abilities, with stable ordering within each group. Use the existing player detail card for the complete list on hover or tap. Confirm dimensions, ordering tie-breaks, and practical capacity during sample review at all three sizes and dense pitch layouts.
10. Reuse MUTP typography, theme styling, menu scaffolding, and player action menu visual language. Match the reference's portrait form and overhead relationship to the player while fitting the browser pitch projection. Markers must preserve player targeting and existing ball, selection, and state visibility.
11. Scale pitch badges with projected player-square size, including zoom and perspective distance. Keep letters upright. Apply a minimum readable screen height rather than allowing zoom-out to make labels illegible. Text uses a 14 px minimum, raised to 20 px for strips containing a three-letter label, and widens three-letter portrait frames from 72:96 to 88:96 with taller lettering. The owner approved a 20 px illustrated minimum for every size and camera distance, deeper illustrated panels, and simplified symbols. Small and Medium illustrated markers coincide at the floor; all selected sizes still grow above it with projected player size. The production pitch uses the shared sizing helper. Strips show up to three badges; at crowded projected sizes they reduce badge capacity before shrinking below the readability floor, retaining the exact remaining count in +N.

## Acceptance Criteria

- [x] The owner reviews and approves the 108-entry core BB2025 manifest, shorthand, category mapping, and variant inventory.
- [x] The owner reviews and approves the text-only test batch, including difficult cases and pitch-size examples.
- [x] The owner reviews the illustrated sample rounds and approves their 20px minimum, deeper colors and simplified style. Specific subsequent art edits are included in the full illustrated pack for review.
- [x] The owner approves subsequent artwork at each checkpoint. The owner explicitly authorized completing the remaining text markers, then the full illustrated batch with specific art edits. Both complete packs and the isolated Eye Gouge correction were accepted by the owner.
- [x] Both approved packs cover the 108 core identities, with any parameterized variants explicitly approved. No star-ability, stat-change, or named-effect markers are added.
- [x] The scrollable Skills & Traits tab contains Skill Markers and all specified controls, with the agreed defaults.
- [x] Filtering, source classification, ordering, overflow, size, and persistence behave as specified.
- [x] The Big Guy toggle suppresses exactly the six listed trait markers, preserves Loner, persists independently of Show traits, and does not remove profile-card information.
- [x] Badge size grows with player zoom above the readability floor; three-letter text remains within its portrait frame.
- [x] Clicking or hovering a star player shows their unique ability on the profile card, independent of pitch marker filters.
- [x] A star player's ordinary core skills use the same pitch marker identities and category colors as those skills on other players.
- [x] Live, replay, and recovery render the appropriate core abilities and profile-card information without changing game behavior.
- [ ] Android, Windows, and Linux browser checks cover supported themes, pointer and touch input, and dense pitch arrangements. Windows Chrome and Android browser emulation pass; native Android and Linux remain manual checks.
- [x] Appropriate unit, browser, and game-server build checks pass after implementation; exact commands and results are recorded.

## Constraints

- Work on local branch `feature/player-skill-markers`.
- Preserve unrelated working-tree changes and repository conventions.
- Do not commit, push, deploy, or publish unless requested.
- Track manifest review, artwork reviews, implementation and automated verification on the feature issue; close the implementation issue when delivered and record any remaining manual platform checks explicitly.

## Implementation Guidance

Use the curated BB2025 `SkillDefinitions` as the exact 108-identity allowlist and the BB2025-selected native skill factory for implementation identity. Do not infer marker eligibility from a directory or the full native factory alone: the factory includes unique star abilities and stat advancements outside the approved marker scope. Use authoritative category, provenance, value, and unique-ability data rather than parsing display names on the browser. Preserve complete profile-card information separately from the filtered pitch-marker list.

Review references:

- [Blood Bowl 3 overhead badge reference](https://i0.wp.com/clawbloodbowl.uk/wp-content/uploads/2026/09/image-20.png?fit=1110%2C871&ssl=1)
- [FUMBBL text marker reference](https://i.redd.it/3q747ned84ld1.png)

## Validation

At the manifest checkpoint, verify exact coverage against the 108-entry core catalog, check BB2025 native resolution, and check letter-only shorthand lengths and collisions. Exclude supplementary star abilities, stat advancements, and named temporary effects. The owner approved round 2's text presentation and authorized generating all remaining text markers. The completed text pack, illustrated artwork, and production integration have separate review checkpoints.

After implementation, protect the core allowlist, filter/source overlap, defaults and saved preferences, numeric variants, ordering and overflow, trait colors, spectator labels, star profile-card content, and reconstruction from live/replay/recovery data with meaningful regression checks. Run focused checks before the required wider unit, browser, and game-server build checks. Inspect marker size and contrast on Android, Windows, and Linux browsers and supported themes before handing back a visual review.

## Completion Notes

The [manifest](manifest.md) and [machine-readable data](manifest.json) contain 108 core identities. The owner approved [round 2](text-round-2/README.md) and authorized completing all remaining text markers. The [full text pack](text-full/README.md) contains 108 SVGs, 432 transparent PNGs, a searchable gallery, and eight review sheets, retaining all 19 approved sample SVGs unchanged. The owner then authorized [illustrated round 1](illustrated-round-1/README.md): nine candidates across all seven colors, with 36 PNG exports and eleven review images. After owner feedback, [illustrated round 2](illustrated-round-2/README.md) applies the approved 20px minimum, deeper illustrated panels, and simpler symbols to those same nine identities; a before/after board and eleven pitch/specimen images are ready for review. The owner subsequently authorized the [complete illustrated pack](illustrated-full/README.md), now containing all 108 identities, 432 PNG exports, 19 review images, and a validated asset ZIP. Secret Weapon is revised to a spiked steam roller; Dodge loses its incoming arrow; Claws gains blood on the tips; Put the Boot In uses a distinct two-boot silhouette. Six approved sources are preserved unchanged. The owner accepted the full illustrated artwork apart from Eye Gouge; its isolated revision now uses a connected, segmented gauntlet instead of detached rounded fingertips. The gallery and ZIP are updated, with all other illustrated exports unchanged. The owner accepted the corrected Eye Gouge artwork and authorized the remaining implementation. The shared Game Menu now contains all marker controls, and both approved packs are delivered by the production asset pipeline. Authoritative server metadata supplies core identity, category, base/acquired origin and complete parameterized player-card details. The production pitch uses that data in live play, replay and recovered snapshots. Strips preserve pointer targeting and reduce capacity in crowded squares while keeping readable dimensions. Older recordings without marker metadata remain readable with their original skill list; they do not invent origins or show guessed badges. See [thread summary](thread-summary.md) and the final implementation verification section below. The [verification record](verification.md) records the checks performed. The managed local debug stack and artwork servers were stopped at the owner's request, retaining database volumes for manual redeployment.

Tracking issue: [#293 Player skill markers for the 108 core BB2025 skills and traits](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293). Implementation and automated verification are complete. Native Android hardware and Linux browser execution remain manual validation, explicitly recorded in the verification and handoff. This local specification is the issue mirror.


## Merge completion ? 2026-10-18

Merged through [PR #296](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/296) as squash commit `766f15026b9c7e3185106f0f9ef3bdde7cb07d61` after independent standards/spec review and passing required CI. [Acceptance, verification and process report](merge-outcome.md). All 325 browser units and 22 corrected native contract tests passed locally; complete Java reports cover 886 tests with zero remaining failures and nine existing opt-in skips. Full Java21 CI, native coverage gate, baseline, static, service and security checks passed. Native Android hardware and Linux browser visual checks remain manual. Original checkout and separate playback changes are preserved. Deployment was not requested or performed.
