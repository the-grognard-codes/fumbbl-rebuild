# Source-faithful modular stadium bowls

Issue: [#211](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/211).
Approved reference and detailed decisions: [art brief](../../assets/game/references/stadiums/human-reference-revision/README.md).
Fixed starting point: 540804aa3cd08ef2687f2a2356f49c1607a1fb4f.

The user accepted the first-iteration material/crowd style, raised bowl, existing-camera geometry study and modular production approach. Reproduce that assembled intent, not the earlier sparse fan groups and open terrace bands.

Delivery slices:
- [x] Original Human/Orc modular sheets, measured transparent regions, source provenance, reusable world layout and automated catalog validation.
- [ ] World-projected shell and crowd integration, two sideline locker-room portals/benches, two-square apron, fixed mixed supporter ownership, x=13 timber dividers, both coach ends and overhead.
- [ ] Isolated fan gesture frames/reduced motion, full renderer validation, native shared integration checks and retrospective compared against functional/media/intent requirements.

Revision after live visual review (2026-10-08): PR #214 is held as a draft. Replace repeated small spectator cards and visible terrace bands with large authored wall, side-bank, end-bank and corner pieces. All themes use identical game-world puzzle slots and joins; team crowd pieces must fit every venue. Preserve upright heads and shoulders during camera travel. Random section triggers change only a few spectators; each section's base artwork stays still. The earlier renderer captures are technical evidence, not visual acceptance.

Acceptance:
- [ ] 26×15 / 390 playable cells and player input geometry remain unchanged.
- [ ] Both venue themes share the same physical dimensions and world anchors; home League selects structure, teams select crowd and bench details independently.
- [ ] Dense standing-room-only heads and shoulders, slight side/far elevation, raised near backs of heads and natural near-wall occlusion.
- [ ] Exactly two sideline locker-room entrances, adjacent bench recesses; no end-wall gates.
- [ ] Two clear scenery squares beyond every pitch edge; furniture stays in recesses outside that apron.
- [ ] Both long sidelines are independently split at canonical midfield x=13; one timber divider per sideline inside the crowd area.
- [ ] Continuous travel/zoom/orientation changes reproject ground and upright layers once, without stretched baked panorama, gaps, disappearing near stand or supporter reassignment.
- [ ] Side/front/back and overhead crowd/prop views work for Human-home and Orc-home matchups.
- [ ] Random section triggers animate a few individual gesture frames; authored crowd pieces stay fixed; reduced motion freezes all decorative effects.
- [ ] Source hashes/gutters and generated browser copies pass checks; production build/tests and representative before/after camera captures pass.
- [ ] Final retrospective links original intent and evidence, records limits honestly, and documents how future League venues reuse geometry and art contracts.

Scope excludes player sprite redesign, rules/transport changes and multi-League onboarding. Preserve concurrent main work and native identity behavior.

Current implementation checkpoint: integrated code a0924c1a0 passes 229 browser units, all 23 interaction drivers (including the 48-view stadium matrix), 18 asset checks, TypeScript and production build. Standards and Spec reviews approve this code. See the [verification report](../verification/stadium-jigsaw-revision.md), [current assembled gallery](../../assets/game/references/stadiums/human-reference-revision/jigsaw-review/README.md) and [interim retrospective](../verification/stadium-jigsaw-retrospective.md). The final native rerun and merge remain open because the DEV ADC login expired; PR #214 stays a draft.
