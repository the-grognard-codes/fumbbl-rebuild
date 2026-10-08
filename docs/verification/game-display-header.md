# Game display header exception

Issue: [#228](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/228). Branch: `fix/hide-game-display-header`, based on `ad4df1a421f29d7e3f4051ea67bfb881b4b435a9`.

The standard site top bar stays on ordinary site pages and Play setup. The existing `game-focused` body marker hides it on live coach/spectator matches and result/replay displays. In-game controls and the result page's return link remain available. The Play stylesheet URL is refreshed so the correction loads during current testing.

The existing shared-header browser journey now expects the bar to be hidden on `/play/match`, `/play/match?watch=1` and `/play/result`, at desktop/mobile widths. Ordinary page header/account assertions remain in place.

The first GitHub Static delivery run exposed two older match-layout assertions that still reserved space for the visible site bar. The Blitz and crowded spectator journeys now require zero header layout space, a pitch within the viewport with its existing margins, and Game Menu within the match viewport. Validation remains exclusively in GitHub checks.

The user requested GitHub PR checks as the only validation while actively testing. No local build, test, browser validation or independent review is run. Only the local Play stylesheet and its page URL are refreshed; no game session or service is restarted. All GitHub checks must succeed on the committed head before merge. The final CI and delivery outcome is recorded in the local retrospective.
