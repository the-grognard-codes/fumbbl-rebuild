# Idle pitch panning: implementation outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/494
Date: 2026-11-07
Branch: `fix/idle-panning-latency`, isolated worktree `.tools/worktrees/idle-panning`, based on main `d430b9f36`. Scoped changes are also integrated into the original `feat/debug-performance-netgraph` checkout for combined validation and dev-local review. The user confirmed a noticeable improvement and authorized committing, PR publication, merge after successful CI, branch cleanup and dev-local shutdown on 2026-11-07. Residual stuttering remains documented below.

## Result and diagnosis

The real renderer now retains its 390 canonical grid cells in one fixed ground plane, using the same homography and lens clipping as pitch scenery. Camera travel updates the plane transform rather than reprojecting/reconciling all 390 cell polygons. Passing guidance remains React-owned and updates independently. The scene still clips to the viewport; lens clipping remains explicit, including the 30-degree near-plane boundary. Existing canonical hit testing, sprites, overlays and rules are preserved.

The user clarified that player cards must depend on team membership exclusively. Home cards now dock left and away cards right in live play and replay. Selected-player screen-position reporting, its HUD state and card anchor-based positioning have been removed. This also eliminates a camera-to-whole-HUD render feedback path.

Pitch-only child changes no longer cause history docking to read every HUD rectangle. Relevant HUD content/structure and actual observed bounds changes still trigger measurement. A focused regression changes irrelevant pitch content and expects zero rectangle reads, then changes measured HUD content and expects a docking measurement.

