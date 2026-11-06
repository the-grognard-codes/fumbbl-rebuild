# Compact team-builder workbench outcome

Issue: [#470](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/470). Future guided workflow: [#471](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/471).

Implemented November 6, 2026 on `feature/team-builder-workbench`, based on main `1438090c2415b0b11c76bb27b83c5d84d1679c62`, in the separate `.tools/worktrees/team-builder-workbench` checkout. The existing home-page branch remains in its original checkout. The owner accepted the result and authorized committing all changes, PR publication, successful CI, merging to main, branch/worktree removal, completed-feature tracking and stopping dev-local. The delivery PR records the final commit, CI and merge evidence. Remote site deployment is outside this delivery.

## Acceptance against the approved critique

| Approved priority | Implemented behavior | Acceptance evidence |
|---|---|---|
| P1: connected roster workspace | Compact recruitment/resources beside the editable roster; persistent player, skill, value and treasury summary. Narrow layouts reflow into an ordered column. | Human/Orc 11- and 16-player geometry checks at 320, 390, 768, 1280 and 1440px widths, plus 1280 × 480; no horizontal overflow and usable roster space beneath the completion strip. |
| P1: validation and saving together | Validate, status and Save share the summary strip. Validation results appear immediately below; known errors focus the correct field and open player options when needed. Unknown paths safely focus the roster. | Exact-draft/latest-response gating, field-focus tests, readonly catalog gates, reconnect recovery and stale-response rejection. |
| P2: defer optional customization | Compact kit preview with collapsed Customize kit; Team Details remains optional; formations stay an optional entry point. Fixed creation mode is budget context. | Disclosure, recolored-art, formation and narrow expanded-content checks pass. |
| P2: returning-coach entry first | New team and saved-team disclosure precede the editor. Saved-team lists survive loading. Discard confirmation protects dirty drafts. | CRUD/copy/ownership/Play regression; pristine and dirty New/Load tests; open-menu geometry checks. |

The guided walkthrough and a modal choice between workflows are recorded in #471 and its local mirror. They are not implemented in this slice.

## Review findings and fixes

The independent finish review accepted the approved Pixel Pitch identity and the rendered desktop/mobile/short layouts. It identified two material state issues, both resolved and rescored as resolved:

1. A validation request interrupted by disconnection could leave Validate disabled. Transport transitions now clear the active request token, pending validation map and waiting state. A regression proves retry works without unrelated edits and abandoned responses cannot enable Save.
2. A delayed Load or its catalog response could replace newer work. Latest-request and draft-generation guards preserve later edits, New team and later Load selections. Regressions cover delayed Load/edit/New, delayed Orc catalog/new Human draft, and newer Load B superseding Load A's pending catalog.

Earlier focused tests also exposed saved-team list loss after Load and an open-menu overflow at narrow widths. List acknowledgements now own list replacement, and the menu anchors to the team-access group. Both regressions pass.

Final review disposition: **ship**. The verdict pass scored the two material fixes resolved; the earlier full review's visual acceptance remains valid because the fix batch did not alter markup or styling.

## Verification

- Full `npm.cmd run build --prefix site` passed after final source changes, including TypeScript, Vite and static-site assembly.
- `npm.cmd run check --prefix site` passed.
- Focused validation-path/protocol unit run: **8 passed**.
- `npm.cmd test --prefix site`: **12 passed**.
- Integration run across builder, workbench, Play and account-menu browser files: **19 passed** before the interruption refinements.
- Final affected builder browser run after those refinements: **6 passed**, no failures/skips; the three newly added recovery/race cases also passed independently.
- BB2025 source audit and `git diff --check` passed.
- Layout-scoped detector scans of BuilderPanel, BuilderDraftEditor and the public team-builder HTML returned **zero findings**. These complement the rendered and behavioral checks.

The new browser suite is registered in the hosted browser manifest. The new stylesheet is loaded only by `/teambuilder`; shared builder layout styles remain unchanged so Play retains its established layout.

## Visual evidence and limits

Generated local captures are in `test-output/team-builder-workbench/`, including empty Human, populated 11-player Human/Orc desktop 1440 × 900 and mobile 390 × 844 opening crops/full pages, plus 11/16-player views at 320, 390, 768, 1280 and 1440px and short-window roster views. Google Fonts were allowed to load. Completion labels shorten visibly to Validate/Save on narrow screens while preserving their contextual accessible names.

Browser verification uses mocked authentication, catalogs and WebSocket replies. It establishes the exercised browser behavior, not production account/service acceptance, physical-device usability, or full screen-reader conformance. Java/game-server tests were not run: no Java, rules, server protocol, ownership or persisted-data format changed. Existing deployment and authentication configuration was preserved.

## Documentation and process

The local spec and Unreleased entry describe the implementation; no new visual system or durable token policy was introduced. PRODUCT.md, DESIGN.md and its sidecar remain unchanged. The pre-existing sidecar freshness mismatch is outside this task.

Stop-hook follow-up: the inherited radial background from unchanged `site.css` was retained as part of this scoped refinement. A `radial-halo` exception is limited to `site/src/teambuilder/index.html` in `.impeccable/config.json`; the follow-up scan confirms that finding is suppressed. No UI changed in this follow-up.

The focused fixture made saved-team and asynchronous replacement defects reproducible without editing real account data. Opening/full-page captures from the automated harness supplied repeatable visual evidence while the browser connector was unavailable. Future builder refinements should retain these behavior-focused checks and current-state captures.

Issue #470 tracks delivery and is linked to the closing PR. The completed-features archive records this work; public update history is reserved for actual merged PRs.

## Formation geometry follow-up

User testing exposed rectangular pitch cells and overlapping formation markers.
The workbench's 44px minimum button height was also sizing spatial pitch controls.
The minimum now excludes formation cells and chits; marker minimum sizes allow
them to shrink with the grid. Narrow-screen cells use their inner space for the
marker, with a thinner marker border so two-digit jersey numbers remain inside.

The hosted regression reproduced 33.86px-wide by 44px-tall cells before the fix.
It checks all four starter formations, all 225 pitch squares (including the
opposing context), circular markers, contained jersey numbers, reserve markers,
and dialog overflow with mouse and touch input at 320, 390, 768, 1280 and 1440px
widths, including a 480px-high window. Both geometry tests pass. Captures are in
`test-output/team-builder-workbench/formation-*.png`.

Follow-up verification: both hosted builder files pass all **8 tests**; the
standalone formation editor mouse/touch, keyboard, validation, saving, discard,
deletion and live setup checks pass. The full local-dev Hosting assembly
(TypeScript, Vite and static build), site check and whitespace check pass.
Desktop and 320px captures were visually inspected. The existing local Firebase
emulator serves the rebuilt workbench and formation CSS, verified by HTTP 200 and
matching SHA-256 hashes. Refresh the browser after saving any draft work to load
the update. No server restart or remote publication was needed for this CSS fix.

Hook review: `side-tab` at FormationManager.css line 26 is a false positive.
The border marks the two pitch wide-zone boundaries, not a card accent. A
file-scoped `side-tab` exception was recorded through `impeccable hooks
ignore-value`; the follow-up scan no longer reports it. Pitch styling is unchanged.
