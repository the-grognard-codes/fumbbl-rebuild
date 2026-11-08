# Capture-driven performance follow-up

Created 2026-11-07 from the user's diagnostic review and request for separate investigation tickets. GitHub owns status and discussion; these files mirror the scoped requirements and evidence handoff.

## Tickets and blocking edges

| Issue | Deliverable | Blocked by |
| --- | --- | --- |
| [#489](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/489) | [isolate residual checkpoint and recovery serialization spikes](01-checkpoint-spikes.md) | None |
| [#490](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/490) | [isolate recurring authorization cost after bounded session revalidation](02-authorization-cost.md) | None |
| [#491](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/491) | [make pending-action feedback prompt during slow authoritative responses](03-pending-feedback.md) | None |
| [#492](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/492) | [isolate browser main-thread stalls during authoritative response handling](04-browser-response-stalls.md) | None |
| [#493](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/493) | [validate capture-driven fixes with matched before-and-after workloads](05-matched-validation.md) | #489, #490, #491, #492 |

All five are labelled `ready-for-agent`. The first four investigations can start independently. The final combined comparison has native GitHub blocking edges on their results; narrow baseline measurements belong in each investigation and do not wait for the final comparison. An investigation may produce an evidence-backed fix or a precise unresolved finding; no root cause is assumed in advance.

## Evidence and historical scope

The source capture is `capture-1-4ea4e06c682b`: a 30-second retained window with 3,109 frame intervals and five mutations. Mutation RTT median/max was 604.4/2,157 ms; server handling median/max 575.316/2,052.4 ms. The worst checkpoint was 1,761.968 ms, including 1,135.974 ms recovery serialization. Pending feedback ranged 95.4–133 ms. Six rAF intervals reached 50 ms; maximum was 78.9 ms. These are observations, not proof of the underlying causes or long-term tail estimates.

The existing recovery journal, bounded provider reuse and advisory prioritization were delivered through PR #339, as recorded in #324. New work must diagnose residual behavior rather than repeat #332, #333, #336, #337 or #338. The new diagnostics collector/analyzer from #483–#488 is available in the current feature workspace; every workload must identify the actual source and served artifacts. Existing physical-device acceptance stays with #330. No historical issue was modified or closed.

## Execution and evidence policy

- Use isolated working branches/worktrees and preserve the existing diagnostics changes. No implementation, commit, push, PR, merge or deployment was performed for this ticketing request.
- Preserve baseline commands and sanitized artifacts before making changes. Match action sequence, history size, source/artifact identity, browser/device, warm-up and diagnostics mode.
- Retain bounded captures and concise analyzer reports. Keep credentials, private account/match identifiers and gameplay payloads out of published issues.
- Do not add nested phase durations, merge capture clocks, equate application RTT with pure network delay, or interpret collector replacements as packet loss.
- Complete required checks for each implementation slice and record commands, failures/fixes, measurements and outstanding device acceptance on its issue and mirror.
