# Stadium jigsaw revision verification

Issue [#211](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/211); renderer [PR #214](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/214), held as a draft. This report supersedes the earlier renderer's visual-success claims.

## Intended change

Large authored Human/Orc side banks, end banks and corners assemble into ten fixed physical crowd slots. Separate masonry/timber runs, two locker-room portals, furniture pockets and midfield dividers complete the bowl. Near spectators use inward-looking backs and cover most of the retaining wall. Overhead uses its own crowd art and narrow structure rims.

Each venue uses the same 38 × 27 bounds around the unchanged 26 × 15 pitch and two-square apron. Home League selects architecture; participating teams select crowd/bench details. View end and acting team cannot change physical ownership. Random local gesture patches alter only a small area of one visible section; the base painting stays still.

The [before/after review](../../assets/game/references/stadiums/human-reference-revision/jigsaw-review/README.md) and [authoring contract](../../assets/game/pitch/stadiums/jigsaw/source/README.md) preserve the artwork, geometry, prompts and future extension process.

## Completed checks

| Check | Result |
| --- | --- |
| Browser unit suite | 229 passed after integration with main |
| PNG/geometry/jigsaw checks | 18 passed; 191 delivered assets match canonical originals |
| TypeScript and production play build | Passed |
| Full browser interaction suite | All 23 drivers passed after main integration, including stadium camera/motion/failure checks and current movement/chat/log behavior |
| Final renderer matrix | 48 cases passed: both hosting assignments, both coach ends, 30/40/50/90 degrees and near/mid/far |
| Random gesture observations | Human/Orc perspective and overhead passed; one active section, stable base transforms/ownership, no unintended commands, only burst-start/end DOM changes |
| Reduced motion | No gesture, fire or pennant animation |
| Missing-art fallback | Missing base atlases preserve cells/input; a missing optional gesture disables only that file and retains healthy crowd/wall/props |
| Diff whitespace | Passed |

The final camera/motion run follows the independent-review fixes: denser end-bank paintings with natural silhouettes, field-level open bench bays, isolated optional-file failure and shared camera projection/cropping. After preserving the newer movement/chat/log work from main, all 23 interaction drivers, 229 browser units, TypeScript and the production build passed. Canonical asset checks remain 18 passed / 191 matching delivery files. Perspective keeps elevated supporters above field-level bench bays; only the taller pavilion needs a crowd cutout.

## CI recovery-fixture correction

The published 908da21c6 checkpoint passed Static delivery, baseline Java validation, Firebase service, security and CodeQL checks. Its Java 21 target run failed one recovery scenario: the setup helper attempted to place an unavailable player and received ILLEGAL_PLACEMENT at SetupSession.apply:603.

The original focused scenario passed in isolation. Pinning Sweltering Heat reproduced the same placement failure in 6.78 seconds through the real touchdown/recovery path. The fixture now uses the native canBeMovedDuringSetup predicate and explicitly asserts exhaustion before recovery. All six RecoveryScenariosTest tests pass, including cross-JVM restoration, halftime and terminal completed-match equality. Production setup eligibility and game rules are unchanged.

Both independent review axes approved the test-only correction. Required CI must pass on the final published head before merge.

## Native integration status

The existing isolated server and synthetic Firebase identities were used. Human-home native camera captures, coach/spectator reconnect and first/last completed replay were recorded during the rework. The [native near view](../../assets/game/references/stadiums/human-reference-revision/jigsaw-review/native-human-near.png) shows actual players and HUD.

A full final native rerun remains incomplete. The Google Cloud ADC session expired during validation; both current credential preflights report ACCEPTANCE_ADC_SESSION_EXPIRED. Authentication cannot proceed until the owner refreshes the local DEV login. The PR remains a draft; merge and the final all-slices retrospective are pending.

Halftime/acting-team ownership is protected by production-renderer fixtures and pure section tests. No full native match was played through halftime. Short headless motion observations establish behavior on this machine, not a sustained hardware/GPU or network-download benchmark. Original jigsaw PNGs total about 24.7 MB across both families and view/frame variants.

## Visual review

The replacement eliminates repeated small crowd cards, broad open terrace bands and the exposed full outer wall. Real near/middle/far images document packed profiles, front faces, near backs, continuous corners, mixed team sections and separate overhead art. Furniture stays at field level. Bench pockets extend to the apron edge with low retaining lips/returns and a back retaining wall; the pavilion retains its shallow reserved footprint. Updated authored end banks match adjacent corner head scale without squashing faces.

The assembled images still require review against the owner's reference. Passing catalog geometry or browser tests does not establish artistic acceptance.

## Independent review

The fixed code checkpoint is a0924c1a0, integrated with main at 504c9a42c. Review-only agents compared the originating brief and documented standards; they did not rerun the reported tests. Earlier renderer reports against 019848f6 are superseded.

## Standards

**APPROVE at a0924c1a0.** Missing optional gesture art now disables only that file, and affine/registered surfaces share projection/cropping. The final bench-mask change and merge resolution introduce no documented-standard violation or actionable smell. ChangeList entries, the asset guard and all interaction drivers are preserved.

## Spec

**APPROVE at a0924c1a0.** Furniture uses field-level pockets; denser end banks match corner scale; raised crowd remains above bench bays without black gaps. The main integration leaves the corrected stadium renderer and team-art selection intact. No remaining actionable stadium requirement finding was reported.

Current findings: Standards 0; Spec 0. The earlier failure-isolation, duplicated projection, furniture-elevation, head-scale and pocket-mask findings were resolved. Final authenticated native evidence remains blocked; owner artistic acceptance is not claimed.

The [interim retrospective](stadium-jigsaw-retrospective.md) compares the original plan, later reference corrections and current functional/media/intent outcome. Native completion and merge remain open.
