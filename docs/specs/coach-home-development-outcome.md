# Coach-first home and Development outcome

Issue: [#469](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/469).
Implemented on `feature/coach-home-development`, with current main's compact
team-builder delivery (`4374c2a64`) integrated before publication. The owner
accepted the result and authorized commit, PR, successful CI, merge, branch
cleanup and completed-feature tracking. This checkout is retained on main;
remote site deployment is outside this delivery.

## Delivered behavior

- Home introduces BB2025 coaching, Human/Orc teams and human/computer opponents.
  A prominent Play action and linked sign-in, save-team and opponent-choice steps
  give new coaches a short route into a match.
- Development combines educational roots, AI-assisted development context and
  source/setup references with all 191 existing merged-history entries. Existing
  history data is unchanged.
- Shared navigation uses Development. Legacy `/updates`, `/updates/` and
  `/updates/index.html` preserve search/hash state when forwarding, with a direct
  Development link when JavaScript is unavailable.
- Search, categories, pagination, URL state, browser back/reload, local merge dates
  and complete no-JavaScript history remain available. Existing visual identity
  and the independence statement are retained.
- The completed-features archive records the delivered scope.

## Integration conflict resolution

Four conflicts with main were resolved without changing either feature's intent:

1. Kept both Unreleased changelog entries.
2. Required home, redirect and builder-workbench assets in the site check.
3. Retained both branches' existing detector exceptions through the supported
   hooks CLI. The public-site exceptions cover approved fonts/background and
   measured padding false positives; main's pitch-boundary and builder-background
   exceptions remain intact.
4. Kept main's latest mobile formation screenshot, preserving the accepted square
   pitch-cell evidence instead of the older test-generated capture.

## Verification

- Production site build passed: TypeScript, Vite and static generation/assembly.
  Missing local TypeScript tooling was restored with the existing lockfile using
  `npm.cmd ci --prefix browser-client`; no dependency version changed.
- Site check passed for 23 inputs and all 191 history entries.
- Site unit tests: **12 passed**.
- Integrated browser run across updates, account-menu, builder and
  builder-workbench files: **10 passed**. Covers desktop/narrow home and archive
  layout, all legacy redirects, no-JavaScript history, shared navigation, builder
  CRUD/Play selection, recovery/races and formation geometry.
- BB2025 source audit and whitespace checks passed.
- Initial independent visual review and owner acceptance were completed before
  delivery; the merge resolution changes no public-page visual design.

The closing PR records final CI and merge evidence. Browser tests use mocked
authentication and service replies and do not claim physical-device or full
screen-reader acceptance. Local game-server checks were not repeated for this
public-site slice; the PR's repository CI validates Java and service boundaries.
