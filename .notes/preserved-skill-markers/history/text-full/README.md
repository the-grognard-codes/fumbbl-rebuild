# Complete BB2025 text marker pack

The owner approved round 2's text style and authorized all remaining text markers. This pack contains **108 SVG masters and 432 transparent PNGs**: 72 category skills and 36 core traits. The 19 approved sample SVGs are byte-for-byte unchanged; 89 markers complete the inventory. The illustrated pack and production pitch integration remain separate checkpoints.

## Review

- [Searchable gallery](review.html), including Small / Medium / Large examples for every marker. Open directly in a browser, or use the local server below.
- [Full contact sheet](all-text-markers.png)
- Category sheets: [General](general-text-markers.png), [Agility](agility-text-markers.png), [Strength](strength-text-markers.png), [Mutation](mutation-text-markers.png), [Passing](passing-text-markers.png), [Devious](devious-text-markers.png), [Core traits](trait-text-markers.png).
- [Marker inventory and asset paths](markers.json)
- [Export dimensions and SHA-256 checksums](export-index.json)
- [Validation report](validation-report.json)
- [Download asset ZIP](bb2025-text-markers.zip) containing all SVG/PNG files, inventory, checksums, and validation report.
- [Previous in-game mockups and zoom/filter review](../text-round-2/README.md)

## Approved construction

Every marker uses outlined Chakra Petch Bold lettering, detailed portrait frames, and the seven approved category fills. SVG masters are self-contained and need no installed font. One- and two-letter frames measure **72 × 96**; three-letter frames measure **88 × 96** with the approved taller glyphs. All abbreviations match the [108-entry manifest](../manifest.md), are unique, and contain letters only.

PNG exports use the same geometry:

| Label | Master | Small | Medium | Large |
| --- | --- | --- | --- | --- |
| 1–2 letters | 72 × 96 | 12 × 16 | 15 × 20 | 18 × 24 |
| 3 letters | 88 × 96 | 18 × 20 | 18 × 20 | 22 × 24 |

Small and Medium coincide for three-letter cards because of the approved readability floor. These are exports at a baseline 64 px player square. Production rendering should use SVGs and the shared projected-size helper so the markers scale with zoom and perspective. Within a strip containing three-letter cards, the same 20 px floor applies to its shorter labels to align the row; standalone PNG sizes do not replace that runtime rule.

Loner and Bloodlust remain unnumbered. All 36 traits use black frames, including positive traits. Unique star abilities, stat changes, and named temporary effects remain excluded. The additional Big Guy visibility filter does not change this inventory or remove Loner.

## Reproduce

```powershell
python .notes/player-skill-markers/text-full/generate-pack.py
node browser-client/test/skill-marker-text-pack-review.mjs
node browser-client/test/skill-marker-text-pack-review.mjs --serve
```

The generator reuses the round-2 fonttools dependency in the session's task dependency directory. The browser driver uses the repository's Playwright dependency and Windows Chrome (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`). The local review URL is `http://127.0.0.1:5179/.notes/player-skill-markers/text-full/review.html`.

Validation covers exact manifest identity/name/category/shorthand matching, unique letter-only abbreviations, seven category counts, unchanged approved SVGs, all PNG dimensions and transparency, self-contained SVG paths, gallery filters, narrow layouts, and missing assets/runtime errors. Eight sheets are generated for visual inspection. This artwork-only step changes no live-play, replay, recovery, or server source; their previous results are recorded in [verification](../verification.md). Native Android and Linux are not claimed by this Windows Chrome artwork check.

Tracking: [issue #293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293). The completed text pack awaits owner review. No commit or push was made.
