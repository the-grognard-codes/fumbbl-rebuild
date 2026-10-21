# Block and assist visual mockups

Throwaway visual study on branch `block-assist-mockups`. The question is which
coordinated set of block-direction, offensive-assist, and defensive-assist
graphics reads best over MUTP's pitch. The user selected C (Option 3); C2 is
the requested revision, awaiting visual review.

## Open the review

From `browser-client`, run `npm run mockups:block-assists` (use `npm.cmd` in
Windows PowerShell if its script policy blocks `npm.ps1`). Open:

- [A: Impact chevrons](http://127.0.0.1:5181/pitch-preview?variant=A)
- [B: Converging corners](http://127.0.0.1:5181/pitch-preview?variant=B)
- [C: Linked signals](http://127.0.0.1:5181/pitch-preview?variant=C)
- [C2: Linked signals revised](http://127.0.0.1:5181/pitch-preview?variant=C2)

Use the floating selector or left/right arrow keys to switch designs. The
variant is retained in the URL. Add `&capture=1` for a full-page screenshot with
the selector below the content, leaving the pitch unobstructed.

Each design includes three individual element samples and a combined pitch
example. The prototype reuses the current camera projection, stadium renderer,
player sprite resolver, MUTP font, threat colors/projection, and block dice.
New marker geometry is SVG so it remains readable at different scales.

## What to compare

| Design | Block | Offensive assist | Defensive assist | Motion |
| --- | --- | --- | --- | --- |
| A: Impact chevrons | Broad double chevron | Narrow connecting spear | Shield source and connecting arrow | Short chasing highlight |
| B: Converging corners | Double open pointed border | Pointed, open square border | Closed shield border with crossbar | Converging highlight and slow pulse |
| C: Linked signals | Heavy connection and impact burst | Diamond source and dashed spear connection | Shield source and barred arrow connection | Highlight along the connection |
| C2: Linked signals revised | Shorter, thinner arrow with original impact burst | Smaller circle and solid shaft joined at its boundary | Smaller diamond joined at its forward vertex, with a flush barred chevron | Paired glowing chasers, then shaft travel; impact convergence brightens |

All three use ivory for the block, gold for offense, and cyan for defense.
Shape differentiates the roles without relying on color. Dark outlines keep
signals visible over threat fills and stripes. Original A/B/C markers render
above those fills and the players. C2 assist markings render above the threat
fills but below player shadows and sprites, projected onto the pitch plane as
paint. C2 removes the source symbols' solid backgrounds and vertical shadow
offset; a subtle outline maintains contrast. Its block marker stays above the
sprites and retains C's impact burst. Defensive diamonds rotate with their arrow,
so the shaft connects to a vertex, never the middle of an edge. The later
block-arrow revision shortens its shaft by 37.5% in pitch coordinates, reduces
the shaft/head stroke from 5px to 3px, and narrows the arrowhead from .4 to .26
pitch squares. The impact burst keeps its original geometry, stroke, and position.
Circle radius is now `.23 * .75 = .1725` pitch squares; diamond half-diagonal is
`.28 * .75 = .21`, a 25% reduction in each shape's linear dimensions. Shaft and
origin share the exact boundary point. Shaft and chevron share an endpoint;
the defensive bar passes through that tip with matching transverse extent.
Butt caps and bevel joins prevent the chevron's miter from overshooting the bar.

C2's 4.8-second glow cycle splits at the back of each origin, follows its two
sides, converges at the shaft connection, then travels along the shaft. For the
block marker, the chaser starts at the shortened arrow's base. Two subsequent
chasers traverse opposite ends of the unchanged impact outline and meet at its
middle tip, which flares brighter. The original dashed animation remains only
on A/B/C for comparison.

Use **Animation phase** to freeze early, middle, or convergence timing; **Live**
resumes it. Static geometry remains when animation is disabled. Reduced motion
starts with **Animate markers** off. Explicitly enabling that checkbox previews
the motion within this prototype without changing the browser or OS preference.

Controls show fixed examples of ordinary blocks, remote blitz planning, uphill
die selection, and Multiple Block. They also show cancellation and target
movement clearing. Multiple Block retains the other target marker while
showing only the active block's assists. Camera, coach view, threat backdrop,
and animation can be changed independently.

## Limits

Positions, assist contributors, threat density swatches, and dice are fixed
illustrations, not authoritative gameplay forecasts. These controls demonstrate
visual intent; they do not implement or validate the final action lifecycle.
There are no match requests, protocol changes, persistence, or production route
changes. The local review server supplies an isolated `/pitch-preview` page.
The normal browser application does not import this prototype.

The agreed feature includes live coach/spectator, replay, and recovery support,
authoritative assist metadata, and no backward compatibility for old records.
Those integrations follow design selection. Private planning previews remain
private; committed context is shared. Server rules and sequencing stay intact.

## Review evidence

Screenshots and browser check results are in
`../../../.notes/art-preview/block-assists/`:

- `A-impact-chevrons.jpg`, `B-converging-corners.jpg`, `C-linked-signals.jpg`:
  each full coordinated set, including all three individual elements.
- `C-uphill.jpg`: current MUTP dice with block context retained.
- `C-narrow-390.jpg`: narrow-screen layout.
- `review-checks.json`: observed prototype browser checks.
- `C2-pitch-painted-assists.jpg`, `C2-tactical.jpg`, `C2-narrow-390.jpg`:
  the revised design with circular offensive and diamond defensive origins.
- `C2-review-checks.json`: revised marker counts, paint order, both cameras and
  coach views, narrow layout, scenario switching, and clearing. Compared C2's
  initial assist-only revision's block paths/strokes and defensive endpoint-bar
  paths against C: unchanged. Prototype TypeScript check passed after that revision.
- `C2-compact-block.jpg`: subsequent shorter/thinner block arrow, retaining the
  original impact burst and revised assists. `C2-compact-block-checks.json`
  records the comparison with the prior C2 geometry and camera/view checks.
- `C2-glow-early.jpg`, `C2-glow-aligned.jpg`, `C2-glow-impact.jpg`: current
  smaller origins, clean vertex/boundary connections, and sequential glow phases.
  `C2-glow-checks.json` records exact joins, radii, diamond-vertex alignment,
  flush defensive bars, unchanged impact geometry, computed animation phases,
  both cameras/coach views, blitz/uphill/Multiple Block examples, target-movement
  clearing, a 390px viewport, reduced-motion defaults, the explicit motion
  preview toggle, and live animation. Prototype TypeScript check passed.

Checks performed:

- `node node_modules/typescript/bin/tsc -p prototypes/block-assists/tsconfig.json`
  from `browser-client`: passed.
- Chrome: all three designs in perspective/tactical and home/away views
  (12 combinations); finite marker paths and no horizontal page overflow.
- Chrome: all three designs with ordinary block, blitz, uphill, and Multiple
  Block examples; committed display, cancellation, target-movement clearing,
  and switching the active Multiple Block target.
- Chrome: all three designs at a 390 x 844 viewport; no horizontal overflow.
- Chrome: animation-off, threat-backdrop toggle, keyboard variant switching,
  and URL restoration after reload.

No new automated regression tests were added for this throwaway visual study.
Gameplay unit tests, integration browser suites, replay/recovery regression
suites, and the Maven server build were not run: production gameplay and
rendering paths are unchanged. They remain required when the selected design
is integrated.
