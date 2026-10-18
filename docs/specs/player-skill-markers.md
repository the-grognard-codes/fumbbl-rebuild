# Feature: Player Skill Markers

Tracking: [#293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293). The owner approved both complete packs, the corrected Eye Gouge and the implementation, then authorized publishing and merging through the normal PR process.

## Abstract

Show the core abilities a player currently possesses directly above their pitch artwork. Keep the complete skill and trait list, numeric values, targets and unique star abilities in the player card.

## Objective

Support exactly **108 core BB2025 identities: 72 skills and 36 traits** in two reviewed packs. The [reviewed manifest](player-skill-markers-manifest.json) records identity, category, abbreviation and native implementation. The [delivery catalog](../../assets/game/ui/player-skill-markers-v1/catalog.json) and [approved checksums](../../assets/game/ui/player-skill-markers-v1/approved-sha256.json) identify the production images.

## Context / Existing Behavior

The pitch already displays player art, state, ball, selection and threat markings. Existing player projections contain skill names but cannot accurately filter their origin. The new optional versioned metadata supplies authoritative core identities, category, base/acquired origin and complete card descriptions without changing the existing names.

## In Scope

- One text SVG and one illustrated PNG master for every core identity, delivered by the existing asset sync pipeline.
- Scrollable Game Menu → Skills & Traits → Skill Markers controls with the Show Player Skills heading.
- Persistent preferences, overhead strips, overflow, zoom scaling and complete profile cards in live play, replay and recovered matches.

## Out of Scope

- BB2016/BB2020, Java desktop changes, game mechanics or decision sequencing.
- Pitch badges for unique star abilities, stat changes or named temporary effects.
- Availability, cooldown or spent-use markers. An ordinary core skill granted temporarily uses its existing badge while possessed.

## Functional Requirements

1. Text labels use 1–3 unique letters, never numbers. Block, Dodge, Guard and Tackle use B/D/G/T; Mighty Blow uses MB. All parameter/target values remain in details.
2. General is MUTP blue, Agility MUTP yellow, Strength red, Mutation purple, Passing green and Devious orange. All 36 core traits use black. Illustrated panels use the approved deeper colors; text retains the original palette. A star's ordinary core skills use the same markers and colors as any other player's.
3. Defaults are both teams on, base skills off, acquired skills on, traits on, Big Guy negatraits on, Text presentation and Medium size. Provide Text/Illustrated and a stepped Small/Medium/Large slider.
4. Own team/Opponent gate all markers for coaches. Spectators and replays label the same stored switches Home team/Away team. Traits use their own filter regardless of origin; other skills use native base/acquired provenance.
5. Show Big Guy negatraits and Secret Weapon filters exactly Bone Head, Really Stupid, Always Hungry, Animal Savagery, Unchannelled Fury and Secret Weapon. It preserves Loner. Show traits is the independent master trait filter.
6. Reflect currently possessed abilities, remove expired temporary gains, deduplicate identities and retain abilities whose use is spent or temporarily unavailable. Never infer provenance from display-name strings in the browser.
7. Show up to three portrait badges and exact +N overflow. Order native negative traits plus Always Hungry, Animosity, Loner and Secret Weapon first; then B/D/G/T/MB; then stable identity ordering. Reduce capacity in crowded projected squares before sacrificing readability.
8. Scale with projected square size and keep symbols upright. Text has a 14 CSS px minimum, raised to 20px when displaying a three-letter label. Three-letter text frames are 88:96 instead of 72:96. Illustrated badges have a 20px minimum at every size; Small and Medium coincide at the floor and grow differently above it.
9. Preserve canonical ground/player targeting, ball, state and selection visibility. Badges do not intercept pointer input. Hover, keyboard focus and touch taps expose complete profile-card information independent of filters.
10. Reuse the same renderer and preferences in live play, playback, replay seeks and recovered snapshots. Older recordings without metadata retain their original skill list and show no guessed badges. Older recoverable checkpoints receive current metadata when projected again.

## Acceptance Criteria

- [x] Owner-approved 108-entry manifest, two complete packs and requested art revisions.
- [x] All settings, defaults, persistence and independent trait filtering.
- [x] Authoritative identity, category, provenance and complete card information.
- [x] Readable scaling, crowded overflow, stable ordering and unchanged targeting.
- [x] Live/replay/recovery regression coverage, including legacy checkpoints.
- [x] Owner visual review on the existing MUTP pitch.
- [ ] Native Android hardware and Linux browser manual validation; Windows Chrome and Android touch emulation were exercised locally. CI runs the repository's Linux checks.

## Constraints

Preserve MUTP typography, palette and themes and unrelated working-tree edits. Use a feature branch, focused commits, a reviewed PR and passing required checks before squash merge. Deployment is separate from merge authorization.

## Implementation Guidance

Core identity comes from the curated BB2025 SkillDefinitions allowlist and the selected native factory, not the full skill factory inventory. Dedicated BB2025 presentation code leaves other rulesets unchanged. The optional field preserves legacy snapshot compatibility and is validated on both sides of the protocol.

The approved art revisions use a spiked steam death-roller for Secret Weapon, remove Dodge's incoming arrow, add blood to Claws, distinguish the two-boot Put the Boot In from Dirty Player, and replace Eye Gouge's detached fingertips with one angular segmented gauntlet. The original local authoring/review archives remain available separately from production delivery.

## Validation

Protect defaults/migration/storage denial, exact 108 coverage and approved asset hashes, strict identity/category/origin decoding, trait/source overlap, temporary gain/removal, spent skills, numeric details, coach/neutral gates, ordering, overflow and readability floors. Check full star cards, touch input, live/replay/recovered snapshots, existing setup/ground intents and ball scaling.

Commands include browser unit tests and both builds; asset integrity/sync; marker, menu, projected pitch, setup drag, ball zoom, playback, pending recovery and reconnect UI suites; and server/native recipient and package verification. Merge validation reruns relevant checks against current main and records results in the PR.

## Completion Notes

Original implementation checks passed 316 browser units, 30 asset checks, both browser builds, 618 Maven tests discovered (616 passed, two existing opt-in database skips) and the separate native recipient contract. All 12 suites in the affected interaction shard passed after correcting a wall-clock-dependent four-dice assertion: the test controls decorative time while waiting for each React movement commit, then checks continuation and expiry explicitly. No gameplay or retention timing changed.

The original feature thread summary and full art history are retained in the off-GitHub archive; see [ARCHIVE.md](../../ARCHIVE.md) for the inventory. The published implementation depends only on the production assets and manifest in this PR.
