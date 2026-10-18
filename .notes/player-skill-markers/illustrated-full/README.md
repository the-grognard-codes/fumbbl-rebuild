# Complete illustrated BB2025 marker pack

The owner approved the 20px minimum, deeper colors and simplified style, supplied specific art direction, and authorized completing the full illustrated pack. This review contains **108 core identities**: 72 category skills and 36 traits, with **432 normalized PNG exports**. Six approved round-2 sources are reused unchanged; the other 102 identities are new or revised. Earlier illustrated rounds and the full text pack are preserved.

## Review

- [Searchable gallery](review.html), which opens directly from disk without starting any debug service.
- [Full contact sheet](all-illustrated-markers.png).
- Category sheets: [General](general-illustrated-markers.png), [Agility](agility-illustrated-markers.png), [Strength](strength-illustrated-markers.png), [Mutation](mutation-illustrated-markers.png), [Passing](passing-illustrated-markers.png), [Devious](devious-illustrated-markers.png), [Core traits](trait-illustrated-markers.png).
- [Requested art changes and foul-icon comparison](art-direction-review.png).
- [Full specimen sheet in MUTP UI](illustrated-contact-sheet.png).
- Pitch: [Small](pitch-small.png), [Medium](pitch-medium.png), [Large](pitch-large.png), [Overview](pitch-overview.png), [Detail](pitch-detail.png), [Crowded](pitch-crowded.png).
- [Complete player card](pitch-player-card.png), [Big Guy filter retaining Loner](pitch-traits-filtered.png), [Android landscape emulation](pitch-android-landscape.png).
- [Download asset ZIP](bb2025-illustrated-markers.zip).

## Art direction applied

The owner accepted the full artwork except Eye Gouge. [Eye Gouge's revision prompt](prompts/eye-gouge-v2.json) replaces the detached rounded fingertips with one connected armored hand: a visible palm, folded thumb, and two angular segmented fingers targeting the eye. The original source is archived; `markers.json` selects `sources/eye-gouge-v2.png`. All 428 exports for the other 107 illustrated markers are byte-for-byte unchanged.

**Secret Weapon** is a ridiculous powered spiked steam roller: a huge toothed drum, boiler, chimney and smoke. Its silhouette is distinct from the footprint-based Shadowing, exposed-dagger Stab, hand-held Chainsaw, thrown-bomb Bombardier, and hanging Ball and Chain designs. The previous cloak-and-knife concept is archived.

**Dodge** retains its approved boot and broad evasion swoosh, with the incoming shin/ankle arrow removed. **Claws** retains three clear talons and adds restrained crimson blood on their tips and one drop. **Dirty Player** retains its single studded boot over a prone helmet. **Put the Boot In** instead uses two boots converging toward a central impact, representing a coordinated foul assist rather than a single stomp.

The concept matrix deliberately separates similar abilities: open palm / paired catching basket / diving body for the catching skills; different trajectories and objects for Passing; distinct head, mouth, machine, footprint and rooted-tree silhouettes for the black traits. Some concepts are visual metaphors rather than rules diagrams. Names and complete values/targets remain on the player card; icon recognition across all 108 remains subject to this owner review.

All illustrated markers retain a **20px minimum**, including zoomed-out pitch and touch views. At a 64px player square, Small and Medium exports are **15 × 20** and Large is **18 × 24**; all sizes grow above the floor with projected player size. Masters are **216 × 288**. These are raster assets with transparent clipped corners and no embedded font dependency. The approved deeper palette applies to illustrations; all text-marker assets remain unchanged. Generated panels retain some shading, so palette hex values are targets rather than a pixel-exact flat-fill claim.

The scope stays at the 108 core identities. Unique star abilities, stat changes, named temporary effects, and numeric or target-specific variants are excluded. Loner and Bloodlust have one unnumbered illustrated identity each. No marker contains a letter abbreviation or value label.

## Inventory and provenance

- [markers.json](markers.json): exact identity/name/category/shorthand mapping, selected sources, colors, and export paths.
- [export-index.json](export-index.json): PNG dimensions and SHA-256 checksums.
- [generation records](generation-records.json): built-in tool prompts, references, selected/earlier source paths, and approved reuse records.
- [concepts.json](concepts.json): planned subjects for the 98 remaining identities beyond the directed edits and approved reuses.
- [prompts](prompts): individual generation and revision records.
- [sources](sources): original generated files, retained in the repository. The runtime asset ZIP contains normalized exports and metadata; it excludes these large source PNGs and the review screenshots.

Generation used the **built-in image_gen tool**, following the [imagegen skill](C:/Users/jaken/.codex/skills/.system/imagegen/SKILL.md), with one call per new identity or revision. Opaque generation masters prevent interior alpha-extraction artifacts; standard browser cropping, scaling and corner clipping supply transparent exports. The Dodge arrow removal required an opaque-master cleanup of the old arrow area. No Python raster editing or API-key fallback was used. Six approved source images—Block, Mighty Blow, Pass, Dirty Player, Bone Head and Loner—are reused byte for byte.

## Reproduction and validation

With the generated sources retained in this folder:

```powershell
python .notes/player-skill-markers/illustrated-full/build-review.py
node browser-client/test/skill-marker-illustrated-review.mjs --full
```

The builder creates the inventory, gallery and isolated pitch preview without changing production application routes. The browser driver exports PNGs, checks coverage and dimensions, captures review sheets, exercises the shared size/filter behavior, and closes its temporary browser and servers. It does not start hosting, Docker containers or the managed debug stack. Existing player sprites are used as art-review stand-ins where needed; this fixture does not assert roster eligibility or alter game mechanics.

[capture-report.json](capture-report.json) records the final checks: exact 108-core coverage, seven category counts, six unchanged approved sources, 432 image dimensions/transparency/panel checks, gallery search and category filters, narrow layout, all visible illustrated markers at least 20px high, projected zoom growth, overflow, complete player-card information, the Big Guy filter preserving Loner, and touch cards. Missing assets and browser runtime errors must be zero. All seven category sheets and the directed-art comparison are visually inspected before handoff.

This step changes artwork, review tools and documentation, with no new production renderer, server mechanics, replay or recovery code. The previous 309 browser tests, browser build, reconnect/recovery/playback checks, and Maven results are recorded in [verification](../verification.md); broad suites are not repeated for these isolated assets. Windows Chrome and Android emulation are checked, not native Android/Linux. All 540 approved text exports are checked against their stored hashes. No debug restart, commit or push is performed.

Tracking: [issue #293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293). The owner explicitly authorized this complete illustrated batch; full-pack visual review is the next checkpoint before production pitch integration.
