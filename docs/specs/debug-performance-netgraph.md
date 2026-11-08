# Feature: Debug performance and network diagnostics overlay

Tracking: [GitHub #483](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/483). Approved for implementation on 2026-11-07. Branch: `feat/debug-performance-netgraph`, based on `d430b9f36`.

Implementation slices: [#484 client collection](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/484), [#485 overlay and environment policy](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/485), [#486 server durations and probes](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/486).

## Abstract

Add a Performance & Network group to the existing match Debug drawer, with independently selectable frame-rate, frame-time, network I/O, request-latency and presentation-delay diagnostics. Provide a compact counter and a configurable scrolling graph inspired by Half-Life / Counter-Strike net graphs, plus bounded captures that users can attach to stuttering reports.

## Objective

Make intermittent stuttering and delayed feedback observable during ordinary play. Let a player or developer correlate a hitch with browser scheduling, request/response delay, measured server work, transcript availability or presentation backlog without opening developer tools. This feature supplies evidence for performance fixes; it does not by itself resolve the underlying stalls.

## Context / Existing Behavior

- Stuttering and frame-rate delay remain a significant user-reported problem.
- `browser-client/src/GameView.tsx` has a match Debug drawer containing camera controls, setup placement, server actions and movement-plan details, but no live performance graph.
- Browser V2 uses a single WebSocket and correlated request IDs in `browser-client/src/v2-client.ts`. `use-pitch-playback.ts` separately tracks received and presented state, ordered playback and missing-transcript synchronization.
- [#326](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/326) produced test-only browser instrumentation (`browser-client/test/gameplay-performance-observer.mjs`) and opt-in server spans (`BrowserRequestTiming`). These are useful foundations, but are not an ordinary player's debug-menu interface.
- The [2026-10-21 foreground trace](smooth-gameplay-foreground-trace.md) documented both substantial server request costs and browser frame gaps. These are historical measurements, not a fresh diagnosis of the current build.
- Related work: [#324](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/324), [#332](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/332), [#333](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/333), and latency follow-ups [#336](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/336), [#337](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/337), [#338](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/338). This request adds reusable in-game observability and does not duplicate those optimization tasks.
- Research: [net-graph examples and browser measurement limits](../research/netgraph-diagnostics-2026-11-07.md). Valve's Source SDK calls the comparable display `net_graph`; retain the user's `cl_netgraph` / Half-Life / Counter-Strike search context in the research record.

## In Scope

- Debug-menu controls, compact readout and expanded scrolling bar graph with aligned tracks.
- Rendering/scheduling, V2 gameplay payload traffic, application request latency, safe server-duration breakdowns and local presentation delay.
- Configurable history, thresholds and display; pause/inspect, incident markers, reset and explicit local export.
- Bounded opt-in instrumentation, capability detection and backward-compatible server timing support.
- Live coaching and spectating; local rendering/presentation diagnostics during replay, with network-only metrics marked unavailable when there is no live connection.

## Out of Scope

- Fixing rendering, networking, persistence or animation performance as part of this request; use captures to scope subsequent fixes.
- Rules changes, prediction of outcomes, changes to game pacing, weakened durability/authorization, or recovery/replay format changes.
- A server administration dashboard, global user telemetry, automatic uploads, external analytics services or permanent trace storage.
- Claims of physical display latency, raw wire bandwidth, packet loss/choke, one-way network latency or automatic proof of a bottleneck from a single graph.
- A new public diagnostics endpoint, deployment, or revival of the retired V1 runtime.

## Functional Requirements

1. **Debug controls.** Hide the entire Debug menu, drawer and diagnostics overlay in PROD; expose them only in DEV and dev-local using explicit deployment configuration, with unknown environments failing closed. Apply this to live coaching, spectating and replay. Add a clearly labelled Performance & Network group. Default to Off; offer Counters and Graph modes, plus optional display only when configured thresholds are exceeded while collection is enabled. Allow independent tracks, a compact preset and an expanded preset. Closing the drawer leaves an enabled overlay visible; turning diagnostics Off stops collection. Retain display preferences locally, but start collection Off for each new page session.

2. **Frame pacing.** Show recent FPS, latest frame interval, rolling p50/p95/max frame interval and counts above configurable budgets, including 50 ms and 100 ms stall counts. Keep individual frame spikes visible within graph buckets rather than averaging them away. Label requestAnimationFrame cadence as a browser scheduling/paint-opportunity estimate. If renderer-frame cadence is available, label it separately; do not imply that rAF frequency proves the pitch rendered or a frame reached the physical display. Offer 30/60/120 FPS budget presets and a custom frame budget; identify the selected budget as a user setting, not detected monitor refresh.

3. **Network I/O.** Show incoming/outgoing UTF-8 application payload bytes per second, messages per second, cumulative payload bytes since reset, outgoing `WebSocket.bufferedAmount`, pending request count and oldest pending request age. Account for authentication, retries, unsolicited pushes and errors without retaining message contents. Label the scope as the V2 gameplay connection and payload bytes, excluding TLS/TCP/WebSocket overhead, compression effects and HTTP asset traffic. Show connection state, reconnect markers and elapsed time since last message; an idle connection alone must not be labelled unhealthy.

4. **Client/server latency.** Measure send-to-correlated-response duration by request type, separating gameplay mutations, advisory reads and errors. Show latest/p50/p95/max and sample counts; pending requests remain pending, with age, rather than becoming zero-latency samples. Label this application round-trip time: it includes server processing and browser dispatch delay. Provide an optional small, authenticated application echo probe for idle periods, at most one per second and one outstanding, with a five-second timeout, disabled by default and suspended when hidden/disconnected or gameplay work is pending. It must not poll game state, mutate a match or bypass transport limits. Label probe RTT separately from action RTT and show probe timeouts without treating them as packet-loss measurements. Expiring diagnostic correlations must never expire or retry a gameplay request.

5. **Server durations.** Reuse existing queue/authorization/session-apply/checkpoint/publication timing concepts. Add an explicit opt-in, capability-negotiated way to return bounded, allowlisted durations for the caller's own correlated requests. Show queue wait and handling duration, with available phase details such as authorization, recovery serialization and durable storage. Define each timing boundary; nested spans are not additive, and phases completed after acknowledgement must not be presented as wholly inside that request's RTT. When timing is disabled, unsupported or absent, show Unavailable. Preserve normal operation against servers without this capability and strict V2 validation. Do not subtract unsynchronized client/server wall clocks or label RTT minus measured server work as pure network latency.

6. **Presentation and client stalls.** Where correlation is valid, show input-to-pending-feedback, response-to-required-transcript, required-data-to-first-presentation-opportunity and input-to-presentation-opportunity durations. Distinguish provisional feedback from authoritative presentation. Show received versus presented revision, backlog count/oldest age, synchronization waits and active animation/announcement state. Feature-detect long-task / long-animation-frame APIs and show duration markers where available; unsupported signals are explicitly unavailable. Do not add their overlapping durations together. Mark intentional playback waits separately from measured browser scheduling gaps; correlation suggests an investigation, not a proven cause.

7. **Graph and inspection options.** Use synchronized scrolling bar tracks for frame time, RTT, payload rate and presentation delay, each with units and its own scale. Offer 10/30/60-second windows, independent track toggles, fixed or automatic vertical scaling, visible threshold lines, corner placement, size/text scale and background opacity. Automatic scales must remain labelled and show clipped peaks. Keep zero activity, absent samples, pending responses and disconnected intervals visually distinct; do not interpolate missing latency samples. Provide Pause/Resume, freeze-on-threshold, hover/tap/keyboard inspection, a manual incident marker and Clear. A frozen display retains a bounded snapshot while live collection remains bounded; resume returns to the current window. Include a latency/frame-time distribution histogram for the selected window, alongside the scrolling history, with sample counts and labelled bins.

8. **Capture and export.** Let the user explicitly download a versioned JSON capture containing only allowlisted numeric timing samples, categories, thresholds, connection/visibility markers and coarse environment metadata (build, browser, viewport, pixel ratio, rendering mode, reduced-motion and replay speed). Include metric definitions and unavailable signals. Keep credentials, authentication payloads, URLs/query strings, account/match/player identifiers, chat, rosters and game state out of captures. Use capture-local correlation identifiers instead of exported request IDs. No automatic upload. Freeze/export must work after disconnect; reset removes retained samples and counters.

9. **Low overhead and lifecycle.** Use capped ring buffers and bounded request-correlation maps; cap capture history at 60 seconds and export size at 2 MiB. Define per-track sample caps and record dropped-sample counts on overflow. Sampling must not cause full-match React updates every frame, duplicate JSON parsing, layout measurement loops or synchronous console/storage writes. Aggregate display updates at no more than 4 Hz; retain cheap per-frame timing sufficient to expose spikes. Off removes diagnostic timers, observers, listeners and probe traffic; hidden tabs pause active sampling/probes, mark a history gap and reset frame baselines on return. Avoid duplicate collectors across drawer reopen, reconnect, remount or match/replay changes. Diagnostics failures must not interrupt gameplay or alter request/retry semantics.

10. **Usability.** Preserve MUTP styling and existing Debug functions. The overlay must stay readable at supported desktop/tablet sizes, avoid blocking mandatory decisions and pitch input, and offer an immediate hide/off control. Only explicit controls/inspection capture input. Provide text/numeric alternatives, a legend, keyboard access and touch inspection; convey thresholds through more than color. Do not announce each changing number through a screen reader live region. Respect reduced motion by offering a frozen/manual-refresh graph view.

## Acceptance Criteria

- A player can enable independent FPS/frame-time, network and latency options from Debug, close the drawer, reproduce a hitch, freeze the graph and export a bounded capture without developer tools.
- Deterministic frame sequences, non-ASCII payloads, retries/pushes/errors and controlled request delays produce correct counts, units, percentiles and correlations. Empty windows show no samples, and missing/server-unsupported data never appears as zero.
- A controlled browser stall produces a frame-time spike and supported long-task marker; a delayed response produces elevated request RTT; delayed transcript/presentation produces its own wait/backlog signal. Each remains separately observable, including when they coincide.
- Server queue/processing durations correlate only to authorized requests from that connection. Negotiation failure falls back safely; absent or malformed optional telemetry cannot strand gameplay. Nested or post-ack spans cannot inflate an invented network-delay total.
- Time-window/scale/track controls, histogram, inspection, freeze, incident marker, reset and export work on desktop and touch layouts. Mandatory decisions and existing camera/setup controls remain usable.
- Hidden-tab, reconnect, retry, rejection, replay seek, match switch and repeated enable/disable tests show no false huge frame stall, cross-match correlation, leaked collectors or unbounded memory. Off sends no diagnostic probes.
- An extended synthetic high-message-rate capture respects every sample/map/byte cap and reports overflow. Export privacy checks reject non-allowlisted fields and identifiable payloads.
- Record paired diagnostics-Off / Counters / Graph foreground traces on the same build, hardware and workload, with at least three alternating runs per mode. Proposed acceptance budget: no diagnostics-attributable task over 50 ms, p95 sampler/aggregation/draw cost below 1 ms per display refresh, and no more than 5% worsening of p95 frame interval or action RTT beyond measured run-to-run variation. Report raw results and variability; tune or reduce collection if the budget is missed rather than masking spikes.
- Verify real Windows desktop and physical Android tablet behavior/overhead; complete Linux browser smoke and theme/layout checks. Emulation may verify layout and capability fallbacks but does not satisfy physical-device performance evidence. Record unavailable hardware checks explicitly.

## Constraints

- Browser V2 is the sole runtime and BB2025 is the only ruleset. Preserve authoritative game behavior, checkpoint-before-ack durability, authorization, exact-intent retry, and shared replay/recovery compatibility.
- Support existing themes on Android, Windows and Linux. Preserve MUTP colors, typography and styles; reuse the Debug drawer and UI scaffolding.
- Create a new working branch for implementation. Preserve unrelated working-tree changes and follow repository conventions.
- Prefer instance-based services for diagnostic collection and server instrumentation. Avoid global WebSocket monkey-patching in the shipping client.
- Implementation, validation, issue updates and a started, ready dev-local instance are authorized. Do not commit, push, open a PR, merge or deploy remotely unless explicitly requested.

## Implementation Guidance

- Start with the existing test observer's measurement definitions, not its test-only global interception and DOM-scanning mechanism. Integrate low-cost hooks at V2 send/receive, transcript availability, playback transitions and renderer scheduling boundaries.
- Use a single bounded diagnostic service feeding a lightweight overlay and capture snapshot. Keep metric collection, aggregation and presentation separable enough to validate with deterministic clocks and socket fixtures.
- Reuse `BrowserRequestTiming`, `BrowserMatchTransport` and delivery metrics where appropriate. Existing server timing logs are not automatically available to browsers; design and test the optional protocol contract explicitly, including authentication and overload behavior.
- Valve reference patterns: compact text versus expanded graph modes, configurable position/text scale, labelled network tracks and threshold-triggered visibility. Adapt the presentation to browser metrics rather than copying engine-specific loss/choke/interpolation counters. See the linked research for primary sources.
- Primary references: [Valve Source SDK net graph](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/client/vgui_netgraphpanel.cpp), [Valve Source2 Telemetry HUD](https://help.steampowered.com/en/faqs/view/5E6F-5B36-5485-F6B9), and [WHATWG WebSocket API and buffering](https://websockets.spec.whatwg.org/#the-websocket-interface).
- Suggested implementation order: bounded client collection and counters; aligned graph/inspection/export; negotiated server durations and optional echo; measured overhead and live/replay/recovery acceptance. Keep any later performance fixes separately scoped.

## Validation

- Add focused unit tests for statistics, time buckets, histogram bins, payload-byte accounting, correlation/timeout/overflow, pause/reset and export privacy. Extend V2 fake-socket and playback tests for unsolicited data, late responses and reconnect.
- Extend browser interaction coverage for Debug controls, graph lifecycle, keyboard/touch inspection, reduced motion, unsupported APIs and non-obstructed mandatory decisions. Inspect desktop and compact tablet layouts.
- Add focused Java protocol/transport/timing tests for negotiated telemetry, auth boundaries, malformed input, rate limits, bounded responses and old-client/server compatibility. Protect existing recovery, transcript and exact-retry contracts.
- Run focused checks first, followed by browser unit/interaction checks and production build, and relevant Java/server tests and build through the pinned project toolchain. Complete repository-required unit, browser and game-server build checks after implementation.
- Capture controlled main-thread, response, queue and presentation delays separately, then run native foreground comparisons with no concurrent builds/test suites. Record environment, sample counts and API limitations with the captures.

## Completion Notes

- Status: implemented and validated; [implementation outcome and manual acceptance gaps](debug-performance-netgraph-outcome.md) record the evidence. Dev-local is running for manual validation.
- Keep this local mirror aligned with the GitHub issue and record implementation evidence, exact validation commands, overhead comparisons and remaining physical-device gaps in an adjacent outcome report.
- Resolve validation failures through diagnosis until fixed or a concrete dependency requires user input. Do not treat this observability feature as acceptance that the reported stuttering itself is solved.
