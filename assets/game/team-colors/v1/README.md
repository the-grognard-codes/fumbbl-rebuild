# Production team-color material pack v1

Production uses the approved Human and Orc portrait and helmet redesigns (2026-11-04).
The 84 body poses and their placement contracts are unchanged. Twelve portraits
are 160px; two standalone helmets are 320px. `approved-art.json` binds production
files to the reviewed trial pixels and explicit masks. Full generated sources,
prompts, and comparisons remain in the versioned batches/trials.

Tone calibration keeps the approved primary/secondary/fixed regions intact and
maps each painted material's median shade to the corresponding front-facing
player sprite (all roster fronts for a helmet). A monotonic power curve preserves
the darkest and brightest shade endpoints. This restores the player's base tone
and primary/secondary contrast even for identical color choices. Calibration is
recorded per image in `approved-art.json` and rebuilt by
`promote-approved-team-art.mjs`; trial artwork remains the original review record.
Static PNGs use the calibrated default kit. Straight RGBA PNG encoding preserves
fixed pixels and alpha exactly, including partially transparent edges.

## Sources and inventory

`source/human.json` and `source/orc.json` contain explicit per-pixel material/shade
indices and SHA-256 bindings to their original PNGs. Each roster has six active
positions, seven supported body poses per position, six portraits and one helmet:
49 entries each, 98 total. The inventory comes from each roster's current
`team.json` pose catalog; archived poses and unsupported rosters are excluded.
Helmet sources are `ui/helmets-v1/human.png` and `orc.png`. Their runtime lookup
keys retain the atlas fragment identifiers for existing consumers. Static fallback
uses the standalone approved helmet. Other atlas icons remain unchanged.

The palette is the unchanged 16-color, 16-shade palette from
`proofs/shared-sprite-v1/source/palettes.json`. Index 0 is fixed; 1–16 select the
primary ramp and 17–32 select the secondary ramp. Transparent pixels have index 0.
Historical authoring, before the approved redesign promotion:
The accepted Human proof assignments were reused where source identity matches.
Other maps began with offline color selectors, then region corrections for faces,
feet, Troll skin, spikes and helmet hardware. `refine-team-color-materials.mjs`
records the initial corrections and invokes `correct-team-color-coverage.mjs`.
The latter records the 2026-11-04 review repairs: kit adjacent to faces, helmet
brows/rims, shoulder trim, toe armor, hair ties, Troll armor and the worn Orc
helmet panels/stripe. Faceguards, irises and exposed metal have separate protected
regions. Both authoring passes are offline; runtime never infers material from RGB.
`bust-material-boundaries.mjs` records the subsequent annotated bust review:
continuous ivory trim, missed dark armor, secondary hair accessories and fixed
leather/skin/spike contours. The coverage pass applies these reviewed boundaries
last so earlier broad face exclusions cannot erase them.

## Reproduce and review

Run from the repository root:

```powershell
node assets/game/scripts/build-team-colors.mjs
node assets/game/scripts/sync-browser-assets.mjs
npm.cmd --prefix browser-client run assets:check
node --test browser-client/test/team-colors.test.ts
node browser-client/test/team-colors-art-review.mjs
node browser-client/test/team-colors-ui.mjs
```

Do not use `--seed` during ordinary exports: it replaces authored maps.
Source edits require regenerating the packs, manifest, generated TypeScript and
browser delivery. `assets:check` rejects stale exports. Gzip packs carry original
RGBA and material indices, bounded by a versioned manifest and verified hash.

`qa/*<position>.png` show accepted originals, magenta/lime results and assignment
maps for every supported pose. Consumer sheets exercise a 22-player pitch,
helmets, busts and prompts at real layout sizes, with light/light, dark/dark,
identical and saturated pairs. The runtime test covers all splash kinds, both
coach roles, spectator, halves, camera flips, shared portrait identity, cache
churn, teardown and failed fetch fallback. Unit checks exhaust all 256 pairs on
every image for fixed-pixel and alpha invariance.

## Measurements and limits

Human pack: 832,642 gzip bytes / 2,241,360 decoded bytes.
Orc pack: 791,968 gzip bytes / 2,260,825 decoded bytes.
Both loaded packs retain at most 98 decoded images; recolored PNG data URLs use a
128-entry LRU. Last-owner release clears both maps and pending loads. The byte
figures describe payloads, not total JavaScript/browser/GPU heap usage.

`qa/decode-measurements.json` records Node decompression plus validation time;
`qa/runtime-measurements.json` records the named Windows/Chrome environment,
browser cold/warm observations and retained-resource counts. Timing is report-only.
Concurrent validation and local HTTP caching affect these samples; they are not
an isolated benchmark or evidence that recoloring improves frame time.
Android viewport checks run in desktop Chrome. Native Android and Linux browser
rendering have not been validated in this environment.

Same-color helmet rendering additionally separates the glossy shell and stripe
into darker primary and lighter secondary tonal ranges. This conditional runtime
mapping interpolates 16 shades within each range; it does not modify the stored
masks, fixed materials, different-color kits, portraits or body sprites.
