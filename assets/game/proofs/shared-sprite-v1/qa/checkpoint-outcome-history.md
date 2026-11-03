# Shared sprite-format proof: implementation outcome

Date: 2026-11-03. Branch: `feature/shared-sprite-format-proof`, based on `d3a871289` (`main`).

Status: **player/bust rendering and palette approved; full proof incomplete**. The user approved the gradients, selected colors and player/bust implementation on November 3, then added the Human team helmet. No commits, pushes, PRs, merges or deployments. The agreed local spec update was preserved when creating the branch in the existing checkout.

## Tracked slices

| Issue | Deliverable | Dependency / current status |
| --- | --- | --- |
| [#393](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/393) | Parent proof | Approved spec synchronized, including static bust scope |
| [#432](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/432) | Indexed colors, first static sprite/bust, helmet and palette review | Player/bust/palette approved; helmet added to review |
| [#433](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/433) | Authored animation samples and three busts | Palette prerequisite satisfied; first animated lineman approval still precedes the other two designs |
| [#434](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/434) | Full playback review, performance and format decision | Blocked by #433; static preview infrastructure available |

## Implemented behavior

The development-only fixture at `/test/sprite-proof.html` demonstrates 16 color choices with 16 shades each and all 256 combinations on the existing Human lineman front45 sprite and static bust. Two labeled 4×4 radio grids provide independent primary/secondary selection, including keyboard arrows and mobile pointer selection. It provides original comparisons, material overlays, native/integer enlargement, sheet downloads, mirror and body/foot anchor checks, plus representative card, builder, interception and dugout previews through the same portrait identity. No product screen selects the proof pack.

Revision after user review: retained the 16 color choices, expanded from three to 16 shades, and increased chromatic saturation. Contract version 2 uses numeric index rows (0 fixed, 1–16 primary, 17–32 secondary). Shade indices were recovered from original PNG brightness while preserving every material-region assignment, not interpolated from the flattened three-shade output. The previous source maps, palette and export are archived. Original fixed pixels and alpha remain unchanged. The pair of color grids is also recorded as a requirement for the later live product rollout.

The indexed-label contract copies original RGBA and replaces only explicitly assigned uniform pixels. Alpha and fixed materials remain unchanged. Editable per-pixel assignments and PNG hashes support deterministic export. A bounded cache supplies ordinary image URLs, retaining unmatched static fallback URLs. The proof remains separate from accepted team art and uses the existing asset synchronization path.

See [the pack README](../../assets/game/proofs/shared-sprite-v1/README.md) for authoring/export details, source provenance and limitations.

## Acceptance coverage

Helmet addition: the existing Human atlas crop now uses the same selected 16-shade ramps. The proof shows original/recolored/material comparisons, team-name art, and actual turn-start/turnover/touchdown splash components through their existing icon slot. The atlas and all other icons remain unchanged. The helmet has its own editable material map, source/crop metadata, native 256-pair sheet and invariance checks. A lower shell region missed by the initial selection was corrected after visual review.

Future static-site builder note: each primary/secondary picker must be 8 columns by 2 rows. Keep visible color names outside the grids, beside the Primary/Secondary labels; retain accessible names on swatches. The already approved proof's 4×4 controls remain as reviewed.

| Parent requirement | Evidence / remaining work |
| --- | --- |
| Three size classes, clips, directions | Only the static lineman front45 and bust are present; production awaits the agreed approvals |
| All 256 pairs, fixed materials, alpha and geometry | Automated for the three delivered static images, including the helmet; every future frame/bust still needs the same checks |
| Shared bust palettes and UI consumers | Shared resolver route and identical generated bust URL in four development previews; real product rollout excluded |
| Bust sheets and UI/native visual review | Both 256-pair sheets exported; first bust inspected at native/3× and preview sizes; other busts pending |
| Animation sheets, both ends, mirrored/projected views | Static sheets and mirror/body-foot anchor check only; full projected scene and both ends pending |
| Loop, one-shot, pause/step, reduced motion, fallback | Unmatched static URL/null fallback tested; static page under reduced motion tested; animation behavior pending |
| Accepted static sprites unchanged | No accepted masters/catalogs modified; existing art tests and exact delivery check run |
| Repeatable export | PNG hash-bound source maps regenerate exact delivered JSON; export consistency check passes |
| 22-player runtime comparison | Pending authored animation sample; no performance certification claimed from static tests |
| Evidence-based format recommendation | Indexed labels demonstrated for static output; final indexed-versus-mask decision pending animation and visual approval |
| Material visual defects prevent acceptance | Draft map boundaries and revised sixteen-shade treatment exposed for review; format is not declared proven |

## Self-review

Found and corrected: blue-tinted metal was selected by the initial authoring aid; refined the explicit regions to preserve gloves/faceguard. Corrected consumer dimensions using current product CSS. Added explicit control labels after the browser test found ambiguous accessible names.

### Standards

No hard repository-standard violations. Found a clipped head in the default placement preview; lowered the anchor, enlarged the stage and added browser assertions that the entire sprite canvas fits in both anchor modes and both mirror states. The reviewer confirmed the fix. One correctness finding corrected; no remaining findings.

### Spec

No defect in the static checkpoint. The initial size concern used base CSS; current Browser V2 `coach-match.css` overrides supply the 76px card and 27px dugout sizes used here. Compact/other consumer variants remain listed in the pack README. The builder is accurately described as a development preview of the shared route. Zero current-checkpoint defects; full proof acceptance remains intentionally partial as shown above.

## Validation

Helmet revision: 473 browser unit tests passed (including six focused proof tests), browser UI checks passed for the team-name and three real splash previews, 30 asset tests and the 437-file delivery check passed, and both browser builds passed. All 256 pairs were checked for each of the three static images. The current player and bust 256-pair PNG sheets have identical hashes to the approved sixteen-shade evidence. Helmet crop pixels match the original atlas exactly before recoloring; fixed-equipment probes and per-pixel invariance pass. Evidence: `.tools/sprite-proof/review-helmet/` and `assets/game/proofs/shared-sprite-v1/qa/helmet/`.

Earlier sixteen-shade checkpoint validation (retained for chronology):

- `npm.cmd --prefix browser-client run proof:sprites:check`: passed after the sixteen-shade revision; repeatable export and five focused tests, including all 256 pairs for both images, all 32 reserved shade indices, preservation of original material membership, malformed input and bounded cache/fallback.
- `npm.cmd --prefix browser-client test`: 472 tests passed after the revision, including existing player-art/catalog/playback coverage.
- `npm.cmd --prefix browser-client run review:sprites`: passed after the revision on Windows/Chrome; two independent 16-color grids, keyboard selection, original preservation, shared bust URLs, mirror, anchor modes, equal-color pairs, sheet capture and 390px reduced-motion static view.
- `npm.cmd --prefix browser-client run assets:check`: 30 tests passed; 437 delivered assets checked.
- `npm.cmd --prefix browser-client run build` and `build:play`: passed. Diagnostic build emitted its chunk-size warning.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 install`: passed in the normal Windows context; all five reactor modules succeeded. 976 tests reported: 964 passed, 12 skipped, zero failures/errors. Skips cover database-dependent and opt-in recovery/fixture checks; those paths remain unverified. Initial sandbox attempts failed against the cached ClassGraph JAR and target cleanup despite successful read-only JAR/archive probes; the normal-context build completed in 13m11s. Full log: `.tools/sprite-proof/server-build-user-context.log`.
- `git diff --check`: passed. Final review server HTTP probe returned 200.
- The native build result above predates the sixteen-shade/browser-control revision; Java sources and behavior did not change and the native build was not repeated for this revision.
- Current browser evidence is recorded in `.tools/sprite-proof/review-16-shades/browser-results.json` and `assets/game/proofs/shared-sprite-v1/qa/sixteen-shade/`. Android and Linux have not been validated.

## Approval and next work

### First animated lineman checkpoint (2026-11-03)

The static sample approval was followed by 24 generated animation frames: four each for idle, move and contact/fall, in front45 and back45 views. The development review page now plays them with the approved primary/secondary ramps, mirroring, native/integer enlargement, pause/restart/frame stepping, and reduced-motion static poses. Fall holds its final frame. Source sheets, exact prompts, full-size cutouts, hashes, native/3x sheets and a repeatable exporter are retained in `assets/game/teams/human/batches/lineman-animation-proof-v1/`. A shared source-space scale avoids independently enlarging each frame. No product runtime integration has occurred.

Self-review corrected a requestAnimationFrame elapsed-time closure bug before validation. 476 browser tests passed, including timing boundaries, incomplete-clip rejection and all 256 color pairs across all 24 frames. Browser checks passed for pause/step, both views, final fall hold and reduced motion, as well as the prior static checks. Both browser builds passed; 30 asset tests and 438-file delivery check passed. Evidence is in `.tools/sprite-proof/review-helmet/animation-*.png` and `.tools/sprite-proof/animation-*.log`. Native Java is unchanged since the previously recorded build.

Review at <http://127.0.0.1:5182/test/sprite-proof.html#animation-proof>. First animated-sample approval remains pending. Halfling/ogre production, projected-pitch placement, 22-player performance and the final format contract remain outstanding under #433/#434. Inspect generated anatomical consistency and the fall transition during review; passing pixel tests does not approve artwork.

Review server: <http://127.0.0.1:5182/test/sprite-proof.html>. Start/stop details and logs are in `.tools/sprite-proof/review-server*`; the server is local and not a deployment. To restart manually, run Vite from `browser-client` with `--host 127.0.0.1 --port 5182 --strictPort`.

The user has satisfied the spec's palette-sheet approval requirement. The next animation stage is the lineman clips and opposite three-quarter direction; first animated-sample approval remains required before halfling/ogre production. The helmet addition is available on the same review server. Full #434 evidence and the final format decision remain pending.

Old World Classic, production team colors, identical-kit overrides and animation pacing integration remain later features.

## Process retrospective

The installed execution-environment guide correctly diagnosed sandbox GitHub credentials; normal-user keyring access restored the authorized issue operations without relogin. Use `npm.cmd` on this Windows host because PowerShell blocks the npm script shim. Material invariance tests cannot detect wrong semantic labels, so retain the original/material comparison as part of every visual review. No global instruction changes are warranted by this checkpoint.
