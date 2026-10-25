# Bug fix roundup #4 outcome

Working branch: `fix/bug-fix-roundup-4`, based on `31465d14b`.
Implemented and reviewed on 2026-10-24. Changes remain in the working tree for
review. The initial handoff left all ten issues open; no commit, push, pull request, merge,
or deployment was performed.
Implementation and validation comments were posted successfully to every issue
from #344 through #353. Subsequent owner acceptance closed seven issues; the
[review follow-up](bug-fix-roundup-4-followup.md) records those closures and the
remaining adjustments for #345, #351 and new #354. #347 awaits acceptance.

## Acceptance results

| Issue | Result and evidence |
| --- | --- |
| [#344](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/344) Apothecary stun timing | The reported failure did not reproduce in the current native engine. Added three native regressions covering active-team and inactive-team KO saves, decline, both coaches' projected state, the same pitch square, and the complete next own turn stunned before recovery to prone. No engine change was justified for this item. |
| [#345](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/345) Adjacent Blitz | Selecting an opponent then Blitz now retains that target, including for a prone player. Production-browser checks cover both statuses, preview without mutation and one confirmation. Native flows verify no displacement before the block, stand/block movement costs, the consumed Blitz, and legal movement afterward. |
| [#346](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/346) Hover flicker | Removed hover translations from affected lobby and site controls while retaining visual feedback. Browser checks hold the pointer along edges/corners at desktop/tablet widths and cover keyboard and touch activation. |
| [#347](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/347) Solid Defence | Reserves selected for redeployment can use the native offered placement actions. Both coach orientations are covered through selection, removal, reserve drag and legal placement. Native tests still reject missing players and an insufficient line of scrimmage. |
| [#348](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/348) Log dice scaling | Dice dimensions inherit the selected log font size. Browser checks cover all text sizes, wrapping, live appends, and relative line geometry. |
| [#349](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/349) Numeric log faces | d8 and d16 use a flat triangular face, with actual glyph bounds centered in the face. Every d8 value 1–8 and d16 value 1–16 is checked at every text size. Other dice retain their existing faces. |
| [#350](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/350) Duplicate armor/injury dice | Outcome-only fallback entries no longer replay native rolls; paired d6 share a roll label and horizontal row. Browser playback checks cover armor/injury, rerolls and successive players. |
| [#351](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/351) Multiple Block | Visible first/second target instructions and numbered choices select ordered native action pairs. Confirmation requires both targets. Native tests cover either order, actual pushes, recovery, and resolving the second block even when the first causes a turnover. Checkpoint ownership is now preserved for BB2025's queued apothecary steps. |
| [#352](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/352) Drive facing | Setup, drive changes and kickoff completion reset stale movement facings to each team's attacking direction. Normal moves, ordinary turn/action transitions and camera changes preserve movement facing. Browser checks cover both coaches and top-down/perspective views. |
| [#353](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/353) Ball avoidance | A bounded alternative search avoids an unselected grounded ball only within the ordinary route's distance and per-kind roll difficulty/count limits. Longer or riskier alternatives do not replace the baseline; explicit ball waypoints remain valid. Regressions cover forced corridors, explicit pickup, equal nonzero Dodge/Rush profiles and equal aggregate odds with a harder individual roll. |

Multiple Block retains BB2025 simultaneous rules, including resolving both
blocks after a turnover. Target selection determines presentation/resolution
order, without changing simultaneous assist evaluation or allowing follow-ups.
References: [BB2025 Multiple Block](https://bloodbowlbase.ru/bb2025/core_rules/skills_and_traits/#multiple-block-active)
and the [official May 2026 FAQ](https://assets.warhammer-community.com/eng_20-05_blood_bowl_faq_errata-gytvlserev-ngihd3chox.pdf).

## Review corrections

- A first ball-avoidance tie-breaker could exchange an easier roll for a harder
  one when aggregate success odds matched. A failing regression demonstrated
  this. The final implementation compares cumulative targets separately for
  Dodge and Rush in a bounded second search; independent review found no
  remaining correctness findings in that revision.
- Stronger recovered Multiple Block tests exposed missing `teamId` checkpoint
  serialization in the BB2025 apothecary step. The correction preserves owner
  routing across recovery and is confined to that ruleset. Valid legacy empty
  steps recover ownership from the fixed defending-then-acting sequence once
  the complete stack is available; six focused tests protect this compatibility.
- A drive-facing reset originally included ordinary action-mode transitions;
  review narrowed it to actual setup/kickoff/drive boundaries and added negative
  cases for Blitz, Dump Off, Pass Block and Hypnotic Gaze.
- Broad browser validation found old block-log tests asserting fixed pixel
  dimensions. Those checks now assert font-relative geometry and numeric-die
  proportions, preserving useful coverage after the requested scaling change.

## Validation

- Full pinned Java 21 reactor `verify`: **1,121 reported, 1,110 passed, 11 existing
  opt-in skips, no failures/errors**. This completed before the final review
  corrections to route profiles and Multiple Block checkpoint recovery.
- Final affected native package/test run: **88 passed, no failures/errors/skips**
  across 11 selected classes. This recompiles/packages the final common, server
  and state-test sources with the pinned toolchain, after all review corrections.
- Browser units: **385 passed**, no failures or skips.
- Site unit tests: **12 passed**; site checks and production build passed,
  including the browser TypeScript/Vite production build.
- All four browser interaction shards and the hosted browser suite passed.
  Manifest validation confirmed **59 runners, 79 reported tests, no skips**.
  Individual runners contain additional journey assertions.
- Validation-tool regressions: **15 passed**. `git diff --check` passed.

Native full-run evidence is in `.notes/roundup4-native-verify.log` and
`.tools/roundup4-validation/native-reactor-initial.json`; final affected evidence
is in `.notes/roundup4-final-native-package.log`. Browser reports are
`.tools/roundup4-validation/interaction-{1,2,3,4}.json` and `hosted-1.json`.
These generated artifacts are local and ignored by Git.

Visual review inspected production-browser screenshots at
`browser-client/test-output/roundup-4/` (small/large log dice) and
`browser-client/test-output/roundup4-facing/` (drive facing). Automated checks
also cover the complete numeric range and text-size combinations.

## Remaining verification boundaries

The original #344 failure remains unreproduced; its new regression coverage
protects the requested current behavior. A fresh authenticated two-coach live
match and physical Android device were not exercised. Evidence combines actual
native engine flows with production-browser fixture journeys; it does not claim
a deployed-environment playtest. Existing opt-in database/fixture-generation
tests retain their normal skip conditions.

## Environment retrospective

The pinned default JDK location was unavailable, but the exact retained Java
21.0.11 toolchain worked with the existing offline Maven cache. On this Windows
host, `npm.cmd` avoids the disabled PowerShell script entry point. The sandbox
account later returned Windows error 1909, requiring approved outside-sandbox
execution for remaining checks. These were environment workarounds; no account,
credential, global instruction, or unrelated tool configuration was changed.

For future runs, make the retained toolchain path discoverable from the existing
build instructions and repair the sandbox account through its host owner. The
existing validation manifests and geometry assertions proved useful; new test
files are registered where required instead of creating a second check system.
