# Illustrated skill markers: first candidates

Nine original illustrated candidates cover all seven category colors. This is the first illustrated review checkpoint, not the full 108-marker pack. The approved text assets remain intact. The managed debug stack and all three previous artwork review servers were stopped at the owner's request; the image capture used temporary servers that close on completion.

## Review images

- [Candidate board](illustrated-candidate-board.png): larger art with actual 16 / 20 / 24 px PNG exports.
- [Standalone gallery](review.html): opens directly from disk without restarting any debug service.
- [Specimen sheet in MUTP UI](illustrated-contact-sheet.png).
- Pitch sizes: [Small](pitch-small.png), [Medium](pitch-medium.png), [Large](pitch-large.png).
- Zoom: [Overview](pitch-overview.png), [Detail](pitch-detail.png).
- [Crowded formation](pitch-crowded.png), [complete player card](pitch-player-card.png), [Big Guy filter preserving Loner](pitch-traits-filtered.png).
- [Android landscape touch emulation](pitch-android-landscape.png).

## Candidate choices

| Identity | Category | Symbol |
| --- | --- | --- |
| Block | General blue | Crossed armored forearms |
| Dodge | Agility yellow | Boot slipping around an incoming arrow |
| Mighty Blow | Strength red | Armored fist and impact burst |
| Claws | Mutation purple | Three oversized hooked talons |
| Pass | Passing green | Football and throwing arc |
| Dirty Player | Devious orange | Studded boot stomping a prone helmet |
| Bone Head | Black trait | Vacant ogre face and empty forehead |
| Loner | Black trait | Player isolated from smaller teammates |
| Secret Weapon | Black trait | Cloak concealing a weapon |

Secret Weapon's initial chainsaw concept was replaced so the separate Chainsaw identity can retain that silhouette. All nine candidates are ordinary core abilities, with no unique star, stat-change, or named-effect markers. Loner has one unnumbered concept in this batch; parameter variants remain an art-review decision. No marker contains lettering or a number.

The prompt palette targets are the manifest's MUTP cyan/yellow and five companion fills. Generated interiors include shading and are not pixel-exact flat palette fills. Review the style and silhouettes before final palette/frame normalization. The pale inset edge and clipped portrait form relate these candidates to the approved text pack.

At 16 px, small features soften. Loner's teammates and Dirty Player's lower helmet are the clearest candidates for simplification. Medium and Large are easier to distinguish. Recommend considering a 20 px illustrated floor after this review; the trial still shows the existing 14 px floor so its limits remain visible. These examples scale with projected player size, including zoom and perspective. Measured Medium height grew from **18.75 px** at overview to **28.125 px** at detail. Crowded strips can overlap adjacent sprites, as in the text prototype; production placement remains pending.

## Files and generation

[samples.json](samples.json) identifies the nine selected source images. Each has a normalized **216 × 288** master and **12 × 16**, **15 × 20**, and **18 × 24** PNG exports in [png](png). All exports have transparent clipped corners. The original generated PNGs and intermediate repairs remain beside them for provenance; consumers should use the selected inventory and normalized exports.

Used the **built-in image_gen tool**, following the [imagegen skill](C:/Users/jaken/.codex/skills/.system/imagegen/SKILL.md). Final prompt records:

- [Initial prompt set](prompts.json), referencing the approved text Block frame and the first illustrated Block candidate.
- [Background correction attempts](correction-prompts.json).
- [Opaque generation masters](opaque-master-prompts.json) for Pass, Dirty Player, and the earlier Secret Weapon concept.
- [Selected Secret Weapon prompt](secret-weapon-prompt.json).

Three generated candidates had internal alpha-extraction artifacts. Opaque generation masters resolved these; the export driver applies the same standard portrait crop and corner clip to produce transparent assets. No Python raster editing or API-key fallback was used. Source imagery is generated; PNG resizing and frame clipping are reproducible browser export operations.

## Validation and reproduction

```powershell
node browser-client/test/skill-marker-illustrated-review.mjs
```

The driver recreates the PNG exports, standalone gallery, and screenshots, then closes its temporary browser and servers. It does not start hosting, Docker containers, or the managed debug stack. Existing player art and LivePitch are reused in an isolated fixture; Claws and Secret Weapon use existing sprites as art-review stand-ins, not roster eligibility claims.

[capture-report.json](capture-report.json) records the final passing checks:

- Nine identities/names/categories/shorthand match the core manifest; all seven category colors represented.
- 36 PNG exports have expected dimensions, transparent corners, visible artwork, and no substantial internal transparency holes.
- Eleven review images, twelve player sprites, three-marker overflow, complete player card, projected zoom growth, and the Big Guy visibility filter preserving Loner.
- Android landscape touch layout and player-card opening; standalone gallery has no horizontal overflow at 390 px.
- Zero browser runtime errors or failed asset responses. Candidate board, specimen sheet, Small/Medium/crowded pitch views, and touch view were visually inspected.

No production application, live-play/replay/recovery logic, or server source changed in this artwork step. The previous unit/build/menu/recovery/playback/Maven results are retained in [verification](../verification.md); they were not rerun for these isolated assets. Windows Chrome and Android emulation were checked, not native Android/Linux.

Tracking: [issue #293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293). Awaiting owner review before another illustrated round. No commit or push was made.
