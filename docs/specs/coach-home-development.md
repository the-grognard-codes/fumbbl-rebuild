# Feature: Coach-first home and Development page

GitHub issue: [#469](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/469)

## Abstract

Make the public home page an entry point for BB2025 coaches and combine the project's educational background and merged PR history at `/development`, replacing `/updates` in navigation.

## Objective

Help a new coach understand what MUTP offers and follow a short path from sign-in and team building to a match. Give readers interested in the project's learning and engineering history one dedicated destination.

## Context / Existing Behavior

The November 6 public-site critique (`.impeccable/critique/2026-11-06T18-45-52Z__site-src.md`, priority 1) found that the home page led with education, client architecture, and a future service boundary instead of gameplay. The existing Updates page already provided a complete, searchable archive of merged changes.

The implementation was accepted on `feature/coach-home-development`. The owner authorized committing all changes, resolving conflicts with current main, publishing a PR, waiting for CI, merging, removing the working branch and recording completion. This checkout is retained and returned to main; remote site deployment remains outside scope.

## In Scope

- Coach-facing home-page copy, a prominent match action, and a three-step first-match guide.
- Educational and AI-development background, source/setup links, and the existing merged history together at `/development`.
- Shared navigation, legacy `/updates` forwarding, generated-page maintenance, focused regression coverage, documentation, and the Unreleased entry.
- A 12px home-page match-button label and documented, narrow detector exceptions for approved typography/background and confirmed padding false positives.

## Out of Scope

- Sign-in pending/error recovery, Support reordering, and the broader navigation legibility work identified separately in the critique.
- Gameplay, server rules, authentication behavior, new artwork, or a replacement visual identity.
- Committing, publishing a PR, merging, or deployment without separate authorization.

## Functional Requirements

1. Lead the home page with BB2025 coaching, Human/Orc team building, and human or computer opponents; expose `/play` and `/teambuilder` actions.
2. Explain the actual entry flow: sign in, validate/save a team, then create/join a human game or select saved teams for an AI game. Include spectating and Support routes.
3. Combine educational roots and AI-assisted development context with the existing merged-PR archive at `/development`.
4. Preserve all archive entries, links, local merge dates, search, category filters, pagination, URL state, and complete no-JavaScript history.
5. Replace Updates in shared navigation and the home footer. Forward old `/updates`, `/updates/`, and `/updates/index.html` links with their query and hash when JavaScript is enabled; provide a direct Development link otherwise.
6. Preserve the approved logo, pitch image, palette, font roles, independence statement, and account separation.

## Acceptance Criteria

- [x] The home page communicates the game and exposes a match action in the initial 1280 × 752 desktop and 390px phone viewports.
- [x] A linked first-match guide covers sign-in, saved teams, and opponent choice.
- [x] Development contains the educational background, source/setup references, and all 191 existing merged entries; `site/updates.json` is unchanged.
- [x] History controls, reload/back navigation, legacy links, and the no-JavaScript destination work.
- [x] Shared navigation consistently identifies Development as the current page where applicable.
- [x] Tested layouts fit at 320, 390, 640, 768, 1280, and 1440px; the home match-button label measures 12px.
- [x] Relevant build, source, browser, and visual checks pass.
- [x] Delivery authorization and local validation are recorded; the closing PR supplies CI and merge evidence.

## Constraints

Preserve the established Pixel Pitch identity and existing product capabilities. Keep claims consistent with verified behavior; browser emulation does not establish physical-device coverage. Keep changes within this public-site slice and preserve unrelated work. Record this work in `CHANGELOG.md`; add a public update-history entry only after merge.

## Implementation Guidance

The existing `site/scripts/render-updates.mjs` now generates `site/src/development/index.html` from the unchanged history data. Existing archive asset/module names and maintenance commands remain valid. The former source page is a small compatibility destination using `updates-redirect.js`. Home-specific spacing and label size stay in `home.css`.

## Validation

Completed locally:

- `npm.cmd run build --prefix site` (including TypeScript/Vite application build).
- `npm.cmd run check --prefix site`.
- `npm.cmd test --prefix site` — 12 tests passed.
- `node --test site/test/updates-browser.test.mjs site/test/account-menu-browser.test.mjs` — both focused browser checks passed; the history browser check passed again after the label correction.
- `node tools/validation/bb2025-source.mjs` and `git diff --check`.
- Rendered desktop/phone review and responsive measurements, with no horizontal overflow at the tested widths. Chromium measured 36px desktop and 20px phone panel padding, confirming the detector's padding warnings were false positives.
- Independent finish review: ship, including the later label correction. Documentation review found no new system-token or policy changes.
- Stop-hook follow-up: zero warnings on the two flagged HTML files after the label fix and narrow exceptions. Existing decorative advisories remain; pre-existing design-sidecar freshness drift was left outside scope.

## Completion Notes

Implementation and initial validation are complete. The authorized delivery integrates the compact team-builder work on current main, retaining both changelog entries, required-asset checks, scoped detector exceptions and the latest formation evidence. The closing PR records final CI and merge evidence. Local game-server tests were not repeated for this public-site slice; PR CI performs the repository's Java verification.
