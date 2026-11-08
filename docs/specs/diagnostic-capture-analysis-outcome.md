# Diagnostic capture review: implementation outcome

Issue: [#488](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/488), follow-up to [#483](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/483). Implemented 2026-11-07 on `feat/debug-performance-netgraph`. Delivered with the diagnostics and panning work. The user authorized PR publication and merge after successful CI on 2026-11-07; remote deployment remains outside this delivery.

## Delivered

- `tools/diagnostics/analyze-capture.mjs` accepts one or more exported version-1 JSON captures and emits a bounded Markdown review, with optional structured JSON.
- The reusable analysis module groups capture-local traces, significant frame-gap bursts, sustained cadence pressure and nearby markers. It reports metric counts/percentiles, traffic, snapshot context, unavailable data, quality notes and explicit omissions.
- Fixed review targets distinguish server queue/handling, application RTT, local feedback/transcript/presentation waits, and total input-to-presentation latency. A slow end-to-end total does not by itself flag a local presentation problem. Correlation is not presented as a proven cause.
- Untrusted free text, arbitrary fields, filenames, paths and embedded instructions are excluded from reports and errors. Reports use ordinal/hash capture identities and allowlisted numeric evidence.
- Inputs are bounded to 16 files of 2 MiB each and exporter sample caps. Default/max incidents are 10/25 per capture; Markdown/JSON are bounded to 32/128 KiB. Truncation is explicit. Output creation is exclusive by default; `--force` can replace reports, but canonical paths, links and file identities protect source captures.
- [The operator guide](../operations/diagnostic-capture-review.md) covers commands, thresholds, output format, review workflow, chat handoff and interpretation limits.
- Support has a new **Stuttering & delays** topic and **Report stuttering or delays** section. It links the DEV client, explains the rolling window and Pause/Export JSON, and gives `support@thegrognardcodes.org` for user-sent attachments. Existing general contact information is unchanged.

## Practical invocation

```powershell
node tools/diagnostics/analyze-capture.mjs capture.json --output review.md --json review.json
```

Paste `review.md` into the follow-up chat with a short description of the symptom. Keep the original capture locally for targeted follow-up; there is no need to paste its complete sample array. The analyzer neither uploads files nor sends email.

## Real-capture proof

The existing native export contained **454 samples**: 438 frame intervals and 16 other measurements. The analyzer reduced it to **four ranked incident groups**, with a **5,566-byte Markdown** report and **5,691-byte JSON** report. Output is in `.tools/capture-analysis/native-review.md` and `.json`.

The main trace reports 750.8 ms application RTT, 692.184 ms server handling and 41.47 ms queue wait, with local pending feedback at 18.7 ms and presentation opportunity at 52 ms. It flags slow application/server/end-to-end timing, while retaining the normal local timings as context. Nearby frame gaps remain labelled correlation. This is one observed request, not a latency distribution or causal diagnosis.

The report also distinguishes normal exporter input ordering from suspected corruption: frames precede other measurements in the source array, so chronological normalization is expected. Server phase durations are not added together or positioned on the client clock.

## Validation and review

| Check | Result |
| --- | --- |
| Analyzer/module and CLI tests | 15 passed, zero failures/skips. Covers malformed/unsupported/oversized files, thresholds, bursts, sustained pressure, trace association, independent clocks, missing values, traffic rates, hostile/private fields, output limits and file-overwrite aliases. |
| Actual exported capture | Both output formats generated successfully and inspected; four groups from 454 samples. |
| Site production/client build | Passed. |
| Site unit suite | 12 passed, zero failures/skips. |
| Site static check | Passed: 25 public-site inputs and 191 PR updates. |
| Support browser test | Passed keyboard topic navigation, touch, no-JavaScript access, exact DEV/mailto destinations and 320–1440px layout checks. |
| Visual review | Desktop/mobile section captures reviewed; existing typography, panel layout and contact information preserved. Independent review returned no material findings. |
| Analyzer security/semantics review | No material findings. Follow-up self-review separated end-to-end latency from local wait classification and added a regression. |
| Local artifact/readiness | Local-dev artifact rebuilt. Healthy server/database/proxy/computer state and served support instructions verified; existing stack left running at `http://localhost:5000/play`. |
| Diff check | Passed. |

Commands: `node --test tools/test/capture-analysis.test.mjs`, `npm.cmd --prefix site test`, `npm.cmd run check --prefix site`, `npm.cmd run build --prefix site`, `node --test site/test/support-browser.test.mjs`, and `node deployment/firebase/scripts/assemble.mjs --environment local-dev`. Local logs are under `.tools/capture-analysis/`; section captures are under `test-output/support-page/`.

No Java, game protocol, live collector, capture-window or recording behavior changed in this follow-up. The previous passing server/native validation remains applicable; unrelated Java suites were not repeated.

## Limits and handoff

- Findings are heuristic review candidates. Retained-window coverage, sparse samples, deliberate playback waits and missing server data limit conclusions.
- Files have independent monotonic clocks. The analyzer intentionally does not merge separate timelines or claim that an absence of findings disproves a problem outside the retained window.
- Concurrent hostile filesystem replacement, disk-full behavior and every platform filesystem were not exhaustively exercised. Focused tests cover ordinary canonical-path, symlink and hardlink protection on the validation host.
- The support content is implemented and served locally. **Remote DEV has not been published by this work**; the public instructions should ship alongside the diagnostics feature through the separately authorized release workflow.

The issue remains open for review. No full-match recording was added, and no capture was emailed or uploaded.
