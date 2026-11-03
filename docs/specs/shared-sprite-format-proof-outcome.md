# Shared sprite-format proof: implementation outcome

Date: 2026-11-03. Branch: `feature/shared-sprite-format-proof`, based on `d3a871289` (`main`).

Integration update: rebased working content onto `da087a2c0` from origin/main after V1 retirement (#436/#437). The only conflict was CHANGELOG.md; both entries were retained. The proof stays an independent Vite art fixture and uses no V1 WSS path. Team-color planning no longer requires the retired diagnostic TeamPanel import/export UI. Generated proof JSON now has explicit LF attributes for deterministic Windows/Linux checkout checks. Handoff for the next feature was written to the OS temporary directory before commit.

Status: **bounded proof approved and merged** in [PR #444](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/444) on 2026-11-03, commit `615df5fc91d44412ebcb0e187cb391cd1633d038`. The user approved the static palette/player/bust/helmet checkpoint and then the first lineman animation. That approval unlocked the halfling and ogre samples. The recommended format is formalized in [the shared sprite contract](shared-sprite-format-contract.md). The proof and approved next-feature specification landed together. No deployment occurred. Accepted production art, server state and default Match behavior remain unchanged.

Review server stopped after approval and merge preparation; port 5182 was verified closed. Review route: `/test/sprite-proof.html#animation-proof`. Server logs/PID: `.tools/sprite-proof/review-server*`. To restart, run Vite from `browser-client` with `--host 127.0.0.1 --port 5182 --strictPort`.

## Tracked slices

| Issue | Result |
| --- | --- |
| [#393](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/393) | Parent scope implemented in a development-only proof. |
| [#432](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/432) | Approved 16 colors × 16 shades, static lineman, bust, Human helmet and paired grids. |
| [#433](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/433) | 48 animation frames: lineman front45/back45, halfling/ogre front45; idle/move/fall for each; three recolorable busts. |
| [#434](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/434) | Metadata-driven playback, projected Pixi scene, static fallback, evidence, performance comparison and format contract. |

The proof issues closed with PR #444. Team-color implementation remains tracked separately in #438?#443.

## Acceptance coverage

| Parent requirement | Evidence |
| --- | --- |
| Three size classes and scoped clips/directions | 64px standard/small and 80px big canvases; 12 clips with four frames each. Full-size generated sources, exact prompts, exports and native/3x sheets retained in versioned Human batches. |
| All 256 ordered pairs | Tests cover all 48 frames, three busts, original lineman and helmet. Fixed pixels, alpha and geometry are invariant. Explicit material indices and PNG hashes bind assignments to sources. |
| Bust consumers | All three designs resolve through the existing portrait identity; card 76px, builder 48px, interception 66px and dugout 27px previews use identical generated URLs. Actual production routing remains excluded. Compact card, builder roster and secret-weapon variants are inventoried in the pack README. |
| Bust/palette sheets | Six new native 256-pair sheets cover all three busts and representative frames. Approved lineman/helmet sheets remain retained. Actual UI and integer-zoom captures included. |
| Helmet | Unchanged original Human atlas crop; shared palette in team name and three real splash components. Other atlas icons retain existing fallback. |
| Visual review | Every sample frame inspected on green at 3x; native samples, both coach ends, both projections, mirroring, light/light, dark/dark, contrasting and similar/identical kits captured. Fall ends grounded; camera changes use existing static art when the authored facing is absent. |
| Timing and fallback | Manifest durations, loop boundaries, final hold, pause/restart/step, reduced motion and unsupported-facing fallback tested. Unknown clip lookup returns null for the static path. |
| Placement and existing art | Existing direction resolver, `playerArtPlacement` and `PitchProjection` reused. Per-frame bounds/anchors validated. No accepted catalogs or masters changed; player-art/catalog tests pass. |
| Repeatable export and delivery | All 48 native PNGs re-exported through the standard PowerShell exporter and SHA-compared identical. Both JSON exports check byte identity. 486 delivery files verified. |
| 22-player scene | Current Pixi WebGL path compared with accepted static sprites; repeated palette changes release prior owned textures. Results and limitations below. |
| Format decision | Recommend explicit material/shade indices over original RGBA plus clip metadata. Masks/layers compared in the contract; no concrete failure justified building a second pipeline. |

The proof keeps two approved 4×4 color grids. The future static-site builder must use **8 columns × 2 rows per primary/secondary grid**, with selected names beside the grids and accessible swatch names. Identical opposing colors remain valid; local kit overrides are a separate feature.

## Review findings and fixes

Earlier review corrected clipping in the static placement stage and a missed helmet-shell region. The animation stage corrected an elapsed-time closure bug before validation. The expanded stage replaced sparse threshold-only bust trim selection with bounded, visually inspected region assignments, and delivers native frame URLs alongside the JSON payload rather than exposing undelivered source identities. The ogre/halfling generation outputs required transparency corrections; originals and corrected sheets are both preserved.

The shared exporter now accepts an optional source-space fit reference. All animation frames use 362 source pixels so each pose does not independently expand to fill the canvas. Static exports retain their existing default. Both looping clips use stable anchors; fall anchors transition toward ground center. Source art remains generated raster artwork, not a claim of hand-authored pixels. Fine shading is quantized to the approved 16 shades; similar team colors deliberately blend. No remaining material rendering defect was observed in the captured proof. New roster artwork still requires its own visual review.

## Performance and size

Environment: Windows `10.0.26300`, AMD Ryzen 7 260 / Radeon 780M, Chrome `156.0.8078.80`, headless, Pixi WebGL. Repeatable command: `node browser-client/test/sprite-proof-full-ui.mjs`. Each comparison runs for ten seconds and reports its last 600 samples. These are local warm-path measurements, not device certification or GPU execution-time measurements.

| Measurement | 22 animated players | 22 accepted static players |
| --- | --- | --- |
| Scene update/render-call median | 0.20 ms | 0.20 ms |
| Scene update/render-call p95 | 0.40 ms | 0.40 ms |
| requestAnimationFrame interval median | 6.10 ms | 6.10 ms |
| requestAnimationFrame interval p95 | 6.30 ms | 6.30 ms |
| Recolored textures in measured movement scene | 24 | 0 |
| Recolored RGBA storage estimate | 466,944 bytes | 0 |
| Accepted fallback textures retained | 9 | 9 |

No repeatable warm-path stutter or growing texture inventory was observed. Thirty-two palette changes remained within the bound. Across all clips/directions, animation textures are bounded to 96 (48 images × two kit pairs), approximately 1,794,048 bytes of RGBA texels; palette/configuration change destroys the old textures. The nine static fallback textures add approximately 175,104 RGBA bytes. These estimates exclude JS arrays, canvas copies, GPU allocation overhead and browser memory. Full heap/GPU profiling and cold-load/device budgets remain production work.

Final raw/gzip sizes: static JSON 2,552,645 / 536,953 bytes; animation JSON 2,684,988 / 415,095 bytes; 48 delivered native PNGs total 282,648 bytes. The table and results JSON reflect the post-V1-retirement integration rerun. The verbose proof payload is suitable for inspection; broad-roster delivery needs explicit loading and compression budgets.

## Validation and artifacts

Post-integration validation: the single V2 product build passed, 471 browser tests passed (the lower count reflects upstream V1 test removal), both sprite browser review passes passed, and 30 asset tests/486 delivered files passed. Logs: `.tools/sprite-proof/merge-*`. The entries below record the earlier pre-integration run. Post-integration CI passed all four Java 21 state-test shards and target verification, static assets/unit tests/Hosting artifacts, static delivery, lifecycle, service, endpoint validation, security and CodeQL checks. [Validation run](https://github.com/the-grognard-codes/fumbbl-rebuild/actions/runs/41737450976). The workflow-dispatch full-browser job was intentionally skipped; both proof browser checks passed locally.

PR validation caught an omitted browser-inventory registration for the two new review harnesses. Both are now explicitly registered as standalone art/evidence capture tools, consistent with their local execution and canonical QA outputs; production browser shard coverage is unchanged. The validation/lifecycle tests were rerun after the fix.

- `npm.cmd --prefix browser-client run proof:sprites:check`: 11 focused tests and deterministic JSON export checks passed.
- `npm.cmd --prefix browser-client test`: 478 tests passed, zero skipped/failed.
- `npm.cmd --prefix browser-client run review:sprites`: original/static browser checks and initial animation checks passed, including mobile/reduced motion.
- `node browser-client/test/sprite-proof-full-ui.mjs`: all three designs, all frames, both projections/ends, mirroring, fallback, bust consumers, palette evidence, reduced motion, 22-player comparison and cache churn passed; no page/resource errors.
- `npm.cmd --prefix browser-client run assets:check`: 30 tests and 486 delivered files passed.
- Both browser builds passed; the diagnostic build retains its existing chunk-size warning.
- Deterministic PowerShell re-export of all three batches reproduced all native PNG hashes.
- Native build from the static stage: all five Maven modules passed, 976 tests reported (964 passed, 12 database/opt-in checks skipped). Java has not changed since that build; it was not repeated for browser/art changes. Log: `.tools/sprite-proof/server-build-user-context.log`.

Primary evidence: [full-proof QA](../../assets/game/proofs/shared-sprite-v1/qa/full-proof/), including all-frame captures, sheets, consumer views, projected scenes, results JSON and the successful browser video. Earlier checkpoints remain in `qa/sixteen-shade/`, `qa/helmet/` and [checkpoint history](../../assets/game/proofs/shared-sprite-v1/qa/checkpoint-outcome-history.md). Test/build logs are in `.tools/sprite-proof/final-*` and `full-*`.

## Remaining product work

This is a completed bounded feasibility proof, not production rollout. Android and Linux visual rendering were not tested; Linux CI validation passed. Full roster coverage, accepted-art promotion, persistent team colors, live builder wiring, production replay/reconnect/action routing and kit overrides remain separate. The roadmap remains sprite proof → team colors → Old World Classic stadium → core animations → expanded coverage. Broad production should follow the contract's per-design review gates and target-device budgets.

## Process retrospective

Explicit source maps and visual overlays caught selection gaps that pixel-invariance tests cannot detect. A shared source-space fit prevents per-frame scale pumping. Preserve generated source corrections and deterministic export records separately. Use `npm.cmd` on this Windows host; GitHub issue updates require the normal-user credential context as documented in the execution-environment guide. No global instruction changes were necessary.
