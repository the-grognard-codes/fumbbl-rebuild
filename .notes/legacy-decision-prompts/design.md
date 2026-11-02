# Feature: Consistent legacy decision prompts

## Final visual selection
Owner approved the mole alternatives. Use the same angry pointing mole referee for both argue-the-call decline and bribe decline. The shrugging coach remains preserved in the reusable template kit but is not the selected bribe-decline art. Heads/Tails labels remain visible. This supersedes earlier pending-review and shrugging-coach selections.

## Latest review: labeled coins and mole alternatives
Heads/Tails labels are restored below the coins, superseding the earlier heading-only requirement. New mole medics and a mole referee match the approved kicking/receiving mole identity. Goblin originals remain available through art=goblin; default horizontal preview uses mole alternatives pending visual selection. The approved artwork and exact prompts are preserved in assets/game/references/mutp-chibi-template-v1/TEMPLATE.md.


## Approved horizontal direction: revision 2
Owner selected horizontal; vertical alternatives remain unchanged. Horizontal width is reduced from 400px to 340px and padding from 18px to 12px, using existing MUTP fonts/colors.
- Coin: only visible text is "Call the coin toss"; accessible heads/tails labels remain. Shield-free coins use the static-site mole identity with a prominent tail.
- Kick/receive: category/context removed; new catching/kicking illustrations.
- Apothecary: category removed; exact inducement medical bag reused, plus two goblin medics carrying a patient on a stretcher. Multiple-patient choices also reuse the bag.
- Argue: category removed; censored-symbol speech bubble and angry pointing goblin referee.
- Bribe: category removed; exact inducement pouch and shrugging coach.
- Interception: "Nominate an interceptor"; remove instruction and selection sentence; use actual player-card portraits. Retain selected state, free switching and explicit confirmation.
These decisions supersede earlier layout-selection/icon instructions below. Revised mockups await visual approval.


## Abstract
Modernize Browser V2 coin toss, kick/receive, apothecary use, argue the call, bribe, and interception prompts. Current phase: mockups for owner review; production implementation is paused until approval.

## Objective
Use a consistent rectangular MUTP prompt system. Skill/reroll prompts remain outside this tranche. Player association determines placement and interaction, not shape.

## Context / Existing Behavior
The main mapping is browser-client/src/match-decision.ts. Rectangular dialogs vary in size and lack player-aware placement for the selected families. Apothecary has separate use, multiple-injury treatment, and injury-result stages. Interception currently submits a player choice directly.
BB2025 StepEndTurn resolves arguments before bribes, rather than fully resolving each selected player. CorePromptActions appears not to expose Secret Weapon bribe dialogs from StepEndTurn. Coach-ban guards already suppress later arguments. These are implementation findings, not proof of canonical rules; other rulesets require independent investigation.

## In Scope
- Coin toss, kick/receive, apothecary single-player use and multiple-player treatment chooser, argue the call, bribe, interception.
- Horizontal and vertical mockups for each included variant; owner selects one orientation across the tranche.
- Shared width, typography, spacing, button sizing and theme; content-dependent height and responsive wrapping/scrolling.
- Unique meaningful choice icons, distinct MUTP heads/tails, existing apothecary artwork unchanged, reusable decline art.
- Player-focused prompts allow pan/zoom/inspection while unrelated gameplay actions remain unavailable. Other prompts block interaction.
- Connector/dot on visible subjects; best-effort protection of their 3x3 square area. Overlap allowed on constrained screens. Off-pitch subjects show player number without a connector.
- Interception candidates use reroll-source-like option styling within a rectangle. Clicking a candidate previews connector/dot; switching remains possible until explicit Confirm. Include Decline.
- Separate prerequisite: verify Secret Weapon rules, then support selecting and completely resolving each send-off including argue/bribe. Coach ejection prevents later argues; resource eligibility follows the applicable ruleset.

## Out of Scope
- Apothecary original/new injury result selection.
- Skill/reroll prompts, follow-up, push, block dice, kickoff event targeting, ordinary action/setup controls.
- Unrelated mechanics or sequencing changes. Secret Weapon prerequisite is the explicit exception.
- Commit, push, PR, merge or deploy without separate authorization.

## Acceptance Criteria
- Reviewed manifest below defines the tranche.
- Two mockup images per included prompt variant, plus off-pitch and constrained-screen evidence; approval before production UI changes.
- Selected layout works with keyboard, pointer and touch, with readable labels and distinct selected state.
- No unrelated game action can bypass a pending decision; preview never submits an interception.
- Placement/connector updates with camera movement; offscreen/off-pitch cases do not fabricate a subject position.
- Live-play, replay and recovery retain correct decisions and timing.

## Constraints
Support Android, Windows and Linux browser environments. Preserve MUTP colors/fonts and reuse existing CSS/art. Work on feature/legacy-decision-prompts in the existing checkout; preserve unrelated changes. Mockup code is isolated and never sends native game commands.

## Implementation Guidance
Track four slices: visual review; Secret Weapon prerequisite; common rectangular prompts and five decision families; interception selection/confirmation. Visual review can proceed independently of the server prerequisite. Production prompt work follows visual approval, with send-off integration also blocked by the prerequisite. Use existing ruleset-specific packages; do not alter shared rules for one ruleset.

## Validation
For mockups: render every horizontal/vertical variant using real fonts/art, inspect desktop and narrow viewport captures, check candidate preview/confirm, off-pitch marker omission, and page/asset errors. These are prototype checks, not live game validation.
After production changes: focused unit/browser regression checks for affected decisions, live-play/replay/recovery checks, browser build and game-server build/tests. Record exact commands/results and investigate failures before handoff. Native OS validation must be distinguished from viewport emulation.

## Completion Notes
Owner explicitly requested a pause when mockups are ready. Production code and server changes are deferred at this checkpoint. Issue links and evidence are recorded in README.md alongside this design.

## Reviewed manifest
| Family | Decision | Tranche |
|---|---|---|
| Coin toss | Heads/tails | Included |
| Kick/receive | Kick/receive | Included |
| Apothecary | Use/treatment, single and multiple patients | Included |
| Apothecary | Original/new injury result | Excluded |
| Argue the call | Argue/decline, affected player | Included |
| Bribe | Use/decline, affected player | Included |
| Interception | Candidate selection, confirm/decline | Included |
| Follow-up | Follow/stay | Deferred |
| Push | Pitch destination/dialog fallback | Inventory only |
| Block dice | Result selection | Inventory only |
| Kickoff event | Player selection and confirm/decline | Inventory only |
| Skill/reaction/reroll | Includes Kick, Pro, Pile Driver, On the Ball, Hit and Run, Sidestep | Excluded |

No V2 inducement-purchase chooser was found. Inventory covers current Browser V2, not every historical runtime.