The matched baseline also reproduced a camera settling after release. The gesture end now synchronously commits its last received camera target on release, cancellation or capture loss. Continuous movement remains asynchronous; per-pointer synchronous rendering was tested and rejected because it starved painting. The bounded gesture-end use follows [React's flushSync guidance](https://react.dev/reference/react-dom/flushSync), which calls for sparing use. No extra animation-frame queue or stale camera callback survives the gesture.

## Reproduction and experiments

The initial two-player fixture did not reproduce the symptom and was rejected as too light. A crowded 22-token fixture with a selected player reliably exceeded the initial 50 ms camera-age stress signal. The test also exposed delayed release and irrelevant HUD measurement behavior. The final correctness command is:

```powershell
node browser-client/test/idle-panning-ui.mjs
```

The original source fails the pitch-only HUD invalidation check (15 rectangle reads versus expected zero). Report-only baseline runs also show post-release changes in two of three unthrottled repetitions; the fixed condition settles immediately in all three. These are behavior checks at the real rendering seam, rather than assertions mirroring a helper implementation.

Rejected experiments are retained privately under `.tools/pan-diagnosis/`: clipping-only shortcuts did not provide a consistent improvement; an rAF/flush approach did not sufficiently reduce age; per-pointer flush starved painting; changing projected polygon attributes imperatively did not improve the workload. The accepted plane keeps its source SVG size fixed and delegates viewport clipping to the existing scene, avoiding per-pan SVG resize/raster churn.

## Matched measurement results

Windows, Chrome 157.0.8103.38, AMD Ryzen 7 260 with Radeon 780M, 1440 x 900 CSS viewport, DPR 1. Same public-derived fixture, warm-up and 160 planned pointer moves/reversals over 1.6 seconds per repetition; three reported repetitions per condition. Other builds/browser suites were stopped during measurement. Baseline loads the affected modules from main `d430b9f36` while retaining the current diagnostics wrapper, fixture and measurement code. The original user video/trace are investigation evidence, not the before side of this synthetic comparison.

| Condition | Per-run p95 input to camera DOM commit | Per-run p95 rAF interval | HUD rectangle reads per run |
| --- | --- | --- | --- |
| Baseline, Off, unthrottled | 33.1 / 32.4 / 35.7 ms | 30.2 / 30.3 / 36.4 ms | 154 / 153 / 139 |
| Fixed, Off, unthrottled | 23.8 / 24.2 / 22.5 ms | 18.1 / 18.2 / 18.1 ms | 3 / 3 / 3 |
| Baseline, Off, 4x CPU stress | 157.4 / 252.3 / 182.5 ms | 145.5 / 133.6 / 133.5 ms | 109 / 109 / 94 |
| Fixed, Off, 4x CPU stress | 52.8 / 52.6 / 54.7 ms | 66.7 / 72.5 / 72.7 ms | 3 / 3 / 3 |
| Fixed, Counters, unthrottled | 21.1 / 24.2 / 23.0 ms | 18.1 / 23.9 / 18.2 ms | 3 / 3 / 3 |
| Fixed, Graph, unthrottled | 22.6 / 22.8 / 22.5 ms | 18.1 / 12.3 / 12.3 ms | 3 / 3 / 3 |

The unthrottled Off cohort has 100-110 received input samples per baseline run and 147-151 per fixed run. Under 4x stress, browser input coalescing reduces these to 28 versus 61-64. Those differences are reported rather than treating unobserved inputs as zero latency. Unthrottled input-to-rendering-opportunity p95 improved from 35.3-36.7 ms to 28.1-29.8 ms. Sampled rendered-camera age p95 improved from 34.9-37.3 ms to 28.9-32.7 ms; callback order makes this a conservative DOM/rAF observation, not a physical display measurement.

The fixed 4x stress cohort still exceeds the optional 50 ms commit ceiling and retains frame tails; it is not a flawless-smoothness claim. Counters/Graph showed no systematic added delay in this small unthrottled workload; the results do not prove zero collector overhead.

Maxima were retained as well as p95: worst commit/rAF interval across the three repetitions was 39.7/42.5 ms for the unthrottled baseline, 26.5/24.3 ms for fixed Off, 252.3/149.7 ms for the stressed baseline, 138.5/133.3 ms for stressed fixed Off, 29.9/24.8 ms for Counters, and 29.2/18.5 ms for Graph.

A later normal-Windows-account comparison repeated three runs per condition on the final behavior. Baseline commit p95 was 28.3/28.5/26.9 ms versus 17.4/17.6/18.6 ms fixed. Worst commit improved from 36.5 to 21.5 ms; worst rAF interval from 30.3 to 13.1 ms. Received-input counts were 136/135/143 baseline versus 145/154/152 fixed. One baseline release changed camera position after the first sampled release frame; every fixed release was stable. Evidence: `.tools/pan-diagnosis/owner-baseline-1x/` and `owner-fixed-1x/`, bundle hashes `376f1a7a626a617ed88660c7718ebadc61b24013f6fb8aab73325c161c5b6899` and `7346d87272bcb2928c47ad3b2dc91d7ed7a237bb4cefd30e005efeb0aba796a0`.

An additional final smoke run passed its 50 ms commit-p95 assertion (19.5 ms) but recorded 414.5 ms and 2,169.4 ms rAF intervals after the last input/release. The last input committed after 4.3 ms, while its sampled rendering opportunity arrived after 402.3 ms; active-drag camera age never exceeded 46.3 ms. This is an unexplained post-release scheduling outlier, not evidence that physical presentation was prompt. It did not recur in the three subsequent normal-account fixed runs above. The raw smoke report is retained rather than discarded; if this recurs manually, capture a focused release trace to distinguish main-thread, compositor and system scheduling. Overall stutter elimination is not claimed.

Evidence: `.tools/pan-diagnosis/matched-summary.json` and each condition's `report.json`, bundle and screenshot. Baseline bundle SHA-256: `ba19e53957975659385f622403a6e4fffeb5a6560bac154c2088bcff0d822fc4`; fixed bundle: `e8a32dc0f8cde458a941af08aaed4600440fcf18144fa72ca739f81c7036a7fb`. Reports record all values and counts independently.

## Review and validation

- Self-review covered lens/viewport clipping, SVG layer ordering, guidance updates, canonical hit testing, card side consistency, HUD observer rebinding, release/cancel/capture-loss behavior, cleanup and preservation of the existing diagnostics work.
- Focused projection suite: 15 passed, including retained-plane near clipping and existing camera round trips/registration.
- Isolated panning branch: 503 browser units passed; typecheck and production build passed. Focused projected-pitch, coach-HUD, movement-range, pass-range and camera-perspective browser suites passed.
- The new production-mode panning regression checks exact browser-rendered cell bounds against the camera at 30/40/50/90 degrees, final target alignment, immediate release stability, both team card sides and relevant/irrelevant HUD invalidation. It is registered in the mandatory interaction manifest.
- Combined diagnostics checkout: all 518 browser units passed, zero failures/skips. All 69 mandatory interaction suites and 12 hosted suites passed; aggregate coverage and commit identity were validated from `.tools/validation/local-browser-Hy6sRo/`. The initial attempt stopped on the new replay-card placement assertion: the shared popover inset reset overrode the generic docking selector. Added explicit popover specificity, passed the focused check, reran interaction shard 3, and completed shard 4/hosted. Previously passed shards 1/2 were retained; no failure was treated as a pass.
- Final focused checks also passed: both-end/angle grid registration, actual camera excursion, immediate release, cancellation/capture loss, live/replay team docking and the optional unthrottled 50 ms commit-p95 gate. The Sidestep test now reads the camera transform rather than static canonical cell points and passed separately. Five browser tooling tests passed. These focused checks cover late test refinements after the aggregate run.
- Final local assembly passed TypeScript and production/site builds. No Java/server behavior changed. The prior diagnostics clean Maven build remains the server evidence; current server/database health, computer-coach readiness, routes and served frontend hashes passed.

The design hook reported four pre-existing Alegreya/Barlow declarations in unchanged portions of live-pitch CSS. Two exact font-and-file exceptions in `.impeccable/config.json` preserve those legacy declarations under the approved requirement to retain existing MUTP styling; no broad rule or file ignore was added. No typography was changed. Added CSS positions the retained plane and supplies team-side card docking outside the live HUD, including replay. Before/after pitch screenshots preserve the existing geometry/colors and the requested team-based card placement.

## Manual validation and remaining limits

The benchmark uses token players and no native engine/socket. It does not establish sprite-heavy GPU behavior, physical display latency, Linux performance or physical Android/tablet acceptance. Fresh manual panning on the user's affected device remains the acceptance step; no additional capture is required before trying the build. Server action latency remains a separate investigation.

Dev-local is running at **http://localhost:5000/play** with the updated frontend. Reload the existing match tab for manual pan/reversal/stop and card checks. The managed diagnostics checkout remains the serving root; no backend restart or match mutation was needed. Served JS SHA-256 is `f91312113eef5402ff8e2f51eac43df6c0cd8fe7fc7f150de5d8d02629f956d2`; CSS is `51c5e08ff76ab2e290eafe95ac2f0886e14cb37e99d40d4e8d21515de01a05c7`. `.tools/debug-performance/ready.json` records health/hash verification. A fresh anonymous browser correctly reached the sign-in gate and imported the actual served game module without uncaught errors (`.tools/pan-diagnosis/served-ui.json`); this does not substitute for authenticated manual match validation.

No remote deployment, commit, push, PR, merge, parent-issue change or issue closure has been performed. Issue #494 remains open for user validation.

## Process notes

- A realistic crowded fixture and a selected player were necessary to expose the camera/HUD feedback cost; a quiet two-player fixture was insufficient.
- Retained geometry requires tests to inspect the resulting transform/browser bounds, not assume projected coordinates are stored in every cell attribute.
- Card tests must include a context outside the live HUD to catch popover specificity and replay placement, and camera tests must respect intentional top-down orientation invariance.
- Compare like workloads, preserve maxima and failed/outlier runs, and record execution context. The normal-account follow-up was added after an isolated frame pause rather than hiding it behind p95.
