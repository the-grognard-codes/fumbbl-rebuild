# Dice event artwork: sample review 1

Tracks #450 under #448. Eight static SVG samples are ready for user review; no runtime code or canonical assets were changed.

## Review artifacts
- [Review page](art-samples/index.html): enlarged and 48px/32px versions, dark/green/light background checks.
- [Desktop preview](art-samples/review-1200.png)
- [Phone preview](art-samples/review-390.png)
- Individual transparent SVGs: dodge-v1.svg, rush-v1.svg, pass-v1.svg, catch-v1.svg, tentacles-v1.svg, weather-v1.svg, deviation-v1.svg, scatter-v1.svg in art-samples/.

## Art direction
Extend the existing native SVG artwork in browser-client/src/DiceOutcomeGraphic.tsx, using its 48-unit view box, rounded strokes and pitch-dice-effects.css palette: blue fill #22547c, cyan edge #4db2ff, ivory/light #c1e9ff, dark #101c2b, gold #ffe17b. Transparent silhouettes with no baked-in text or animation.

- Dodge: cleated boot and curved escape path, distinct from the skill badge.
- Rush: forward boot with speed streaks.
- Pass: laced football following an arc.
- Catch: two receiving gloves and football.
- Tentacles: ivory coils, gold suckers, restrained boot; references illustrated/tentacles.png.
- Weather: sun/cloud/rain combination to denote a weather roll rather than its result.
- Deviation: compass direction plus distance ruler.
- Scatter: successive changes of direction. Per-die result arrows are a separate future UI treatment.

The existing Dodge and Tentacles skill PNGs were visually inspected. Native SVG was selected because this extends the repository's existing outcome SVG system; no image-generation model or raster substitution was used. Reproducible source is create-art-samples.mjs.

## Validation
Ran node .notes/dice-readability/create-art-samples.mjs and node .notes/dice-readability/render-art-samples.mjs. Playwright rendered 1200px and 390px views: eight cards, all images decoded, no horizontal overflow. Both screenshots were visually inspected. The samples have no animations or tooltips.

Gold/light details have weaker contrast on the pale stress-test strip; final placement should preserve the existing dark dice-display backing or use theme-aware contrast treatment. Native-size final pitch integration still requires validation after art approval. Product unit/browser/server suites and dev-local restart are pending the runtime slice, not claimed as complete for this isolated artwork review.

## Approval gate
Await user approval or concrete revisions to the eight samples before creating remaining artwork or integrating the UI, as explicitly agreed in the feature clarification.
