# Legacy decision prompts — review checkpoint

## Production implementation

The approved horizontal mole design is now implemented on `feature/production-decision-prompts` under issues #415–#417. See [production outcome and validation](production-outcome.md) for the current handoff. The sections below preserve the earlier prototype review history; their paused/deferred status describes that historical checkpoint.

## Final visual selection
Mole alternatives approved. Bribe decline now reuses the same angry mole referee as argue-the-call decline. Horizontal captures refreshed; TypeScript and 30 browser checks passed with zero page/asset errors. The shrugging-coach source remains in the reusable kit. Production slices remain outstanding.

## Latest checkpoint: mole alternatives and reusable art kit
[Compare goblin and mole versions](../../browser-client/prototypes/legacy-prompts/review/mole-comparison.html). Heads/Tails labels restored. Vertical designs unchanged. Reusable repository template: [TEMPLATE.md](../../assets/game/references/mutp-chibi-template-v1/TEMPLATE.md), with nine generated images, exact prompt text/reference order, two original references and verified SHA-256 hashes. This is not an installed Template Gallery skill: its required workspace dependency loader was unavailable.

Prototype TypeScript passed; horizontal capture passed 30 checks with zero page/asset errors. Visually reviewed new art and paired UI captures. Eleven preserved PNG hashes and nine prompt entries verified; git diff --check passed. Production work remains paused for visual review.


## Latest checkpoint: horizontal revision 2
Horizontal selected. [Revised horizontal gallery](../../browser-client/prototypes/legacy-prompts/review/horizontal.html) shows new art, reused inducement icons/player portraits, reduced copy and tighter dimensions. Vertical captures were not regenerated.

Prototype TypeScript passed; `node prototypes/legacy-prompts/capture.mjs --horizontal` passed 28 checks with zero page/asset errors. Ten horizontal scenes and eight detail crops refreshed and visually reviewed. `git diff --check` passed. The 38-check result below belongs to revision 1; current validation.json records revision 2.

Seven transparent PNG icons used the built-in image-generation tool; [art provenance and prompts](../../browser-client/prototypes/legacy-prompts/art/PROVENANCE.md). Inducement art uses MatchArt; portraits use resolvePlayerPortrait. No production/server changes; paused for revised visual review.


Branch: `feature/legacy-decision-prompts` (existing checkout, created from clean local main).

## Tracked slices
| Issue | Deliverable | Dependency / current state |
|---|---|---|
| [#414](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/414) | Horizontal/vertical mockups | Ready for owner visual review |
| [#415](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/415) | Secret Weapon player-by-player resolution | Rules authority and ruleset scope to establish; deferred at mockup checkpoint |
| [#416](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/416) | Common rectangles and five prompt families | Blocked by #414 approval; send-off integration also by #415 |
| [#417](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/417) | Interception preview/confirm | Blocked by #414 approval and #416 common infrastructure |

Approved scope and manifest: [design.md](design.md). Local issue-body mirrors: 01-mockups.md through 04-interception.md.

## Deliverables
- [Paired image gallery](../../browser-client/prototypes/legacy-prompts/review/index.html).
- [Interactive prototype instructions](../../browser-client/prototypes/legacy-prompts/README.md).
- 20 PNG mockups: 14 required images for seven cases, two off-pitch bribe images, four narrow-screen chooser images. Additional full comparison-gallery PNG.
- Existing apothecary art, MUTP fonts and pitch/player assets reused unchanged. New vector coin, kick, receive, argue, bribe, interception and decline pictograms are prototype-only.

## Review and validation evidence
- Prototype TypeScript: `npm.cmd exec tsc -- --project prototypes/legacy-prompts/tsconfig.json` passed.
- `node prototypes/legacy-prompts/capture.mjs`: 38 checks passed, zero browser/asset errors. See [validation.json](../../browser-client/prototypes/legacy-prompts/review/validation.json).
- Checks cover 20 image captures without horizontal prompt overflow, candidate switching without submission, confirmation of latest candidate, disabled confirmation before selection, camera-linked connector movement, decline clearing the marker, off-pitch identity/connector behavior, blocking coin prompt and narrow viewport page overflow.
- Visually reviewed captured art, readable labels, shared framing, selected candidate state and narrow-screen layout. Prototype self-review corrected drag targeting and narrow footer layout.
- Production UI/server code is unchanged. Live-play, replay, recovery, production unit/browser/server suites and native Android/Linux validation are deferred to implementation after visual approval. Chromium viewport checks are not native device validation.
- No commit, push, PR, merge or deployment performed. Work paused at the owner's explicit mockup review gate.

## Known design limits
Fixture placement illustrates the intended separation; production 3x3 collision avoidance remains to implement. Resources/players are illustrative. Secret Weapon canonical ordering and affected rulesets remain unresolved within separate prerequisite #415. The existing foul-only bribe issue #355 is related but separate.
