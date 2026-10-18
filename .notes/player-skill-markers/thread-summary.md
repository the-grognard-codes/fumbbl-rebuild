# Player skill markers — thread handoff

Implemented on `feature/player-skill-markers` on 2026-10-17. No commit, push, deployment or debug-stack restart was performed. Unrelated movement-playback edits remain intact.

## Scope and decisions

The inventory is exactly **108 core BB2025 identities: 72 skills and 36 traits**. Both packs use the same allowlist. BB2020/BB2016, stat changes, named temporary effects and unique star abilities have no pitch icons. Temporary gains of a core skill reuse that skill's existing marker. Unique star abilities and full numeric/target values remain in the player card regardless of display filters.

All text labels are unique, letter-only and 1–3 characters. Block, Dodge, Guard and Tackle use B/D/G/T; Mighty Blow uses MB. General is MUTP blue, Agility MUTP yellow, Strength red, Mutation purple, Passing green, Devious orange, and all core traits black.

## Artwork completed and accepted

- **Text:** 108 outlined SVG masters and 432 transparent PNG exports. Three-letter frames were widened from 72:96 to 88:96, retaining the portrait form and improving readability.
- **Illustrated:** 108 identities and 432 transparent PNG exports. Simplified symbols and deeper category colors improve recognition; all illustrated pitch badges retain a 20 CSS px minimum.
- Secret Weapon became a spiked steam death-roller. Dodge lost its incoming arrow. Claws gained blood on the tips. Put the Boot In uses a two-boot silhouette distinct from Dirty Player. Eye Gouge was revised into one connected armored gauntlet with angular, segmented fingers.
- Original sources, prompts, galleries, specimen sheets, ZIPs and prior review rounds remain under [this directory](.). The isolated Eye Gouge revision changed only its four illustrated exports; the other 428 illustrated exports and all 540 text exports stayed unchanged.

Production uses the approved text SVGs and illustrated PNG masters, delivered through `assets/game/scripts/sync-browser-assets.mjs`. A canonical SHA-256 inventory verifies all 216 production image files. Browser delivery does not depend on the review directory.

## Settings and pitch integration

Open **Game Menu → Skills & Traits → Skill Markers**. The scrollable tab contains Show Player Skills, Own team/Opponent, base/acquired, traits, Big Guy negatraits and Secret Weapon, Text/Illustrated, and the stepped Small/Medium/Large size slider. Spectators and replays use Home team/Away team.

Defaults: both teams on, base skills off, acquired skills on, traits on, Big Guy negatraits on, Text, Medium. Settings persist and update the pitch immediately; storage denial retains session choices.

The Big Guy toggle filters exactly Bone Head, Really Stupid, Always Hungry, Animal Savagery, Unchannelled Fury and Secret Weapon. It preserves Loner. Show traits remains the independent master trait switch. Team switches gate everything; base/acquired switches govern category skills.

Authoritative server metadata resolves core identity through the native BB2025 factory and records category, base/acquired origin and full player-card descriptions. Temporary gains appear while possessed and expire with the authoritative state. Used or distracted abilities remain listed. Unique star skills stay in details only.

Overhead strips show up to three badges and an exact `+N` count. At crowded projected sizes, they reduce visible capacity before sacrificing the readability floor. Negative traits come first, then B/D/G/T/MB, then stable identity order. Badges scale with camera zoom and distance and stay upright. Text has a 14px floor, raised to 20px for strips displaying a three-letter badge; illustrated badges have a 20px floor. Small/Medium illustrated sizes coincide at that floor and separate as zoom increases.

Markers do not intercept player or ground targeting. Hover, keyboard focus and touch taps expose the complete player card. A tap regression found during validation was fixed by scheduling the card after selection clears the previous proposal.

The same renderer and preferences serve live play, animated playback, replay seeks and recovered snapshots. New recordings preserve the metadata. Older recordings without it remain readable with their original skill list; they show no guessed pitch badges. Older recoverable checkpoints load successfully and receive current metadata when projected again. Game mechanics and decision sequencing were not changed.

## Verification and manual review

See the final section of [verification.md](verification.md) for exact commands and logs. Browser unit tests, asset integrity/sync checks, both browser builds, focused menu/pitch/drag/ball/replay/recovery/reconnect UI suites, Maven server/client-logic tests and package builds, and the native recipient projection contract passed.

The Maven package run discovered 618 tests: 616 passed and two existing opt-in MariaDB checks were skipped. The separate recipient contract passed. Windows Chrome and Android browser emulation, including actual touch input, were checked. Native Android hardware and Linux browser execution remain manual validation; no cross-platform result is claimed for environments not run here.

Review captures:

- [Desktop settings](implementation-review/settings-desktop.png)
- [Short mobile settings](implementation-review/settings-mobile.png)
- [Illustrated dense pitch](implementation-review/illustrated-pitch-desktop.png)
- [Android touch card](implementation-review/android-touch-pitch.png)
- [Recovered live snapshot](implementation-review/recovered-live-pitch.png)

For manual validation, enable base skills to see starting roster skills; they are intentionally off by default. Check both styles and all three sizes, both coach ends, spectator Home/Away filters, zoom/top-down view, crowded positions, Loner versus the six filtered traits, full star-player cards, replay seeks and reconnect/recovery.

Tracking: [GitHub #293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293), updated with verification and closed as implemented. [Completion comment](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293#issuecomment-6241968538).

A subsequent parallel-build playback assertion timeout was fixed by controlling test time during the short dice-overlap window. All 12 suites in the affected interaction shard, the hosted Blitz suite and focused dice/playback unit tests passed. [Follow-up](playback-build-timeout.md).
