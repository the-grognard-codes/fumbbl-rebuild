# MUTP dice review

Open the [review page](index.html) directly from disk. Three complete sets pair block dice with a d6: **Ivory & cyan**, **Navy steel** and **Gilded brass**. The owner selected **Ivory & cyan** for the playable MVP on 2026-10-04; live integration follows the [approved specification](../../../../specs/coach-oriented-playable-match-ui.md). [Side-by-side reference](comparison.png), [pitch context](pitch-preview.png) and a [short roll recording](roll-preview.png) accompany the interactive previews.

The shared MUTP palette, pixel contours and material lighting follow the approved HUD and reroll resource sprite. Built-in image generation created three transparent blank die bodies; the [exact prompts and source paths](art/provenance.json) record provenance. Original generated PNGs are copied unchanged to this directory. SVG overlays supply exact face symbols and pips, so generated image content cannot change die counts or result identity.

The six block faces are **Skull, Both down, Push, Push, Stumble, Pow**, with Stumble corresponding to `POW/PUSH`. The duplicated Push face is intentional; this distribution matches [the client mapping](../../../../../browser-client/src/dice-presentation.ts) and [native block category](../../../../../ffb-common/src/main/java/com/fumbbl/ffb/BlockDiceCategory.java). The d6 has exactly one through six pips. A skull, skull/burst, arrow, burst/arrow and burst distinguish the five block outcomes without text on the die itself.

**Preview roll** spins the body and face together once, cycles the visible faces, and settles in **440ms**. Translation is limited to 2px horizontally and 3px vertically. There is no sustained loop, across-pitch travel, bounce, flash or particle effect. Reduced-motion preference settles directly, without spinning or face cycling. The page can preview each set, all three together, or one set over the approved pitch image. Sizes 64, 96 and 128px support readability review. These deterministic sequences are illustrative; they neither generate random match results nor connect to a match command.

Each transparent sprite strip is **768 × 128px**, containing six **128 × 128px** tiles, left to right in the order above. The two Push tiles are visually identical. The PNGs compose generated body art and exact native SVG marks; the source body files remain untouched.

| Set | Block dice | D6 |
|---|---|---|
| Ivory & cyan | [Six-face strip](exports/ivory-cyan-block-atlas.png) | [Six-face strip](exports/ivory-cyan-d6-atlas.png) |
| Navy steel | [Six-face strip](exports/navy-steel-block-atlas.png) | [Six-face strip](exports/navy-steel-d6-atlas.png) |
| Gilded brass | [Six-face strip](exports/gilded-brass-block-atlas.png) | [Six-face strip](exports/gilded-brass-d6-atlas.png) |

Reproduce exports and the [verification report](verification.json) with the existing Playwright dependency and local Chrome:

```powershell
node docs/adr/references/0003-angled-pitch-v4/dice/render.mjs
```

Checks cover all face identities, exact d6 pip counts, one 440ms animation per die, settled results, reduced motion, all three pitch previews, preview sizes and layout containment at 1440, 1224 and 390px. The animated PNG captures the same native Web Animation transforms and displayed faces. It plays once, with 160ms lead-in, 440ms motion and 500ms settled time; no video encoder installation is needed. The reference study does not change live-client assets, legal actions or authoritative dice results.
