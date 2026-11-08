# Feature: Diagnostic capture review harness and support guidance

Tracking: [#488](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/488), a follow-up to [#483](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/483), authorized 2026-11-07. Continue on `feat/debug-performance-netgraph`; preserve the existing uncommitted implementation.

## Abstract

Process exported rolling-window diagnostic JSON offline into bounded reports that identify relevant incidents and supporting measurements for support/agent review. Add support-page instructions for using the DEV performance/network analyzer and emailing captures to `support@thegrognardcodes.org`.

## Objective

Review likely stutters and response delays efficiently without pasting or manually reading the entire capture. Keep the browser's existing sliding window and collection behavior.

## Context / Existing Behavior

The DEV client exports version-1 numeric diagnostic captures, with at most 60 seconds of selected history and a 2 MiB file limit. There is no dedicated offline analyzer for those exports. Existing profile/native scripts validate the feature rather than process support submissions. The support page has topic shortcuts, sign-in help, general contact information and device guidance.

## In Scope

- Dependency-free Node CLI, reusable analysis module, focused tests and operator documentation.
- Human-readable Markdown plus optional structured JSON reports, supporting multiple independent captures.
- Ranked/grouped incidents, bounded evidence excerpts, capture quality/coverage notes and review focus.
- A support topic linking the DEV client, explaining Pause/Export JSON and the requested capture-review address.

## Out of Scope

- Full-match recording, changing collection limits, new browser/server telemetry, automatic uploads or sending email.
- Automatic root-cause conclusions, packet-loss/one-way-latency claims, or adding nested server phases together.
- Changing the general support contact elsewhere, resolving #487, publishing, commits or remote deployment.

## Functional Requirements

1. Accept one or more exported version-1 captures; validate format, size, counts, timestamps and numeric values before analysis. Bound file count and report size. Fail clearly on malformed/unsupported input without echoing file contents.
2. Report sample coverage and per-capture statistics. Identify significant frame gaps, slow application RTT, server queue/handling waits, presentation/feedback/transcript waits, manual incident markers, disconnects/probe timeouts and pending requests. Use documented thresholds and respect configured latency thresholds where appropriate.
3. Group repeated frame gaps and correlated measurements into a small ranked list. Join server spans by capture-local trace IDs and label nearby frame/marker context as correlation. Preserve units, sample counts and unavailable states; never merge independent monotonic clocks across files.
4. Produce paste-ready Markdown and optional machine-readable JSON with selected numeric evidence. Exclude arbitrary free text, raw file paths/names, unknown capture fields and payload content. Treat submitted files as untrusted data; embedded instructions must not appear in reports.
5. Protect capture files from report-output overwrites, including path aliases. Explain truncation and distinguish bounded-buffer replacements from network packet loss. Include explicit limitations where samples or server spans are absent.
6. Document exact invocation, output meaning, thresholds, how to locate an incident, what to paste into chat and limitations. Verify with synthetic edge cases and a real exported capture.
7. Add a discoverable support section: DEV URL, Debug → Performance & Network, choose history/mode, reproduce, Pause and Export JSON, then attach the capture to email sent by the user to `support@thegrognardcodes.org`. Explain separate DEV accounts/games, up-to-60-second history and no automatic submission. Preserve existing support topics/contact information and responsive/accessibility behavior.

## Acceptance Criteria

- A native export produces a concise report showing actionable timing evidence without including the full sample array or private/free-form content.
- Synthetic healthy, frame-burst, slow-request, missing-data, malformed, oversized and malicious-text captures are covered by meaningful tests. Batch processing keeps each capture's timeline/statistics distinct.
- Markdown/JSON output limits, deterministic ranking, report truncation, CLI errors and capture overwrite protection are tested.
- Support topic navigation, capture instructions and the exact DEV/mailto destinations work with keyboard/touch and without JavaScript; desktop and narrow layouts remain readable.

## Constraints

- Keep existing branch/work and MUTP styling. Reuse Node 26, built-in modules, support markup and test conventions; no new dependency or protocol requirement.
- Do not stage, commit, push, publish or deploy remotely. Local artifact rebuilding is permitted for validation.
- Do not send email or upload captures. Local test capture data stays outside public issues and documentation.

## Implementation Guidance

- Put reusable analysis and CLI in `tools/diagnostics/`, tests under `tools/test/`, and the operator guide under `docs/operations/`.
- Default to a short ranked list rather than every threshold crossing. Explain evidence and next review targets without asserting a proven bottleneck.
- Reuse the actual exporter schema in `browser-client/src/performance-diagnostics.ts`. Local real-export evidence is under `.tools/debug-performance/native-focused/`.
- Add the support topic beside existing practical help; no new visual identity or global contact-address migration.

## Validation

- Focused analyzer/CLI unit and integration tests, including file safety, hostile fields and report-size bounds.
- Run the analyzer on the actual native export and inspect both output formats.
- Site production build, site unit tests, support browser checks and desktop/narrow captures. Java/game-server code is unchanged; preserve prior passing native build evidence rather than repeat unrelated suites.

## Completion Notes

Record implementation, self-review, exact commands/results and remaining limitations in an adjacent outcome report. Update the issue(s); leave the local stack available. Support copy becomes available on DEV only when the feature is published through a separately authorized deployment.

Implemented: [outcome and validation](diagnostic-capture-analysis-outcome.md). Offline analysis and support guidance are ready for review; local stack remains available, with no remote publication.
