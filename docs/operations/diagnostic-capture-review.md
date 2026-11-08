# Reviewing performance and network captures

Use the offline analyzer to turn a DEV client's exported rolling-window JSON into a short report for support review or a follow-up chat. It does not need a running server, browser, credentials or network connection.

## Obtain a capture

In a DEV match, open **Debug → Performance & Network**, enable Counters or Graph, and select the history window. Reproduce the delay, choose Pause promptly, optionally mark the incident, and Export JSON. Export saves the selected recent window, not an entire match. The maximum window is 60 seconds; high sample rates can retain less.

The public support instructions point users to `https://dev.molesunderthepitch.org/play` and ask them to attach captures to an email they send to `support@thegrognardcodes.org`. This CLI reads local files only; it does not send email or upload anything.

Keep the original capture available locally when investigating a report. Captures received from others are untrusted input, even when their filenames look familiar.

## Analyze one capture

Run from the repository root with Node 26:

```powershell
node tools/diagnostics/analyze-capture.mjs "C:\Captures\mutp-performance-capture.json" --output .tools/capture-review.md --json .tools/capture-review.json
```

The Markdown report is the concise, paste-ready handoff. The optional JSON report contains the same structured analysis for automation. Without `--output`, Markdown is written to standard output:

```powershell
node tools/diagnostics/analyze-capture.mjs "C:\Captures\mutp-performance-capture.json"
```

Existing reports are protected against accidental overwrite. Use `--force` to replace a report deliberately; input captures cannot be used as output files, including through path aliases.

## Analyze several captures

```powershell
node tools/diagnostics/analyze-capture.mjs "C:\Captures\before.json" "C:\Captures\after.json" --max-incidents 8 --output .tools/capture-comparison.md --json .tools/capture-comparison.json
```

Each capture has its own identity, statistics and incidents. The analyzer does not align separate monotonic clocks or pool their samples into a misleading combined percentile. The default incident limit is 10 per capture, configurable up to 25; file count and total output are bounded. A truncation notice tells you when the report omits additional findings. Reducing `--max-incidents` is useful when preparing a brief chat handoff.

Inputs are limited to 16 files of at most 2 MiB each. Markdown is bounded to 32 KiB and structured JSON to 128 KiB. Invalid input, unsupported format versions, unsafe output paths and usage errors exit nonzero; a successful analysis exits zero even when it finds incidents.

The report uses ordinal/hash capture identities rather than copying incoming filenames. Capture 1 corresponds to the first input argument. Preserve that ordering locally if you need to match a report back to its attachment.

## Flagging thresholds

| Observation | Review threshold |
| --- | --- |
| Frame gap | At least 50 ms; at least 100 ms is severe. Gaps ending within one second form a burst. |
| Sustained frame-budget pressure | At least 20 frame samples and median interval greater than 1.25 times the selected frame budget. Ordinary small budget crossings remain summary counts. |
| Application RTT or idle-probe RTT | Selected latency budget; default 250 ms. Probe timing is labelled separately. |
| Server queue wait | At least 100 ms. |
| Server handling | At least 250 ms. |
| Local pending/provisional feedback, transcript or presentation wait | At least 100 ms. |
| Total input-to-presentation time | Selected latency budget; default 250 ms. A separate end-to-end flag does not imply a slow local presentation stage. |
| Long task / long animation frame | At least 50 ms. |
| Pending request / playback backlog | Review age against the relevant latency/local-wait threshold; incomplete work is not a completed RTT sample. |
| Manual marker, disconnect or probe timeout | Retained as review context; nearby timing observations can join the group. |

Other duration findings become severe at the larger of twice their threshold and 1,000 ms. These thresholds select evidence for review; they are not universal performance guarantees. Same-trace measurements are grouped; nearby frame/marker context within 500 ms is labelled correlation. A trace group's headline time is its first observation; its client RTT interval and later observations are separate evidence.

The current exporter groups frame samples before other measurements. Sorting that input into chronological order is normal analysis preparation, not evidence that the capture is corrupt. Missing time buckets are not treated as zero traffic, and rates describe represented 250 ms application-payload buckets, including partial buckets.

## What to review and share

Read the capture-quality notes first, then the ranked incidents and their selected evidence. A typical investigation follows these questions:

1. Does the window cover the reported incident, and are there enough samples for the relevant metric?
2. Is the signal an isolated large frame gap, sustained frame-budget pressure, slow response, local presentation wait, or a connection/probe event?
3. Do measurements sharing a capture-local trace support a particular next area to inspect: server queue, server handling, transcript availability or presentation?
4. Are nearby frame gaps or visibility/context changes relevant? Proximity alone does not establish causation.

Paste the generated Markdown into the chat, together with a short description of the visible symptom, the action being attempted and whether it repeats. You do not need to paste the full JSON. If the report says an important metric is missing or a finding was truncated, mention that limitation and retain the original file for a focused follow-up.

The analyzer emits selected numeric evidence and fixed labels, rather than copying arbitrary capture fields, free-form text, filenames, paths or embedded instructions. It is a diagnostic summary, not a general-purpose sanitizer for other attachments.

For automation, the JSON output has `reportVersion: 1` and a `captures` array. Each capture includes its identity, window/coverage, counts, thresholds, metric statistics, selected incidents, snapshot/traffic context, quality counts and truncation counts. `outputTruncated` indicates global reduction. Use the capture's selected `incidents` for a compact handoff; do not assume that an absent incident or metric is a measured zero.

## Interpretation limits

- Frame intervals are browser rAF scheduling opportunities, not proof of renderer/GPU presentation or physical-display latency.
- Application RTT includes client dispatch, socket queues, transit and server processing. It is not pure network delay or a one-way measurement.
- Server queue/handling/phase durations sharing a trace are related measurements. Nested phase durations overlap; do not add them or subtract them from unsynchronized clock values.
- A disconnect or probe timeout is not a packet-loss percentage. The exporter's dropped/replacement count reflects bounded collection and correlation bookkeeping, not network loss.
- Missing samples or unavailable server timing stay unavailable. An empty or quiet capture does not prove the reported problem did not occur outside that window.
- The report flags observations for review. It cannot by itself establish the root cause of a stutter or delay.

## Validation and implementation record

Run the focused analyzer and CLI tests with:

```powershell
node --test tools/test/capture-analysis.test.mjs
```

The implementation contract is [the feature specification](../specs/diagnostic-capture-analysis.md). Its outcome report records the final thresholds, limits, validation and example analysis of an actual native capture. Existing synthetic-overhead and native acceptance scripts remain separate tools; they are not needed to process support files.
