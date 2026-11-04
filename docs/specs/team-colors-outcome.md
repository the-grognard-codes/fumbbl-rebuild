# Saved team colors implementation outcome

Branch: `feature/saved-team-colors`. Parent issue: [#438](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/438).
Merged in [PR #446](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/446) on 2026-11-04 after manual acceptance and passing CI. Dev-local is stopped. Remote deployment was not requested. Earlier validation entries below are historical.

## Delivered scope

| Slice | Result |
| --- | --- |
| [#439](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/439) | Stable palette IDs, strict nested color version 1, saved document format 4, legacy read compatibility, normal-save defaults, immutable create/join snapshots and historical absence |
| [#440](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/440) | All 49 active Human body/bust/helmet images, explicit material maps, hash-bound packed delivery and review sheets |
| [#441](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/441) | All 49 active Orc images using the same contract; skin and helmet hardware corrections recorded |
| [#442](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/442) | Two accessible 8×2 grids, selected names, keyboard controls, immediate bust/helmet/body preview, normal validation/save/copy flow and mobile layout |
| [#443](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/443) | Shared bounded renderer/cache for live pitch, dugout, hover, player choices, scoreboard, replay and turn-start/turnover/touchdown splashes |

The production path uses existing DOM/canvas artwork consumers. It does not add
the proof's separate Pixi scene to production. All consumers resolve through the
same material pack and palette. Geometry, anchors, player identity and broader
UI colors remain in their existing owners. There is no animation, stadium,
theme, arbitrary RGB or opponent-kit-substitution feature.

## Acceptance evidence

| Requirement | Evidence |
| --- | --- |
| Save/reload/copy, invalid input, owner/revision/catalog rules | `BrowserSavedTeamJsonTest`, saved-team protocol tests and hosted builder browser test; existing authorization/conflict checks retained |
| New/legacy defaults, no read-time migration | Saved format 4 requires colors; older named drafts retain absence on read and gain effective colors through normal save/copy; Human Navy/Ivory, Orc Black/Orange |
| Two independent grids including identical pairs | Hosted builder test selects Red/Red, verifies validation invalidation, keyboard movement, saved reload/copy and Orc defaults |
| Unsaved previews and mobile use | Builder screenshot `.tools/team-colors-builder-mobile.png`; 360px layout has no horizontal overflow; site build explicitly includes picker CSS |
| Frozen colors survive edits/deletion | `MatchServiceTest.frozenColorsSurviveSourceEditsDeletionAndStoredReloadWhileHistoricalAbsenceStaysAbsent`; stored snapshots carry colors without consulting current saved teams |
| Recovery/replay compatibility | Native replay/recovery suites exercise new frozen defaults; strict replay comparison uses decoded color values so canonical JSON field ordering remains compatible |
| Historical absence | Older frozen members and presentation data omit colors; renderer preserves original art rather than inferring defaults |
| Shared consumer identity and all splashes | `team-colors-ui.mjs` uses actual production consumers, compares chooser/hover portraits and checks 22 bodies, two helmets, dugout and all three splash kinds |
| Ownership independent of presentation | Distinct pairs stay with their teams across home/away/spectator roles, both halves and camera flips; identical opposing pairs also supported |
| Complete inventory and material preservation | 98 entries, all 256 ordered pairs, fixed-pixel/alpha invariance, source hashes, dimensions and bounds checked; 14 per-position/helmet review sheets |
| Safe fallback and resources | Failed fetch keeps all 22 static players; 40 palette changes stay within 128 cached images; unmount leaves zero owners, decoded images and cached variants |
| Performance reporting | Versioned JSON observations and asset sizes in [the asset record](../../assets/game/team-colors/v1/README.md); no timing acceptance gate |

## Validation record

- Browser unit suite: 475 passed.
- Final focused color/protocol suite: 44 passed.
- Asset checks: 30 passed, 489 delivered files checked, deterministic color export verified.
- Hosted builder interaction test passed, including mobile, save/copy and both rosters.
- Team-color production consumer test passed, including orientation, teardown and fallback.
- Browser TypeScript and production build passed; `build:play` is the same sole-runtime build.
- Native aggregate reports: 978 tests, zero failures/errors, 12 skipped opt-in
  JDBC/retained-fixture integrations. The full run exposed nine projection
  expectations; the corrected classes plus final persistence/replay checks were
  rerun (78 tests passed). Final Maven install/package passed with tests already
  verified by those runs.
- Complete dev-local browser validation passed: 73 suites across four interaction
  shards and the hosted-page shard, zero failures/errors. Reports are in
  `.tools/validation/local-browser-sdqgLp`; the run took 780.5 seconds with three
  workers. Dev-local startup and the final served-asset smoke check passed.

Self-review caught and corrected: the second saved-document format whitelist in
the V2 transport; site-only CSS delivery; canonical replay JSON field ordering;
material assignments touching face/skin/metal; and new frozen defaults missing
from native-generated browser fixtures. Fixture updates are restricted to the
new `homeTeamArt.colors` / `awayTeamArt.colors` values after structural comparison.
An existing gameplay interaction timed out under concurrent validation and then
passed all 17 cases independently; dev-local was retried with two workers.
The renderer degradation test was updated to fail both static PNGs and color
packs; all four degraded/normal scenarios and teardown cases then passed.
The color review harness was corrected to include production page CSS and layout
wrappers before regenerating the final screenshots and timing observations.
The Linux image build exposed a random-kickoff dependency in
`SetupSessionMovementTest.specialTurnForecastsAreBoundedAndOtherModesGiveNoGuidance`:
its first opposing player could be injured and have no movement allowance. The
test now explicitly places two standing players, following the adjacent range
test's existing fixture pattern. Its focused Windows rerun passed. Service
startup was resumed with all five successful browser reports revalidated;
browser implementation remained unchanged, and Linux image tests were rerun.
The resumed Linux server suite passed: 653 tests, zero failures/errors, five
opt-in skips, including all 23 tests in the corrected movement-test class.

## Performance and platform scope

The two compressed packs total 1,613,866 bytes; decoded source buffers total
4,502,185 bytes. Resource counts are bounded, but these figures do not measure
total browser/GPU memory. The report includes Node inflate/validation, fresh
art-cache load/first recolor, cached lookup and 120-frame warm/static samples.
Browser HTTP cache is allowed in the fresh-art-cache measurements.

| Observation (latest dedicated run) | Human | Orc |
| --- | ---: | ---: |
| Fresh art-cache fetch/decode | 25.1 ms | 26.4 ms |
| First representative body recolor | 3.1 ms | 4.3 ms |
| Cached lookup | below timer resolution | below timer resolution |
| Static render-to-next-animation-frame median / p95 | 11.6 / 48.4 ms | 13.3 / 40.8 ms |
| Warm colored render-to-next-animation-frame median / p95 | 11.2 / 44.2 ms | 12.2 / 31.1 ms |

These frame samples include scheduling and React rendering; they are not GPU
frame-time measurements. The raw JSON is authoritative for reruns. Initial Human
page-to-colored-art timing also includes development module loading, so it is
not a production network benchmark.

Measurements ran on Windows 11, Ryzen 7 260/Radeon 780M and headless Chrome 156
alongside other validation. They show no isolated, quantified steady-state
regression; differences between these noisy frame samples must not be described
as a performance improvement. Performance is informational, per the confirmed Q1.
Native Android and Linux rendering remain untested; Android-sized desktop Chrome
viewports do not establish native-device compatibility.

## Manual validation

Dev-local is running. `/play`, `/teambuilder/` and `/assets/team-colors.css` returned
HTTP 200; both served color packs matched their decoded byte counts and SHA-256
hashes. The review database/server are healthy, Firebase ADC passed, nginx reached
the real Java authentication gate on initial connection and reconnect, and the
local computer-player service started. Startup logs:
`.tools/team-colors-dev-local-resumed.log`; smoke checks:
`.tools/team-colors-local-smoke.log`.

Open `http://localhost:5000/teambuilder/`, sign in,
create or load a Human/Orc team, choose both colors, then Validate/Save. Copy/reload
it and start a match through `http://localhost:5000/play`. Change the saved team
after creating the match and verify the existing match retains its original kit.
Inspect dugouts, hover/player choices, camera flip and replay as well as pitch bodies.

## Session retrospective

1. The native projection assertions can print megabyte JSON strings. A structural
   diff helper would make fixture failures easier to review without log flooding.
2. Keep deterministic export checks wired into `assets:check` (done here), and
   distinguish interactive `*-ui.mjs` suites from offline contact-sheet tooling
   when registering the browser manifest.
3. The existing `FFB_BROWSER_TEST_WORKERS` control is useful when native and
   browser validation compete for resources. Record worker count with timings
   and avoid treating a busy-machine timeout as a product diagnosis.
4. On Windows, finish all Vite validation processes before starting another
   dev-local invocation: its `npm ci` replaces native modules that those
   processes hold open.

These are process observations; no unrelated workflow changes were made.

## Material coverage correction — 2026-11-04

User review found unchanged kit details in the initial conversion. Continued on
`feature/saved-team-colors` under the existing Human #440 and Orc #441 slices.
The original source PNGs, geometry, alpha and renderer are unchanged. Corrected
5,221 Human and 9,852 Orc material assignments across the existing catalog.

The offline coverage pass repairs blue kit near faces, Human helmet brows and
the splash helmet rim, orange hair ties, shoulder trim and shoe armor. Additional
review covered the Ogre and Troll shoulders and the remaining position sheets.
The Orc splash helmet retains its silhouette, copper hardware and chipped wear;
surviving shell paint uses primary and the worn front stripe uses secondary.
Warm exposed metal deliberately remains visible in the Black/White example.

Self-review of enlarged region grids caught overly broad initial repairs touching
metal reflections, eyes, a football and Troll skin. Narrower faceguard, face,
ball and armor regions replaced those trial assignments before delivery. The
authoring sequence reproduces identical source-map hashes on repeat execution.

Validation after the final correction:

- Five focused color tests pass, including 19 visually selected material landmarks
  and all 256 color pairs across all 98 images for alpha/fixed-pixel preservation.
- All 30 asset tests pass; all 489 browser delivery assets and deterministic pack
  exports pass validation. TypeScript and production browser build pass.
- Browser consumer/lifecycle/fallback checks pass, including regenerated palette
  extremes and 2x consumer screenshots. Fourteen roster/helmet sheets were reviewed.
- Persistent local preview smoke: 14 gallery sheets decode, 22 colored pitch players
  render, and there are no page errors.

Report-only measurements: Human first recolor 2.8 ms, Orc 1.6 ms; cached lookup
below timer resolution. Warm median frame samples were 6.1/6.6 ms versus static
6.3/6.1 ms. These mixed browser/React scheduling samples do not establish a causal
performance change. Compressed payload increased by 11,204 bytes (about 0.7%);
decoded payload and cache limits are unchanged. Raw observations remain in
`assets/game/team-colors/v1/qa/runtime-measurements.json`.

Manual review is ready without ADC:

- Gallery: http://127.0.0.1:5175/review.html
- Renderer fixture: http://127.0.0.1:5173/test/team-colors.html
- Corrected native PNGs, comparison sheets and ZIP are in `.tools/exports/`, in
  the requested game's separate `-corrected` directory and `-corrected-sprites.zip`.
  Original annotated exports were preserved.

The authenticated dev-local match was not revalidated in this correction session;
the user reported expired ADC. These review servers do not require cloud login.
Native Android/Linux browser rendering remains unverified. Changes remain
uncommitted and unpushed.

Follow-up review on 2026-11-04: corrected the remaining Big Un prone chest plate
(19 secondary assignments) and Ogre front/front45/side pauldron edges (157
secondary assignments). Added four independent material landmarks (23 total).
Focused tests, all-pair invariance, deterministic export and 489-file delivery
checks pass. Updated comparison sheets and the separate corrected match export.
The Orc helmet's appearance remains under user review; its mask was not changed
in this follow-up. `qa/orc-helmet-detail.png` shows native-size original,
magenta/lime rendering and a flat material mask (gray means fixed), making the
large fixed wear/hardware areas explicit.
The enlarged mask also exposes a rectangular secondary spill onto the brow band
and fragmented primary coverage. Helmet acceptance remains unresolved; this is
not explained solely by low contrast with the Black primary palette.

Subsequent user direction: the entire central Orc helmet metal band is secondary,
including the central rivet, wear and pits. Replaced the fragmented color selector
with a contour matching the metal band and removed the rectangular spill from the
horizontal brow. Source luminance supplies shading throughout the secondary band;
the spike and surrounding hardware remain fixed. Updated native-size original,
high-contrast, flat-mask and Black/White previews are in `qa/orc-helmet-detail.png`.
All five focused tests pass, including the new band/rivet/brow landmarks and all
256 color pairs. Geometry, source PNG and alpha remain unchanged.

Final hardware clarification: the circular feature on the band is a spike facing
the viewer. Its visible head and base now remain fixed original RGBA; the band
around it remains secondary. Regression landmarks protect the spike center,
left edge and adjacent secondary band. Focused tests and deterministic asset
checks pass; the high-contrast/mask/Black-White preview reflects this correction.

## Annotated bust boundary review — 2026-11-04

Applied the user's pastel-blue annotations as material-review targets, not as
replacement colors. Added explicit native-pixel contours in
`assets/game/scripts/bust-material-boundaries.mjs`:

- Human Lineman, Thrower, Ogre and Halfling: continue secondary ivory borders
  around the inner shoulder edges and remaining outer trim. Restore fixed leather
  beside the Ogre's face.
- Orc Lineman: extend primary into the missed inner armor and collar edges.
- Big Un: restore fixed leather along the neckline.
- Orc Thrower: assign remaining orange hair/accessory bands to secondary.
- Troll: remove recoloring from exposed skin below both shoulder plates.
- Goblin: extend primary into the cheek guard and shoulder plate; preserve the
  helmet spike and restore fixed leather beneath the left shoulder.

Exactly nine portrait maps changed; the other 89 image maps are byte-identical to
the pre-review snapshot. No original PNG, body pose or helmet changed. Sixteen new
landmarks protect the additions and exclusions. All five focused tests pass,
including all 256 palette pairs, as do 30 asset tests, the 489-file delivery check,
TypeScript/production build and browser consumer/lifecycle/fallback validation.
Repeat authoring produces identical source-map hashes. That check exposed an old
helmet reseeding branch in the initial refinement helper; it now preserves both
separately reviewed helmet maps.

The 12 individual 2x comparisons, two native-size roster overviews and gallery
are refreshed in `assets/game/team-colors/v1/qa/bust-review/`. Both review ZIPs
and the requested match's corrected extraction were refreshed. Report-only
performance observations are recorded in the existing runtime measurements;
concurrent screenshot work produced a 65.2 ms Human first-recolor outlier versus
2.5 ms for Orc, while warm median frame samples were 6.9/6.8 ms. These are noisy
observations, not acceptance gates or evidence of a causal regression.

### Gray-mask cleanup review - 2026-11-04

Applied the second annotated bust review: gray marks preserve original materials,
pink marks identify primary, and green identifies secondary. Native source edges
resolve approximate pencil boundaries. Cleanup covers faceguards, helmet fittings,
shoulder rims and rivets, skin, spikes, and leather straps across all 12 portraits.
The Orc Lineman neckline lip and Goblin cheek lip are now fixed material, replacing
the earlier primary expectations; adjacent armor remains primary.

All 12 portrait maps changed; the other 86 image maps and original artwork are
unchanged. Five focused tests pass, including fixed RGBA/alpha preservation across
all 256 palette pairs and the expanded material landmarks. Thirty asset tests and
the 489-file delivery check pass. Full repeat-authoring produces identical hashes.
No runtime code or decoded pack dimensions changed. Compressed sizes are now
832,677 bytes Human and 792,134 bytes Orc; performance remains report-only.

Regenerated all 12 individual original/high-contrast/mask comparisons and both
roster overviews in `assets/game/team-colors/v1/qa/bust-review/`, with the gallery
and `.tools/exports/team-bust-material-review.zip` ready for the next visual review.
This is a review iteration, not a claim of final visual approval.

### Pink/green bust annotations - 2026-11-04

Applied explicit material contours to the remaining marked Human Blitzer helmet
highlights and forehead fitting, Human Catcher shoulder trim, Orc Lineman inner
shoulder plate, Orc Blitzer cheek armor, and Goblin cheek/shoulder armor. Fixed
contours take precedence; dark outlines retain their original pixels.

Five portraits changed; all 3,754 pixels removed from the masks during gray cleanup
remain fixed. The other 93 image maps remain unchanged. Seven material landmarks
were added. All five focused tests, 256-pair RGBA/alpha preservation, 30 asset tests,
489-file delivery checks and repeat-authoring hashes pass. Refreshed the complete
bust review gallery, individual comparisons, overviews and ZIP. Compressed packs
are 832,716 bytes Human and 792,542 bytes Orc; decoded sizes and runtime are unchanged.

### Fourth annotated bust review - 2026-11-04

Compared every portrait with the prior round using side-by-side previous/current
high-contrast renderings and masks. Applied native-boundary interpretations of the
new pink, green and gray strokes. Region review:

| Portrait | Result |
| --- | --- |
| Human Lineman | Existing assignments retained; no new material change indicated. |
| Human Blitzer | Reviewed crown highlights and cheek hardware; existing assignments retained. |
| Human Catcher | Removed remaining face/eye-area mask speckles. |
| Human Thrower | Removed remaining forehead/eye-area mask speckles. |
| Human Ogre | Preserved upper shoulder hardware and lower leather edge speckles. |
| Human Halfling | Existing assignments retained. |
| Orc Lineman | Cleaned pauldron rims and neckline, filled marked breastplate edge; preserved secondary chest stripe. |
| Orc Blitzer | Added primary brow/cheek edge and secondary under-spike patch; cleaned spikes, rims and lower leather. |
| Big Un | Cleaned shoulder spike edge and neckline leather. |
| Orc Thrower | Cleaned accessory, shoulder/neckline and lower leather spill. |
| Troll | Tightened inner pauldron rims. |
| Goblin | Cleaned face and lower leather; latest pink strokes revise the left helmet lip and spike socket to primary while preserving the spike. |

Nine portraits changed; the other 89 image maps are unchanged. Original artwork,
alpha, body poses and splash helmets are unchanged. Added five material landmarks.
All five focused tests, all 256 palette combinations, 30 asset tests and the
489-file delivery check pass. Full authoring was repeated to normalize restored
Lineman stripe shading; a subsequent repeat produces identical hashes.

Regenerated the same 12 individual original/high-contrast/mask comparisons, both
roster overviews, gallery and ZIP. Additional previous/current comparison sheets
are `.tools/human-round4-audit.png` and `.tools/orc-round4-audit.png`; per-image
assignment counts are in `.tools/bust-round4-audit.json`. Compressed pack sizes:
832,642 bytes Human and 791,968 bytes Orc. Runtime and decoded dimensions unchanged.

### Approved portrait and helmet production promotion - 2026-11-04

Continued on `feature/saved-team-colors`, reusing #440, #441 and #443. Final art
review is accepted. Promoted all 12 portraits and both helmets from the approved
Blitzer v3, roster v1 and helmet v1 trials. `approved-art.json` records exact source
and mask provenance. Production pixels and indices match the approved trials.

Portraits now occupy the existing production catalog URLs with updated visible
bounds. Helmets use standalone 320px PNGs and preserve the existing color lookup
keys. Static fallback and colored variants use the same approved designs. All 84
body poses, their masks, geometry and anchors remain unchanged. Historical sprite
proof portrait sources are archived so that proof remains reproducible. Earlier
mask-repair scripts skip the approved redesigns to prevent accidental regression.

Validation completed:
- Six team-color tests, including 256-pair fixed RGB/alpha preservation and exact
  approved-pixel/mask comparison for all 14 promoted images.
- Thirty asset tests, repeatable pack/proof export checks, and 491 delivery files.
- TypeScript and production browser/static-site builds.
- Production consumer browser tests, including both rosters, all splash kinds,
  identical kits, lifecycle/cache bounds and decoded standalone helmet fallback.
- Hosted builder save/reload/preview browser test, eight site integration/cache
  tests and site input checks. Native/2x production bust galleries refreshed.
- Visual inspection of both teams in production hover cards, player choices and
  scoreboards. No commit, push, merge or remote deployment performed.

Pack sizes: Human 592,905 bytes and Orc 585,368 bytes compressed; each decodes to
2,220,800 bytes. The final browser measurement ran alongside the required parallel
local browser suite: warm median frame observations were 15.6ms for each roster
versus static 14.7ms Human / 11.5ms Orc; p95 was lower for colored rendering in
both cases. These are noisy local observations, not isolated regression estimates
or gates. Cache lookups were 0-0.1ms; measured first recolor was 88ms Human / 5.2ms
Orc. Full environment and observations are in `qa/runtime-measurements.json`.

Dev-local startup completed successfully. Startup initially encountered a
sandbox credential boundary and an existing Vite process holding the native
bundler library. The process lock was cleared and dependencies restored.

The complete dev-local prerequisite validation passed: 63 interaction suites and
10 hosted suites (all five reports) in 547.2 seconds. Reports are under
`.tools/validation/local-browser-VfmUyf/`. The updated local hosting artifact has
been assembled and the isolated game server is healthy. Firebase ADC is valid.
The proxy/browser reconnect smoke test reaches the real Java V2 authentication
gate; the computer-player service is ready. HTTP verification confirms /play and
/teambuilder respond successfully, all 14 approved PNGs match canonical files
byte-for-byte, and the served color manifest is current.

Manual validation: http://localhost:5000/play and http://localhost:5000/teambuilder.
The container Maven build passed; environment-dependent database integration
tests retain their configured opt-in skips. No artwork acceptance work remains.

### Match portrait and helmet tones to player sprites - 2026-11-04

The brighter kit came from trial shade assignment, not swapped material labels:
Human Lineman primary median was shade 8 against the body sprite's shade 4; the
helmet median was 9. Both channels used the same palette, but their shade
populations were too similar to retain the player's two-tone treatment.

Promotion now calibrates each material with a monotonic power curve to the
corresponding front-facing body median, using all roster fronts for helmets.
Darkest and brightest endpoints remain intact. Approved region membership,
fixed-material RGB and alpha remain exact; player sprite data is unchanged.
Default PNGs and color packs are rebuilt together. The picker palette is unchanged.
The original trials are preserved, with per-image calibration provenance recorded.

The new regression test first failed at Human Lineman primary 8 versus 4, and now
passes for all 14 portraits/helmets and both channels. Seven focused tests pass,
including all 256 palette pairs, fixed RGBA preservation and calibrated static
fallback parity. Thirty asset tests and 491 delivery checks, TypeScript/build,
production consumer browser checks and the hosted builder test pass. Reviewed
red/red, navy/navy and magenta/magenta comparisons for both rosters at
`assets/game/team-colors/v1/qa/human-matched-tones.png` and `orc-matched-tones.png`.

Refreshed the existing local hosting artifact without restarting the healthy game
server. HTTP verification confirms /play and /teambuilder, all 14 calibrated PNGs
byte-for-byte, and the current color manifest at http://localhost:5000.
Pack transfers are 585,572 bytes Human / 582,145 bytes Orc; decoded sizes unchanged.
Runtime measurement observations remain report-only in qa/runtime-measurements.json.

### Same-color helmet contrast - 2026-11-04

The earlier median calibration did not fully address the helmet at the actual
72px picker size: glossy primary highlights overlapped the secondary stripe.
Same-color helmets now use separate interpolated tonal ranges within the selected
palette (primary 0-10, secondary 9-15), retaining 16 sampled shades per material.
This is conditional on helmet kind and identical color IDs. Different-color kits,
all busts and all body sprites are unchanged. Fixed metal/spikes and alpha remain
unchanged. The material maps and delivered packs are unchanged by this fix.

Reviewed all 12 busts at 88px and both helmets at 72px with red/red, navy/navy and
magenta/magenta. Bust trim remains visible and was retained. Comparison sheets:
`qa/human-same-color-small.png` and `qa/orc-same-color-small.png`.

A failing-first regression confirms secondary midtones exceed primary highlights
for same-color helmets; another protects bust/body/different-color behavior.
All nine focused tests (including 256 palette combinations), consumer browser
checks, hosted builder test, TypeScript and production build pass. Local Hosting
was refreshed; HTTP verification confirms the corrected renderer bundle, both
pages, current manifest and all 14 approved asset PNGs. Dev-local remains ready.

### Delivery authorization - 2026-11-04

Owner accepted final manual validation and authorized staging all checkout changes,
commit, PR publication, CI-gated merge to main, branch removal, completed-feature
tracking, and dev-local shutdown. Dev-local is stopped; database volumes retained.
Remote deployment remains outside this request.


### Merge completion - 2026-11-04

PR #446 merged as 08ec602b9615197766edcdee120ce3d07317a3bd. CI portability finding fixed by
normalizing the gzip OS header; exports were verified byte-for-byte in Linux.
CodeQL logging finding fixed using a constant format string. Final validation and
security checks passed. Public completion tracker now records the actual merge.
Dev-local hosting, proxy, computer player and game/database containers are stopped;
database volumes retained. Working branches are removed after merge.
