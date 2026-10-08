# Stadium jigsaw revision verification

Issue [#211](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/211); renderer [PR #214](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/214), held as a draft. This report supersedes the earlier renderer's visual-success claims.

## Intended change

Large authored Human/Orc side banks, end banks and corners assemble into ten fixed physical crowd slots. Separate masonry/timber runs, two locker-room portals, furniture pockets and midfield dividers complete the bowl. Near spectators use inward-looking backs and cover most of the retaining wall. Overhead uses its own crowd art and narrow structure rims.

Each venue uses the same 38 × 27 bounds around the unchanged 26 × 15 pitch and two-square apron. Home League selects architecture; participating teams select crowd/bench details. View end and acting team cannot change physical ownership. Random local gesture patches alter only a small area of one visible section; the base painting stays still.

The [before/after review](../../assets/game/references/stadiums/human-reference-revision/jigsaw-review/README.md) and [authoring contract](../../assets/game/pitch/stadiums/jigsaw/source/README.md) preserve the artwork, geometry, prompts and future extension process.

## Completed checks

| Check | Result |
| --- | --- |
| Browser unit suite | 214 passed |
| PNG/geometry/jigsaw checks | 18 passed; 191 delivered assets match canonical originals |
| TypeScript and production play build | Passed |
| Full browser interaction suite | Passed; setup, action targeting, passing, rerolls, dice, camera controls, HUD, replay, ball and routes |
| Final renderer matrix | 48 cases passed: both hosting assignments, both coach ends, 30/40/50/90 degrees and near/mid/far |
| Random gesture observations | Human/Orc perspective and overhead passed; one active section, stable base transforms/ownership, no unintended commands, only burst-start/end DOM changes |
| Reduced motion | No gesture, fire or pennant animation |
| Missing-art fallback | Playable cells and input remain intact |
| Diff whitespace | Passed |

The final camera/motion run followed the fixed head-proportion calibration and fresh-gesture sampling correction. Full interaction coverage ran before those small refinements; the affected renderer tests and unit suite were rerun afterward.

## Native integration status

The existing isolated server and synthetic Firebase identities were used. Human-home native camera captures, coach/spectator reconnect and first/last completed replay were recorded during the rework. The [native near view](../../assets/game/references/stadiums/human-reference-revision/jigsaw-review/native-human-near.png) shows actual players and HUD.

A full final native rerun remains incomplete. The Google Cloud ADC session expired during validation; both current credential preflights report ACCEPTANCE_ADC_SESSION_EXPIRED. Authentication cannot proceed until the owner refreshes the local DEV login. The PR remains a draft; merge and the final all-slices retrospective are pending.

Halftime/acting-team ownership is protected by production-renderer fixtures and pure section tests. No full native match was played through halftime. Short headless motion observations establish behavior on this machine, not a sustained hardware/GPU or network-download benchmark. Original jigsaw PNGs total about 24.6 MB across both families and view/frame variants.

## Visual review

The replacement eliminates repeated small crowd cards, broad open terrace bands and the exposed full outer wall. Real near/middle/far images document packed profiles, front faces, near backs, continuous corners, mixed team sections and separate overhead art. Furniture uses its actual shallow footprint with a floor below the bench/pavilion, rather than a wide empty recess.

The assembled images still require review against the owner's reference. Passing catalog geometry or browser tests does not establish artistic acceptance.

## Independent review

Standards and Spec reviews will be recorded against the pinned revision. Earlier reports against 019848f6 are superseded by this rework.
