# Player skill markers delivery outcome

Status: **merged to main** on 2026-10-18 at 04:15:37 UTC (00:15:37 America/New_York), squash commit `766f15026b9c7e3185106f0f9ef3bdde7cb07d61`. [PR #296](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/296), [feature issue #293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293).

## Acceptance review

The delivered manifest covers exactly 108 BB2025 core identities: 72 skills and 36 traits. Both approved production packs contain one marker per identity. Owner-directed edits to Secret Weapon, Dodge, Claws, Put the Boot In and Eye Gouge are retained. Unique star abilities appear in complete player cards; star, stat-change and named-effect pitch badges remain outside the approved scope.

Game Settings includes the scrollable Skills & Traits tab, Skill Markers section, both team switches, base/acquired and trait filters, the independent six-trait Big Guy/Secret Weapon switch preserving Loner, Text/Illustrated selector and Small/Medium/Large slider. Preferences persist. Badges use native identity/category/provenance and parameterized profile details, stable priority, exact overflow and approved zoom/readability floors. Live, replay, replay seek and recovery paths share the renderer and preferences. Legacy snapshots retain their skill text without guessed provenance. Ground/player targeting is preserved.

The isolated publishing branch integrates current main (883323216), including its reactive decisions and game-log changes. Both independent standards and spec reviews approved. Production art and a durable manifest/spec are published; local art experiments and authoring archives remain in the original checkout. Separate reduced-motion playback changes are excluded and preserved there.

Native Android hardware and Linux browser manual validation remain explicit owner follow-up. Windows Chrome, Android touch emulation and Linux CI are covered. Merge authorization does not include deployment.

## Verification

- `npm test --prefix browser-client`: 325 passed after all final fixture updates.
- `npm run build --prefix browser-client`: passed on the integrated source.
- Approved asset integrity and sync: passed; 430 browser game assets. All 432 committed source/delivery image blobs match the owner-approved SHA-256 inventory.
- Independent focused protocol/assets/preferences/presentation checks: 33 passed.
- `node browser-client/test/skill-markers-ui.mjs`: passed, including settings persistence, filters, zoom floors, dense overflow, star cards, replay/recovery and Android touch.
- `node browser-client/test/game-menu-events-ui.mjs`, `playback-ui.mjs`, `pending-recovery-ui.mjs`, `reactive-decisions-ui.mjs`: passed against integrated main. Playback, pending recovery and dice UI also passed with updated native fixtures; dice UI and browser units passed again after final reroll fixtures.
- Full pinned `tools/target-build.ps1 verify -JavaHome <Temurin 21.0.11+10> -Offline`: 886 tests discovered, nine existing opt-in skips. Its only eight failures were exact native snapshot comparisons missing the newly added marker payload. All other tests passed, including 34 complete recovery lifetimes and restoration of all 34 sessions. Eight fixture files were refreshed from native output only after proving that removing skillMarkers reproduced every prior JSON field exactly. Assertions were not changed.
- `tools/target-build.ps1 test -JavaHome <Temurin 21.0.11+10> -Module ffb-statetest -Test CoreTurnActionsTest,DiceProjectionTest,PassRangeProjectionTest,PassWorkflowTest,PushbackArtworkTest,RerollAccountingTest,RerollChoicesTest -Offline`: all 22 tests passed; BUILD SUCCESS.
- Final [GitHub Checks](https://github.com/the-grognard-codes/fumbbl-rebuild/actions/runs/39095929143) passed on reviewed head `0cdb7f620`: Validate, all four Java 21 native shards and target coverage gate, static assets/units/Hosting artifacts, Static delivery, Firebase service, lifecycle/computer player. [CodeQL](https://github.com/the-grognard-codes/fumbbl-rebuild/actions/runs/39095927415), [Actions lint and secret scanning](https://github.com/the-grognard-codes/fumbbl-rebuild/actions/runs/39095929118) passed. The manual-dispatch full-browser CI job was skipped by normal PR policy; affected browser suites ran locally as listed above.

Local logs are adjacent to this report (`merge-*.log`). Production contract: `docs/specs/player-skill-markers.md`; approved manifest: `docs/specs/player-skill-markers-manifest.json`.

## Process retrospective

Use an isolated worktree when approved work shares a checkout with unrelated changes or large art-review archives. Verify checksummed artwork from committed blobs, since working-tree hashes can conceal Git line-ending conversion. Preserve approved SVG bytes explicitly. Run full native projection contracts early when adding optional public metadata, and refresh exact cross-language fixtures together with the protocol change. Use pinned target tooling and deterministic browser clocks for transient visual assertions.

## Merge and checkout state

Remote and local main resolve to `766f15026b9c7e3185106f0f9ef3bdde7cb07d61`. The temporary remote publishing branch was deleted after merge. The original `feature/player-skill-markers` checkout, unrelated reduced-motion changes and local art archives remain intact; its working tree was not switched, reset or cleaned. The isolated publishing worktree remains available under `.tools/skill-markers-merge`. No deployment was performed, and the debug environment remains stopped.

Issue completion evidence: [merge comment](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293#issuecomment-6245561727).
