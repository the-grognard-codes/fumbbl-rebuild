# MUTP site updates outcome

The Play and Team Builder annotation changes are implemented together on
`codex/mutp-site-updates`, based on the Bogruk integration in `21d9aaca9`.

## Delivered behavior

- Play shares Team Builder typography, controls, colors and panel styling.
  Human and AI opponent buttons replace the play-mode selector.
- Five illustrated, whole-card coach choices show skill levels Horrible, Weak,
  Fair, Good and Expert. Gobbo and Bogruk are available; the remaining coaches
  are disabled with Coming soon notices. Coaches have no roster-race labels.
- The AI roster selector sits beside the selected coach. Bogruk retains
  `coach-bogruk-weak`, his independent policy and Bogruk's Almost Best team.
  Gobbo retains the random policy and Bugman's Best team.
- New matches freeze the coach display name privately. Historical matches
  without that metadata retain the original random-coach display name.
- Human and Orc details tables fit at 1920px and 1223px widths with wrapped
  skills. Resource plus and minus bars have matching widths and centers.
- Saved-team lists and Play selectors display Human and Orc with capitals and
  omit document version numbers. Protocol identifiers remain lowercase.
- Save as new preserves the source team and validates a separate new team.
  Account team names compare after trimming, NFC normalization and lowercase
  conversion. Creates and renames enforce uniqueness within the same JDBC
  transaction, including simultaneous writers.
- The value panel shows Players x/16. Validation status sits beside Validate
  Roster, and the estimate notice is removed.
- Recruiting uses 1,000 Human and 1,000 Orc names, plus 100 each for Ogres,
  Halflings, Trolls and Goblins. Generated names contain only letters, start
  with a capital, have at most 12 letters and avoid existing roster names.
  Manual player names remain editable. Factory requirements are in `.notes/TODO.md`.

## Verification

- All 52 browser suites passed after the integrated site changes. The final
  capitalization change also passes the production build and focused hosted
  Team Builder save, copy, load and Play-selection journey.
- Focused server checks passed: 87 integration tests and 24 saved-team tests.
  The local review server image also built successfully with 477 server tests,
  including two existing opt-in skips.
- Name-pool, saved-team protocol and saved-team UI state checks passed (10 tests).
- Human and Orc screenshots confirm the details-table fit at both widths.
- Self-review found a live-match CSS specificity regression; the lobby
  exclusion now uses `:where` and the spectator viewport suite passes.

## Remaining follow-up

The five generated portrait originals total approximately 8.29 MB and load at
96px display size. Smaller delivery exports remain a performance improvement;
the original images and generation prompts are retained.

Publishing, CI results and merge status are recorded in the pull request.
