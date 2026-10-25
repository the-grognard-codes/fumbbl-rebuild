# Bug fix roundup #4: review follow-up

Owner review on 2026-10-24 accepted and closed #344, #346, #348, #349, #350,
#352 and #353. Those closures remain intact. #345, #347 and #351 remain open.
This follow-up continues on `fix/bug-fix-roundup-4` with the existing working
files and adds [#354](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/354)
for the requested log alignment preview.

## Prone adjacent Blitz: #345

The owner tested both declaring/confirming Blitz before selecting an adjacent
opponent and selecting that opponent first. Both needed further correction.
Standing through a Move activation must still prevent a later Blitz declaration.

The declaration-first native flow immediately stands the player, charges three
movement points and enters `SELECT_BLITZ_TARGET`. The browser reset its local
explicit-Blitz flag on that revision, so its adjacent-target guard stopped the
next click. The browser now derives the ongoing Blitz intent from the native
active action as well as local planning state. Target-first selection also
prepares Blitz directly for an eligible prone player.

`movement-flow-ui.mjs` reproduces both failures against
`browser-client/test/fixtures/adjacent-blitz-native.json`, exported from the actual
native scenario through `RoundupActionFlowTest`. Each new case failed before its
correction and passed afterward. The tests also protect the stand-through-Move
restriction. Existing preview, confirmation, waypoint and normal-Block journeys
remain covered. No native rules change was required.

## Multiple Block dice sequencing: #351

The owner validated gameplay resolution but saw both target rolls together,
followed by a repeat of the second target's dice. Native rolls remain simultaneous
under BB2025; the presentation must show one target's choice at a time in the
coach's selected order.

The browser now gates native Multiple Block choices to the first remaining target
in its ordered block context. Offered dice and the interactive chooser use the
same gate. Playback tracks reveals within one activation and suppresses later
selection-report echoes of already presented results. Actual roll and reroll
reports, transcript data and unrelated blocks remain intact.

Focused native-fixture browser regressions demonstrated four dice instead of two
before gating, then exposed a deferred selection report presenting dice again.
They cover both target orders and successive choice/push/report transitions.
Additional scope/chooser checks and final validation are recorded below.

Review caught a further boundary: a finishing turnover can advance turn counters
before its deferred selection report arrives. Echo suppression now recognizes
that exact finishing revision without applying to a later activation. Unit and
production-GameView checks cover this boundary, mixed chooser actors (opponent
chooses an uphill first target, then the acting coach chooses the second), real
rerolls, later activations and reconnect/replay resets. Final playback checks pass.

## Bottom-aligned log dice: #354

The owner accepted the numeric face centering and requested a preview with all
visible die graphics flush with the bottom of the text line. The log now uses
text-bottom alignment for standalone and grouped dice, with cube faces anchored
to the bottom of their slots. Log-only perspective no longer enlarges the cube
beyond its alignment box. Numeric triangles keep their accepted shape, centered
glyphs and width; their SVG frame aligns the visible lower edge with the text.

The geometry regression measured a block graphic 5.6 px below the adjacent text
line before the change. Every die kind now passes a lower-edge comparison at
small, medium and large sizes. Complete d8/d16 value coverage, selected results,
scaling, wrapping, live appends and armor/injury playback also pass.

Local previews are in `browser-client/test-output/roundup4-followup/`, including
`log-small.png`, `log-medium.png`, `log-large.png` and `die-mark-alignment.png`.
The production medium-size log screenshot was visually inspected.

## Validation and review

All **389 browser unit tests** and **15 validation-tool tests** passed. Focused
Multiple Block browser checks, playback checks, all-size log alignment checks,
and the complete log dice/hover/armor-injury runner passed. Independent review
found no remaining material findings in the prone-Blitz correction.

The first refresh gate stopped on an outdated assertion requiring static CSS
positioning. It was replaced with a direct before/after measurement proving that
the selected outline moves neither the die nor its face; all 42 block-log journeys
then passed. The older Multiple Block visibility test also expected both targets'
four dice at once. It now inspects each target at the appropriate selection stage
and retains keyboard/pointer, assist-marker and null-source opponent-chooser
coverage. That complete runner passed before the full gate was restarted.

Final fresh validation passed across all four browser interaction shards and the
hosted suite: **60 runners, 80 reported tests, no failures or skips**. TypeScript
checking and the production site/client build passed. Reports are in
`.tools/validation/local-browser-HSqwNS/`.

The current-source container package passed **812 native tests**, with four
existing opt-in skips and no failures/errors. Dev-local was rebuilt and restarted
successfully at `http://localhost:5000/play`. The page returns HTTP 200; the server
and database are healthy, and the actual native proxy authentication/reconnect
check passed. The served client was compared byte-for-byte with its assembled
artifact. Startup evidence: `.notes/roundup4-followup-dev-local-final.log`.
Follow-up results were posted to #345, #351 and #354. Readback confirmed those
issues and #347 remain open, while the owner's seven resolved issues stay closed.

Regression evidence is retained locally in `.notes/roundup4-prone-declared-red.log`,
`roundup4-prone-target-first-red.log`, `roundup4-prone-both-green.log`,
`roundup4-baseline-red.log`, `roundup4-baseline-all-sizes.log` and
`roundup4-baseline-roundup.log`. Generated logs and screenshots are ignored by Git.

Changes remain uncommitted. No push, PR, merge or remote deployment is authorized.
#347 still awaits owner acceptance; this review did not report a new Solid
Defence defect. Fresh authenticated two-coach and physical Android playtests are
not claimed by the automated fixture journeys.

## Both Down correction: #351

The owner subsequently confirmed Blitz works as expected and reported a native
Multiple Block failure in a dev-local game. Both Down against an unskilled first
defender knocked down only the attacker; the second block still pushed and
knocked down its defender. The private match reference remains in ignored local
evidence.

A read-only capture of the dev-local checkpoint and four journal entries
confirmed the exact transition: the unskilled first defender is standing before
the action, becomes `is about to fall down`, then returns to `is standing`.
The second defender becomes prone and the attacker remains prone.
The original match and transcript have not been edited. Private captures remain
under ignored `.tools/roundup4-evidence/both-down-*` files.

A deterministic native regression reproduces the missing defender knockdown
without checkpoint recovery. The BB2025 Multiple Block evaluation sequence
published defender and attacker drop contexts to a single handler. The attacker
context overwrote the defender context. A separate handler immediately after the
defender's Steady Footing step preserves both, matching the ordinary block flow.
The product correction is confined to the BB2025 sequence.

Nine focused native tests pass, including five new Both Down tests covering 20
combinations: Both Down followed by Pushback, Defender Stumbles or Both Down;
Block on the attacker or first defender; both target orders; fresh play and
reloads after each accepted resolution. Assertions protect actual target/result
selection, both knockdowns, the second block, turnover timing and the first
defender's visible armor report. A defender protected by Block receives no armor
roll. Evidence: `.tools/roundup4-evidence/multiple-both-down-final-green.log`.

Reloading before the push-square decision exposed two further round-trip defects.
The recovery normalizer now canonicalizes parameter-key sets only on the two
native steps that own sets, leaving the ordered `DropPlayerContext` array intact.
BB2025's end-blocking step now restores its hit-target list as a list rather than
passing it through a set. The new normalization regression went red before the
correction and protects ordered stack/dice/report/drop-key/hit-target arrays.
Independent review confirmed old-save checksum validation still precedes native
normalization and found no remaining material findings.

The generation correction does not migrate an evaluation stack already expanded
by the old generator or reconstruct an already accepted outcome. The reported
match's completed turn remains recorded as it was; no manual game/transcript
changes were made. The new tests cover saves generated by the corrected sequence.

The standard pinned Maven affected-test run passed **49 tests**, with three
existing opt-in skips and no failures/errors across the action, serialization,
apothecary and recovery classes. Evidence: `.notes/roundup4-both-down-native-tests.log`.
The fresh full browser gate passed all **60 runners / 80 reported tests** with
no skips, including the mandatory repeat for the rebuild retry. Latest reports:
`.tools/validation/local-browser-U6aw3b/`. The current-source container package
passed **818 native tests**, with four existing opt-in skips and no failures or
errors (175 common tests; 647 server tests reported, including those skips).
Dev-local is ready at `http://localhost:5000/play`. Both containers are healthy;
the real Java v2 authentication gate responds through the browser proxy on the
initial connection and reconnect, and the computer service reports ready. The
page returns HTTP 200 and its served JavaScript matches the current Hosting
artifact byte for byte (SHA-256
`f01a012dfabe07962d45c8aa99ec363e25c7ec461b490a408e72a2c6af73654d`).

The first container build exhausted the default test JVM heap in the existing
large retained-concession fixture, after 591 server tests with no assertion
failures. The local Docker build now gives the test fork an explicit 3 GB heap;
the runtime server still uses its existing 768 MB limit. The retry passed the
previously failing retained-concession class and the full container package.
Evidence: `.notes/roundup4-both-down-dev-local-retry.log`.

Regression improvement: the earlier attacker-turnover test did not exercise two
simultaneous knockdown contexts. The new tests check both participants and the
defender's armor report, then reload at each decision boundary. This turns the
manual counterexample and the discovered recovery boundary into automated checks.

Results are recorded on [#351](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/351#issuecomment-6390693701),
which remains open for owner acceptance. The owner confirmation that Blitz works
is recorded on [#345](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/345#issuecomment-6390158909).
Changes remain uncommitted on `fix/bug-fix-roundup-4`.

## Spotted foul bribe correction: #355

The owner confirmed Multiple Block now works as expected, then reported a game
stalled after declining Argue the Call despite having a kickoff-awarded bribe.
The separate slice is tracked in [#355](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/355).

A read-only capture confirmed the engine was at its native bribe step with a
valid one-player bribe dialog, one bribe for each team, and empty browser action
arrays. The match reference, checkpoint, document and journal capture remain in
ignored local evidence files; no private match data is included in public fixtures.

The native-to-browser adapter had no bribe mapping. It now projects the native
use/decline commands at the foul bribe step. The existing decision dialog shows
these choices to the fouling coach; status, action-menu filtering and playback
treat them as pending responses. The server continues to enforce the acting coach.

Reload tests exposed an additional BB2025 defect: the bribe step did not persist
its Argue the Call choice. When a response arrives at a persisted bribe dialog,
that dialog proves the earlier Argue decision completed without preventing the
ban. The step uses that fact to resume without asking or rolling Argue again.
No new native save fields or historical roll reconstruction are needed. Recovery
accepts the older empty action projection only at this exact native bribe boundary;
all other native/public checkpoint comparisons remain in force.

The original missing-action regression failed before the mapping. Expanded tests
then failed at the lost-state and older-view recovery boundaries before their
corrections. Eight native tests cover armor/injury doubles, both coaches, bribe
success/failure/decline, no bribes, request retries, wrong-coach rejection, fresh
play and reloads, failed Argue followed by a bribe, and old empty-view recovery.
Native-generated fixtures drive browser journeys for both coaches at desktop and
Android portrait sizes, including pending-input locks, resource changes,
observer isolation and reload. Screenshots were visually inspected.

Independent review found that an initially broader mapping would also change
end-turn Secret Weapon bribe dialogs without equivalent old-save compatibility.
The mapping is now restricted to the native foul bribe step, with a regression
protecting other steps. Review confirmed that correction and reported no further
findings.

The actual reported checkpoint and all eight journal entries were also loaded
through the production codec and recovery journal, validating their checksums
and chain. Isolated copies accepted both decline and successful use, retaining
one bribe or spending it respectively. The live database and transcript were
not written. Evidence: `.notes/roundup4-foul-bribe-actual-checkpoint.log`.

Focused browser checks passed 25 unit tests plus native-fixture UI journeys.
The standard pinned Maven affected/recovery run passed **78 tests**, with three
existing opt-in skips and no failures/errors. The full browser unit suite passed
**390 tests**, and the explicit validation-tool suite passed **15 tests**.
Evidence: `.notes/roundup4-foul-bribe-native-tests.log`,
`roundup4-foul-bribe-browser-all-units.log`,
`roundup4-foul-bribe-validation-tools-focused.log` and `roundup4-foul-bribe-ui.log`.

An intermediate validation command supplied an empty test-file list, causing
Node to discover unrelated repository tests concurrently. That run was stopped
and is excluded from acceptance evidence. The corrected command names
`tools/test/validation.test.mjs` explicitly; the supported local launcher runs
browser suites through its shard manifest and isolated caches.

The mandatory full browser gate passed **61 runners / 81 reported tests**, with
no skips, in the serial run. Reports:
`.tools/validation/local-browser-zjwIpl/`. The current-source container package
passed **826 native tests**, with four existing opt-in skips and no failures or
errors (175 common tests and 655 server tests reported, including skips).
Dev-local is ready at `http://localhost:5000/play`. Both containers are healthy,
the real native authentication gate responds through the browser proxy on initial
connection and reconnect, and the computer service reports ready. The page returns
HTTP 200; served JavaScript matches the current Hosting artifact (SHA-256
`c803ae4ab7911f6d68f1b9354b3ad97525c68ed76385eeea072e037a2eb5b7f0`).
The owner subsequently reported that the specific live game could not be resumed;
the isolated recovery test does not establish successful live resumption. Fresh
manual validation remains pending when a kickoff event next grants a bribe.

The first gate stopped before restarting services because the unrelated skill
marker navigation and preparation stylesheet-load checks failed. Both passed
individually afterward. The complete gate is being rerun with the supported
two-worker setting. Evidence: `roundup4-foul-bribe-marker-recheck.log`,
`roundup4-foul-bribe-preparation-recheck.log` and
`roundup4-foul-bribe-dev-local-retry.log` under `.notes/`.

The two-worker run then hit an initial-navigation timeout in the block-visibility
harness; its isolated recheck passed. The host had roughly 1 GB of free physical
memory during diagnosis. With no behavior assertion failure in these checks,
the complete gate was rerun serially through the supported worker setting and
passed.
Evidence: `.notes/roundup4-foul-bribe-block-visibility-recheck.log` and
`roundup4-foul-bribe-dev-local-serial.log`.

Final results are recorded on [#355](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/355#issuecomment-6393293030),
which remains open for owner acceptance. Multiple Block acceptance is recorded
on [#351](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/351#issuecomment-6392868790).

## Delivery authorization and remaining manual checks

On 2026-10-25 the owner authorized staging all changes, committing, opening a PR,
merging after successful CI, deleting the remote and local working branches after
merge, and stopping review servers. This supersedes earlier implementation-stage
notes that publication was not authorized.

Keep **#355 (bribe)** and **#347 (Solid Defence)** open after merge. Both require
manual validation when their kickoff situations occur. The owner could not
resume the particular bribe game; no historical repair or successful owner
resumption is claimed.

Review services were stopped with `node tools/dev-local.mjs --stop`; the review
database volume was retained. The review Hosting, proxy and game/database ports
have no listeners. This delivery does not publish DEV or production Hosting.

PR delivery initially exposed an incorrect registration of `FoulBribeFlowTest`
in the state-test-only shard manifest. That class belongs to `ffb-server`, whose
tests already run upstream of the selected state tests. The extra registration
was removed; production behavior and regression tests were unchanged. The actual
state-test manifest is checked against its source inventory before the CI retry.
