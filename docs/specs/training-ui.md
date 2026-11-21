# Preliminary Training lab

## Objective
Provide `/training` for bounded local game evaluations and viewing saved results, building on the self-play harness in #567. Keep computer opponent research deferred as recorded in the [roadmap](computer-opponent-learning-roadmap.md).

## Scope and behavior
- Inherit the site's navy, cyan and gold visual system and existing header. A configuration column sits beside experiment history and selected results, stacking on narrow screens.
- A separate Node launcher binds only to 127.0.0.1. It serves the page and enables one owned run at a time, bounded game count/time, resource profiles and explicit worker/heap overrides.
- Close the browser without cancelling a run; keep the launcher terminal open. Stop requests use IPC to invoke the existing harness cancellation path, including on Windows.
- Show bounded live logs, final throughput, failures, game scores and reproducibility configuration. Discover CLI results under the configured output directory; incomplete metadata is explicitly indeterminate.
- The Development page links to a static read-only viewer that opens summary JSON entirely in the browser. Execution controls require the loopback launcher. The launcher can also run with controls disabled.
- BC/PPO execution, queues, automatic promotion, checkpoint resume, public galleries and replay are excluded from this preliminary UI. No automatic remote publication.

## Validation
Node tests cover input bounds, control capability, hostile origins/hosts, exclusive ownership, stop and history. Browser tests cover read-only mode, imported results, form submission, stop state and mobile overflow with simulated execution. No Java or model behavior changes.
