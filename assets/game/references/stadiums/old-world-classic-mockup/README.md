# Old World Classic review gallery

Review candidates for [#566](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/566).
**Not visually accepted.** The owner must compare the running gallery with the
[concept](../concept-round-3/01-old-world-classic-human-home.webp).

Latest evidence: [concept comparison](round-8/concept-comparison.png),
[home cameras](round-8/contact-home.png), [away cameras](round-8/contact-away.png),
[turf presets](round-8/contact-turf.png), [colour pairs](round-8/contact-colours.png),
[Android viewport](round-8/android.png). Individual PNGs retain native capture
resolution. `checks.json` records each run. These are Chromium screenshots on
Windows; the Android capture is a 390px browser viewport, not a physical device.

## Visible differences from the concept

| Area | Current comparison and remaining work |
| --- | --- |
| Architecture | Stone/timber facades, torches, coping and apron furniture are present. Repeated wall spans and orthogonal corners do not reproduce the concept's substantial curved masonry transitions. Backing terraces need richer authored stone/timber depth. |
| Perspective | Production camera and fixed world coordinates take priority. Extreme travel crops the bowl; this is not the concept's close, composed illustration. Upright source bands keep their proportions but their layered construction remains visible. |
| Proportion | End-bank heads and some corner spectators appear larger than side-bank heads. Banners are shorter and more regular than the concept's hanging cloth. |
| Crowd | Dense Human banks and a distinct small Orc/Goblin section are present. Source rows repeat visibly; insufficient distinct section paintings and imperfect low-alpha backing prevent a finished packed-terrace appearance. Dwarf/Halfling variety is not separately verified. |
| Pixel detail | Dark outlines and clustered pixels are present, but source density varies between walls, side crowds and end crowds. The assembled render needs a human artist's density/edge cleanup. |
| Lighting | Torches have authored warm pixels and a small brightness cycle. There is no full lighting pass unifying crowd, stone and cloth, or dynamically cast torch warmth. |
| Pitch | Calm is deliberately quieter than the concept. Balanced/textured remain options. Real kickoff players, ball and synthetic movement/block/assist specimens demonstrate contrast. |
| Cloth | Runtime primary/secondary shade ramps work. Extreme colours expose where masks and authored shading still need semantic review. Overhead pennants/banners use an approximation, unlike the dedicated overhead awnings. |

## Iteration record

| Round | Evidence, critique and next change |
| --- | --- |
| 1 | New walls with historical crowd placeholders. Deep facade treatment improved; crowd identity, scale and turf contrast still wrong. Generated new Human/Orc banks and separated cloth. |
| 2 | New crowd sources with camera matrix and calmer turf. Heads too large, repeated rows and matte end banks evident. Generated denser side banks and material-marker edits. |
| 3 | Indexed colour variants. Colour control worked, but end-bank matte, missing furniture and wall/chalk loss were visible. Added independent props and corrected layer order. |
| 4 | Props, cloth and restrained life. Wall loss persisted; crowd joins and end-bank transparency remained weak. Tightened loading checks and generated gesture patch/clean end source. |
| 5 | Stronger decoded-image checks showed the missing-wall issue was not just unfinished loading. Replaced full-atlas DOM layers with clipped canvases. |
| 6 | Canvas surfaces restored walls; clean end-bank extraction removed the end matte. Independent review found horizon-dependent missing apron and dropped long chalk segments. |
| 7 | Finite gallery turf restored the 30-degree apron. Contact sheets show crowd repetition and corner gaps plainly. Fixed clipped chalk, isolated failed source decoding and added zoom/motion checks. |
| 8 | Latest complete recapture after those fixes, with zoom bounds and reduced-motion checks. Mechanical rendering is improved; the art differences above remain owner-review items. |

Early rounds predate the complete colour/contact-sheet driver; their available
captures are retained rather than retroactively represented as complete matrices.
Rounds 3–8 contain both ends, all four camera modes, near/far, turf presets and
concept comparison. The final round is the authoritative implementation evidence.

## Authority conflict log

- The concept's pitch proportions/composed camera yield to the production 26×15
  grid and camera. No pitch coordinates or production projection were changed.
- Busy concept turf yields to the owner's calmer-pitch direction; calm is default.
- Earlier equal team splits yield to one fixed `north-away` visitor section.
- Earlier live integration plans yield to the dev-only gallery.
- Overnight instructions allow progress without intermediate owner acceptance;
  no automated test or reviewer is treated as visual approval.

Canonical source inventory, material regions and provenance are documented in
[the asset contract](../../../pitch/stadiums/mockup/README.md). Rejected sources
and exact prompts/hashes are in [candidates/provenance.json](candidates/provenance.json).
The [outcome report](../../../../../docs/specs/old-world-classic-stadium-mockup-outcome.md)
records validation and delivery limits.
