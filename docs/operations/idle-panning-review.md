# Reproducing idle pitch panning

Run with Node 26 from the checkout root:

```powershell
node browser-client/test/idle-panning-ui.mjs
```

This builds a production-mode fixture using the real match renderer, serves it on an ephemeral loopback port and closes the browser/server afterwards. It needs installed browser-client dependencies and Chrome or the configured Playwright Chromium executable. It makes no game-server connection and changes no matches.

The fixture contains 22 token players derived from existing public projections. It isolates camera behavior rather than native gameplay, sprite-heavy GPU cost or remote transport. Checks cover release stability, exact grid registration at 30/40/50/90 degrees, team-based card sides, and HUD measurement invalidation. Repeated drag/reversal measurements include dispatch, camera commit, rendering opportunities and frame intervals. The browser may coalesce input: counts of received and presented samples differ and must remain visible.

Results and a screenshot are written under `.tools/idle-panning/`. The default performs one measured-shape warm-up followed by three reported repetitions under fixed 4x CPU throttling. This is a stress workload, not a physical Android simulation. rAF and DOM observations do not measure physical display latency. The normal correctness test does not enforce a machine-independent timing ceiling. `--assert-latency` optionally enforces a 50 ms per-run p95 input-to-camera-commit ceiling for a declared reference workload; use it only with the relevant hardware and load recorded.

## Matched before/after measurements

Keep other builds/browser tests stopped while measuring. In PowerShell:

```powershell
$env:PAN_CPU_RATE = '1'
$env:PAN_REPEATS = '3'
$env:PAN_MODE = 'off'
$env:PAN_BASELINE = '1'
$env:PAN_BASELINE_REF = 'd430b9f36'
$env:PAN_OUTPUT = "$PWD/.tools/pan-before"
node browser-client/test/idle-panning-ui.mjs --report-only

Remove-Item Env:PAN_BASELINE
$env:PAN_OUTPUT = "$PWD/.tools/pan-after"
node browser-client/test/idle-panning-ui.mjs --report-only
```

Baseline mode builds the affected renderer/HUD modules from the named Git reference while keeping the same current fixture, measurement code, assets and diagnostics wrapper. It never changes source files or the working tree. It is a scoped comparison, not a claim that the entire artifact is the historical release. Each report records its bundle SHA-256, reference, browser, CPU, viewport, instrumentation mode and sample counts. `--report-only` retains baseline findings without stopping at expected correctness regressions; the normal command enforces those regressions.

Repeat after measurements with `PAN_MODE=counters` and `PAN_MODE=graph` when the diagnostics feature is available in the checkout. Its optional test adapter reports `unavailable` explicitly on a checkout without diagnostics. Repeat with `PAN_CPU_RATE=4` for the stress cohort; keep its statistics separate from the unthrottled cohort. `PAN_USE_BUNDLE` can reuse a previously built fixture bundle when a repeat must use identical code. Use a fresh output directory for each condition; builds do not recursively empty existing directories.

The outcome record is [the idle-panning implementation report](../specs/idle-panning-responsiveness-outcome.md). Retain original Chrome traces/video privately when following a real report. This harness complements those captures and does not replace manual validation on the affected device.
