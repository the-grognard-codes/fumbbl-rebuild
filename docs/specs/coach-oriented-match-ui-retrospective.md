# Coach-oriented MUTP pitch retrospective

Completed 2026-10-04 after all eight implementation slices merged. The first pitch has been replaced in the production match, spectator and result/replay routes. The new UI supports a real BB2025 Human/Orc match through native full time. The delivered behavior satisfies the agreed local functional requirements and the presentation intent in [ADR 0003](../adr/0003-coach-oriented-angled-pitch.md) and the [approved spec](coach-oriented-playable-match-ui.md).

The reconciliation merged in [PR #100](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/100). Implementation merged through PRs #102–#109, ending at `ff71703c04f47860634616a901cbe36521e19f8e`. Every slice completed its branch, implementation, review, validation, conventional commit, PR, automated-check and merge cycle. All eleven checks passed on the final cutover PR. The [slice ledger](coach-oriented-match-ui-baseline.md) records the individual revisions.

## Comparison with the original plan

| Plan and intended behavior | Delivered outcome |
| --- | --- |
| Differentiate MUTP with an elevated view along the pitch | Default 40-degree perspective, zero yaw, opposite coach ends and the approved pixel stadium/palette. DOM/SVG supports this without a renderer migration |
| Scroll the whole stadium at a fixed camera angle and lens | Turf, grid, markings, players, ball, sidelines and stands share one camera. World-parallel edges converge together; equal camera-relative distance retains scale. HUD stays fixed |
| Keep crowded scrums readable | Selectable top-down view has square cells, parallel edges and north–south scrolling. Switching preserves canonical focus, player identity and valid proposals |
| Preserve the actual pitch and correct occupancy | One projection service owns rendering, inverse targeting, clipping and navigation for all 390 cells. Perspective uses foot anchors; tactical view centers visible artwork; ground poses use separate anchors |
| Replace sample UI with authoritative match data | Live names, score, resources, BANK/TURN clocks, turn tracks, chat and log; positive resources only, opaque text over 30% backgrounds, one independent inspector, categorized dugouts and retained menus/text controls |
| Make planned actions reviewable without slowing required choices | Move/Block/Blitz/Other/End Turn and Confirmed! use server-offered IDs and the existing guarded command path. Server route review, Undo/Clear, Last used and direct mandatory responses remain functional |
| Supply consistent Human and Orc placeholders | Twelve position archetypes: 84 body sprites covering standing directions, face-up prone and face-down stunned, plus twelve matching portraits. Versioned originals, prompts, anchors, previews and delivery packs are preserved |
| Present real dice and movement | Selected ivory/cyan art shows authoritative faces. Short nonblocking rolls, ordered transitions, interruption, reduced motion and replay cancellation are covered |
| Preserve the existing game server and application | The new renderer uses the existing engine, v2 transport, teams, memberships, route planner, saves and records. No second gameplay engine or camera-derived permission model was introduced |
| Establish playability with genuine local matches | Independent real coaches and spectator complete both halves; the existing computer path reaches native full time. Recovery, permissions, chat, results and replay are verified |
| Finish cutover and retain useful history | Hosted match/watch/result routes share the projected scene. Read-only replay offers either end and pitch/dugout inspection. Old fixture labs and camera studies remain historical references |

The result meets the owner's broader intent: the match looks like MUTP, presents fifteen squares across the monitor rather than the old horizontal twenty-six-square layout, and combines a distinctive stadium view with a practical tactical alternative. Camera preferences stay local; the authoritative rules and canonical square identities remain stable.

## Acceptance and its limits

The fresh Human/Orc match `1d9a0f2e-df34-3e01-a259-38ac2b4659f9` finished naturally 2–1 at revision 393 with 394 retained events. Two independent production coach clients and a spectator agreed on canonical state. Real UI checks covered pending-decision reconnect, routes and stale proposals, agreed save/suspend/resume, escaped durable chat, wrong-coach/spectator rejection and completed results. No fixture transport or forced full-time state established this gate.

The computer match `f3a0dba4-8683-310a-b6a2-a9cf7fe98ac2` finished naturally 1–0 at revision 560 with 561 events. Its first run exposed the old history limit at revision 520. After the bounded storage repair, the retained native checkpoint continued through the existing daemon and production UI to full time. This is a verified continuation, not a claim that the original run was uninterrupted. The fresh two-coach match and final replay checks then passed on the repaired build.

Final encompassing verification: Java clean install ran 697 tests, with 688 passes, nine existing opt-in environment skips and zero failures/errors; browser 140 units, seven interaction runners, reconnect, both builds and 166 asset checks; site check, six units and ten browser scenarios; computer player eight tests. Real replay verifies both coach accounts, both ends/projections, 390 cells, unchanged player IDs and zero mutation requests. The [acceptance report](coach-oriented-match-ui-acceptance.md) links the machine-readable records and screenshots.

Foreground checks covered the four specified desktop sizes, short/narrow fallbacks, Chrome/Edge, actual 100%/200% browser zoom, keyboard/focus/text controls, reduced motion and unavailable art. Frame and heap samples are bounded observations of a populated scene; they do not establish sustained animation or leak performance. The corrected native-zoom screenshot depicts a retained terminal match; the live zoom interaction measurements use the populated paused match. These evidence boundaries remain explicit.

Acceptance also found and repaired real integration defects: the hosted all-actions fallback, exhausted setup players, completed-state save metadata, account-to-role resolution for results, long-match storage bounds and short-window controls. Focused regressions protect those failures. Storage remains lossless and bounded, but older binaries cannot read newly compressed rows; compatible readers must remain during rollback.

Hosted signed-in release testing remains open under the owner's explicit local acceptance choice. Weather presentation, overtime gameplay, yaw, more roster art, team-builder portrait selection and a refined stadium model remain later scope. The approved painted stadium still has depth distortion and repeated plates. No required local failure is relabeled as one of these future features.

## Improvements to the agent environment

These findings follow the retro skill's environment review and are ordered by severity. Existing package scripts and CI workflows were inspected before proposing changes. CI already runs current Java 21 verification, the pinned historical Java 8 baseline, browser/site tests and delivery assembly, Firebase service checks, workflow lint, secret scanning and CodeQL.

1. **High: exercise the authenticated v2 lifecycle before the final slice.** Fixture and unit coverage missed account-versus-role resolution and the accumulated history of a full computer match. The isolated bootstrap, genuine UI runner and retained evidence now provide that gate. A future trusted acceptance runner should execute full-roster, both-half matches early for changes to transport, ownership or storage. Its dedicated signBlob permission and synthetic identities should remain separate from public CI and private account data. This is an execution/check improvement, not another prose rule in AGENTS.md.

2. **Medium: make durable-record readers visible at the storage seam.** The computer preparation service reads stored documents directly, alongside the JDBC repositories. Applying the codec only to repositories would have left a hidden incompatible reader. The repair includes that reader, strict bounded corruption/expansion tests and active-document filtering. A short storage ownership pointer linking all readers and the rollback contract would make future changes easier to navigate; table-reader contract tests are the appropriate continuing guardrail.

3. **Medium: distinguish browser zoom, DOM reachability and actual pixels.** A CSS-clipped Playwright export was misleading even while controls passed DOM assertions. Native-window zoom plus physical image-dimension assertions and visual inspection produced valid evidence. Keep the corrected export helper and pointer-based narrow-window tests as deterministic checks. Device emulation alone cannot substitute for actual browser zoom acceptance.

4. **Medium: retain process and identity ownership in local tooling.** Restarting a full-match run with new accounts or signaling an unrelated process would invalidate evidence or disrupt existing work. The helpers now use dedicated ports/volumes, exact process identities and validated retained account IDs. Resume and cleanup tests protect this behavior. Local logs and versioned JSON evidence make failures inspectable without exposing authentication material.

5. **Low: reduce repeated context and noisy validation.** The affected-test manifest, focused selectors, bounded log tails and compact review reports kept the cross-stack repairs manageable. One test edit initially landed in the wrong nearby method and was corrected before validation; patches should target named methods. Reuse passing encompassing checks unless a change invalidates them. Keep the approved requirements, baseline ledger, acceptance evidence and outcome distinct rather than duplicating the full spec into new steering files.

The mechanical failures received executable regressions. There is no evidence from this session that another global coding rule or a larger AGENTS.md would improve those checks. Independent review was most useful at the projection/input, asynchronous playback and storage/authorization seams; routine final presentation edits were reviewed directly.

## Final assessment

The agreed implementation is complete and locally playable, and its result matches both the specified functional work and the owner's intended pitch presentation. The authoritative game remained the foundation throughout the overhaul. The next release decision is the separately recorded hosted signed-in acceptance; it is not an unfinished slice of this approved unattended local implementation.
