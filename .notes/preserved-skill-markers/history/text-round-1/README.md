# Text skill marker sample round

Fourteen proposed text markers cover all seven category colors, one to three letters, positive/negative traits, and the three-badge overflow treatment. These are review assets; the full 108-entry packs and production integration await further approval.

## Review images

- [Labeled specimen sheet](text-markers-contact-sheet.png): enlarged masters, native-size comparisons, category names, and sample strips.
- [Medium pitch mockup](pitch-medium.png): proposed 15 × 20 px default on the current game renderer and player art.
- [Small pitch mockup](pitch-small.png): 12 × 16 px.
- [Large pitch mockup](pitch-large.png): 18 × 24 px.
- [Closer pitch view](pitch-detail-medium.png).
- [Crowded formation](pitch-crowded-medium.png): adjacent players expose possible overlap between a badge strip and another player's sprite.
- [Complete list on hover](pitch-hover-full-list.png): the Ogre shows BHD, LO, MB, and +1 on the pitch; Guard remains visible in the full player card.
- [Android landscape emulation](pitch-android-landscape.png).
- [Player card opened by touch](pitch-android-player-card.png).

## Samples and design

| Labels | Category |
| --- | --- |
| B, T | General blue |
| D, SPH | Agility yellow |
| G, MB | Strength red |
| CL, VLL | Mutation purple |
| PS, HMP | Passing green |
| DP | Devious orange |
| LO, BHD, ANI | Black traits |

Each marker has a 3:4 portrait frame with clipped corners, a navy outer edge, an inset pale rim, a colored face, and small highlight/shelf details. The letters are vector outlines taken directly from the existing Chakra Petch Bold MUTP font. Exported images do not require the font to be installed or fetched. All skill labels remain letter-only; the separate +1 indicator counts undisplayed markers.

Medium is the agreed initial setting. The smaller three-letter labels are visibly harder to read, especially on a dense pitch. Review the frame detail, letter weight, colors, size steps, and the crowded example before extending this style to every core identity. The crowded example is evidence for the later placement design; this sample does not claim production collision handling.

The pitch is rendered by the existing `LivePitch` component with existing Human and Orc sprites and stadium artwork. Mutation and Animosity typography specimens reuse Orc art as a visual stand-in; this fixture does not assert legal roster combinations. Sample base and acquired skills are both shown to expose the artwork, rather than reproducing the final visibility defaults. No sprites or stadium paintings were edited.

## Asset files

- `icons/`: 14 transparent vector masters with outlined lettering, 72 × 96 viewBox.
- `png/master/`: 14 transparent 72 × 96 PNG masters.
- `png/small/`, `png/medium/`, `png/large/`: 42 transparent PNG exports at the trial display sizes.
- [Sample inventory](samples.json) records the selected manifest IDs, abbreviations, and category fills.
- [Capture report](capture-report.json) records the actual rendering checks and platform limits.

## Open the interactive review

From the repository root:

```powershell
node browser-client/test/skill-marker-text-review.mjs --serve
```

Open `http://127.0.0.1:5177/skill-markers-text-prototype.html`. Switch between the pitch and specimen sheet, Small/Medium/Large, open/crowded spacing, and overview/detail. Hover or click a player for their full list. This is a separate, local preview entry; production match routes do not import it. Stop the local review server when finished.

## Reproduce and verify

```powershell
python .notes/player-skill-markers/text-round-1/generate-samples.py
node browser-client/test/skill-marker-text-review.mjs
```

The generator uses `fonttools`; this session installed it in the task's temporary Python dependency directory, which the script reads. It does not call an image-generation API. For a later environment, install `fonttools` in that Python environment or provide the same task dependency directory.

Checks run:

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` from `browser-client` passed.
- Browser unit suite: `npm.cmd test` from `browser-client` passed all **301 tests**; [full output](browser-unit-test.log).
- Visual capture: `node browser-client/test/skill-marker-text-review.mjs` passed with 14 SVG samples, 56 PNG exports, and nine screenshots.
- PNG exports have the specified dimensions, preserve alpha at the portrait edges, and contain opaque badge pixels.
- Twelve existing player sprites render; overflow and the complete hover list are checked.
- Android landscape touch emulation has no horizontal page overflow, and tapping a player opens the player card.
- No browser runtime errors or failed asset responses occurred.
- All nine final captures were visually inspected, and source/link/inventory checks passed.

The browser runs used Windows Chrome and touch emulation. Native Android and Linux checks, production visibility/preferences, live-play/replay/recovery tests, and game-server validation remain part of later implementation. No gameplay behavior changed in this sample round.

Tracking: [issue #293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293). Owner review is the next checkpoint; no subsequent artwork batch has started.
