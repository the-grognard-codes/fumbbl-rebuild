# PR #235 conflict resolution

PR: https://github.com/the-grognard-codes/fumbbl-rebuild/pull/235

Prepared a local merge of `main` (`8a69bae99`) into `codex/improve-player-movement-flow` (`cbdf0d6ea`). The original working tree was clean.

## Resolutions

- `browser-client/src/SetupPanel.tsx`: keep the single fixed confirmation dock from main and apply the movement plan's readiness check to that button. Remove the older duplicate button from the action panel. Preserve main's setup placement and log/menu cleanup alongside movement previews and range requests.
- `browser-client/package.json`: retain movement-flow, confirmation-position and game-menu interaction scripts in the shared interaction suite.
- `ffb-client-logic/src/main/java/com/fumbbl/ffb/client/model/ChangeList.java`: retain every entry from both branches.
- Review the automatic merge in `play-entry.tsx`: movement request/response handling is retained with main's current-games and navigation changes.

The movement journey exposed a timing gap in the existing pitch-camera test helper under concurrent build load. Square targeting now waits for the final expected pan position, rather than the first changed frame. Gameplay behavior is unchanged by that test repair.

## Verification

- TypeScript and playable Vite build passed.
- All 238 browser unit tests passed.
- Native-backed movement and Pass journeys passed after the camera helper repair.
- Confirmation position passed for both coaches at five viewport sizes, including setup, play, proposals, pending requests and hidden/reappearing states.
- Game Menu/log preferences passed across three viewport sizes, including reload and denied storage.
- Projected-pitch checks passed for both coaches, all camera presets, canonical targeting, pan/zoom, scenery and unavailable-art fallback after the helper repair.
- All 69 non-conflicting imported files match Git's automatic merge tree exactly.
- Conflict-marker scan and `git diff --check` passed. Before publication, the real staging area was empty.
- Full Java 21 verification passed with `./tools/target-build.ps1 verify -Offline`, including all eight reactor entries: 787 tests reported, nine skipped, zero failures or errors. The initial restricted-environment compiler failure was bypassed by rerunning the same check outside that environment.

## Publication

The merge was prepared without staging or committing under the initial handoff instructions. The owner subsequently authorized staging, committing and pushing the complete merge to update PR #235.
