# Debug performance diagnostics: implementation outcome

Parent: [#483](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/483). Slices: [#484 client metrics](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/484), [#485 overlay and environment policy](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/485), [#486 server timing](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/486).

Branch: `feat/debug-performance-netgraph`, based on `d430b9f36`. Implementation date: 2026-11-07. The user accepted the result and authorized committing, opening a PR, merging after successful CI, branch cleanup and dev-local shutdown on 2026-11-07. Remote deployment remains outside this delivery.

## Delivered behavior

| Approved requirement | Implementation and evidence |
| --- | --- |
| PROD-hidden Debug | Deployment environment flows from site configuration through the play mount. DEV/local-dev expose Debug; PROD/unknown environments fail closed and create no collector. Covers coaching, spectating and replay; the spectator lobby itself has no match Debug UI. Browser assertions cover production and unknown environments even under the development test server. |
| Independent controls | Off/Counters/Graph, frame/network/latency/presentation tracks, 10/30/60-second history, target/custom frame budget, latency warning, automatic/fixed axes, corners, size, text scale, opacity, warning-only display, freeze and optional probes. Display preferences persist; collection starts Off each page session. |
| Frame pacing | rAF FPS estimate, latest/p50/p95/max intervals, budget/50/100 ms stall counts, optional Long Tasks/Long Animation Frames and graph markers. Per-bucket maxima preserve spikes. Renderer cadence and physical display latency remain explicitly unavailable. |
| Network and latency | UTF-8 gameplay payload bytes/messages, cumulative counters, outgoing buffered bytes, request count/oldest captured age, connection/gap markers and application RTT by category/type. Oldest age is unavailable when a request predates capture. Optional idle probes are separate and bounded. |
| Server work | Authenticated configure negotiation, DEV/local server policy, optional seven-field queue/handling/phase durations at reply enqueue, and at-most-one-per-second non-mutating probes. Normal response envelopes stay unchanged. Unsupported negotiation and invalid optional telemetry do not disrupt gameplay. |
| Presentation | Pending-feedback and provisional-feedback opportunities are separate from authoritative presentation. First committed board/announcement/dice revision is observed separately from fully presented revision and backlog. Missing transcript timing remains unavailable. These are rAF opportunities, not physical display measurements. |
| Graphs and inspection | Aligned chronological bar tracks with separate units/scales, distribution histograms, threshold lines, labelled unavailable/empty data, pause/resume, repeated freeze rearming, pointer/touch handlers, keyboard history slider and incident marking. Marking a frozen incident preserves its captured samples. |
| Bounded private export | Explicit versioned JSON download, numeric samples and capture-local serials, allowlisted metadata, no wire payloads or account/match/player/request identifiers. Capped rings/maps, 60-second history and 2 MiB export limit; high-rate overflow reports drops. |
| Lifecycle/accessibility | Off tears down active diagnostic sampling/listeners/observers. Hidden tabs reset frame baselines and suspend probes; reconnect/context changes invalidate correlations. Reduced-motion/manual refresh, text alternatives and immediate Off are present. Only explicit controls and graph inspection intercept input. |

## Review and fixes

Self-review and independent review addressed repeated freeze rearming, blanket inspection hit-testing, frozen evidence replacement, optional-envelope version validation, and the distinction between queued dice and committed visible dice. Observability refs do not alter beat timers, rules, mutation/retry handling or authoritative state. Normal reply validation remains strict.

Browser preflight exposed test harnesses relying on an implicit environment; their mounts now explicitly select DEV. A diagnostic UI test now establishes its first rAF baseline before injecting a controlled stall, avoiding an initialization race under parallel validation. The first startup preflight also caught a TypeScript literal-inference error, which was corrected before successful focused checking.

The independent visual review scored its four original findings resolved; the follow-up first-beat finding was also resolved. Desktop, tablet and compact captures preserve the established MUTP typography, palette, frames and visible Off action. No art assets or design-system rules changed. Existing DESIGN.md/sidecar drift was retained rather than repaired without a request.

## Validation

| Check | Result |
| --- | --- |
| Focused diagnostic unit/protocol tests | 15 passed, zero skips/failures. Includes caps, UTF-8, immutable frozen traffic buckets, correlation lifecycle, malformed/V1 optional telemetry, rapid toggles and first-beat versus completed revision. |
| Complete browser unit suite | 517 passed, zero skips/failures on the final collector. |
| Site unit suite | 12 passed, zero skips/failures. |
| TypeScript and production site/client build | Passed. Mandatory dev-local preflight rebuilds the final working files. |
| Focused server tests | 108 passed across 11 timing, protocol, publication, transport, delivery and policy selectors. |
| Pinned clean Maven install | Passed in 15m42s: common 17 tests, server 678 tests (5 gated skips), native state tests 288 (7 gated skips). Zero failures/errors. All four Java modules built successfully. |
| Focused browser interactions | Passed: new diagnostics suite, representative reroll paths, V2 renderer lifecycle/assets/teardown and both-coach pass workflow. |
| Mandatory full browser preflight | Passed: 68 interaction suites across four shards and 12 hosted suites, zero failures/skips, 741.6 seconds. Coverage: `.tools/validation/local-browser-JbWtoK/`. |
| Dev-local startup/readiness | Passed. Server/database healthy, proxy initial connection and reconnect verified against the real Java auth gate, computer player ready. `/play`, `/teambuilder` and `/spectate` return 200; local-dev configuration and served JS/CSS hashes match the current working-file artifact. Renewed ADC readiness: OK. |
| Diff whitespace | Passed. |
| Browser validation orchestration | Five focused tooling tests passed, including fresh coverage, stale/missing report rejection and failed-worker teardown. |
| Focused native diagnostics | Passed on the shipping local-dev artifact, two existing acceptance coaches and one authorized UI End Turn action: negotiation, mutation RTT, seven server durations, bounded private JSON export and Off teardown. |

Commands and logs live under `.tools/debug-performance/`: `browser-units-final.log`, `site-units.log`, `maven-clean-install.log`, `diagnostics-ui-final.log`, `dev-local-start.log`, and `evidence/`. Full browser coverage reports use the repository's `.tools/validation/local-browser-*` directories. These are local artifacts, not public telemetry uploads.

The final frozen-traffic immutability correction followed the full browser preflight. Its 15 focused tests, the full 517 browser unit tests, the focused UI suite and a fresh production artifact assembly passed afterward. Served hashes and the native diagnostic check verify that final artifact. A generated formation-test screenshot was restored; no unrelated art change is part of this feature.

Native capture: `.tools/debug-performance/native-focused/diagnostics-capture.json`, screenshot `diagnostics-overlay.png`, and `result.json`. The single observed End Turn measured 750.8 ms application RTT, 41.5 ms server queue wait and 692.2 ms server handling. These are one correlated observation, not a distribution or evidence for one-way network latency. Timing and frame/presentation data reached the actual overlay and exported without the test match/account/token identifiers.

The broader standalone native acceptance driver exposed an existing spectator setup failure before diagnostics were enabled: actor-only `savedFormations` are included in spectator broadcasts and rejected by the strict client as `Invalid saved formation controls`, causing unavailable-view reloads. Tracked separately as [#487](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/487). Its temporary harness adaptations were reverted; the focused diagnostic smoke uses two coaches and makes no spectator/full-match acceptance claim. This failure does not invalidate the successful startup or the explicitly scoped diagnostics checks, but spectator setup remains an outstanding regression.

## Measured overhead and limits

Ran three alternating Off/Counters/Graph segments on Windows, headless Chrome, a 1440×900 viewport, real match components and a synthetic steady payload/read workload, with other builds/test suites stopped. This measures client overhead; it is not a native-gameplay or real-network RTT comparison.

| Mode | Per-run p95 rAF interval | p95 collector/snapshot work | p95 React development-profiler render |
| --- | --- | --- | --- |
| Off | 8.2 / 8.4 / 8.2 ms | No active collector | No diagnostic render |
| Counters | 8.4 / 8.3 / 8.1 ms | Approximately 0.1 ms | 1.4 / 1.3 / 1.6 ms |
| Graph | 8.4 / 8.4 / 8.3 ms | Approximately 0.1 ms | 2.1 / 2.1 / 1.9 ms |

No segment contained a frame interval above 50 ms. Paired p95 frame changes were below 5%. Replacing per-bar SVG nodes with bounded paths reduced graph rendering from approximately 3.4–3.7 ms to 1.9–2.1 ms in the development profiler. The proposed <1 ms refresh-render budget is **not demonstrated by this development-profile result**; the shipping build and physical-device workload require further measurement. Raw runs and the pre-optimization comparison are in `.tools/debug-performance/profile/`; reproduce with `node browser-client/test/performance-diagnostics-profile.mjs` when other builds/tests are stopped.

Server phase spans overlap; they must not be added or subtracted from unsynchronized clocks to invent one-way network delay. Timing may be omitted under outbound pressure and for request families outside the existing timing allowlist. Browser rAF and optional performance APIs cannot prove physical display latency, TCP loss/choke or renderer cadence.

Physical Android performance, Linux browser smoke/performance and native action-RTT Off/On comparisons remain explicit acceptance gaps. Desktop/touch layout captures and emulation do not substitute for actual device evidence. The feature exposes evidence for diagnosing stuttering; it does not assert that the underlying stuttering is fixed.

## Manual validation handoff

Once readiness is confirmed below, open `http://localhost:5000/play`, enter a match and choose Debug → Performance & Network. Select Counters or Graph; close the drawer while leaving the overlay active. Reproduce a delay, Pause or freeze on a threshold, inspect history, mark the incident and Export JSON. Collection resets to Off after a new page session. PROD must have no Debug menu.

Dev-local is started and left running at **http://localhost:5000/play**, serving this branch's working files. Server/database/proxy/computer readiness and exact served artifact hashes are recorded in `.tools/debug-performance/ready.json`. No remote deployment, staging, commit or push was performed. Parent and implementation slices remain open for manual acceptance; #487 separately tracks spectator setup.

## Process observations

- When an environment gate intentionally fails closed, test mounts must explicitly supply DEV; never relax PROD/unknown policy to satisfy old harness defaults.
- Establish a live rAF baseline before injecting a stall in parallel browser tests. A stall before the first sample has no prior interval to measure.
- Keep first visible beat, fully presented revision, and pending/provisional feedback distinct. A queued dice beat is not a visible commit.
- Profile with builds stopped, then separate synthetic collector/UI overhead from native protocol checks and physical-device acceptance.
