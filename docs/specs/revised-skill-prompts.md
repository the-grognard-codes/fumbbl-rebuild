# Feature: Revised skill usage and reroll prompts

Implementation: [#361](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/361).
Design prototypes: [#359](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/359)
and [local review](../../browser-client/prototypes/skill-prompts/README.md).
Branch: `prototype/skill-decision-prompts`. The owner subsequently authorized
staging all changes, committing, opening a PR, waiting for CI, merging to main,
removing the working branches, and stopping review services. Remote deployment
remains outside that authorization.
The owner subsequently requested one dev-local instance; its startup and checks
are recorded in the outcome report.

## Abstract and objective

Replace oversized MUTP skill-use and non-block reroll panels with compact circles
without obscuring the decision's player or moving its dice. Owner selected Orbit
geometry and its cyan/blue palette for the circular prompt, Crest's navy/gold
palette for the adjacent source picker, and the high-contrast surface.

## In scope

- Skill-use confirmations, including Grab, Juggernaut, Wrestle and Tackle after
  block results. Non-block skill and reroll source confirmations.
- Circle with faded black outline; explicit central question; Yes above, No below
  when a native decline exists. No player name required in the circle.
- Numeric seconds in a depleting perimeter ribbon. Red at 20% of original server
  allowance. Untimed static perimeter. Retain deadlines through reconnect/remount.
- Placement protects the owning player (which can differ from the active player),
  painted sprite bounds, other players where possible, dice, ball and HUD. Keep
  the complete controls visible; pointer identifies the owner. Never pan the
  camera or infer a legal move to make room.
- Catch rerolls point to the receiver named by the native reroll dialog, including
  after recovery. Omit the separate visible player-name label. Buttons, shadows
  and keyboard focus must remain inside the ribbon without covering the question.
- Reduce the chosen circle diameter by 25% (196px to 147px normally), tighten
  Yes/No padding, and reserve visible divider lines above and below the question.
  Prefer the same horizontal pitch half as the related dice, falling back to clear
  space when that side is crowded. Protect the dice and owning player first.
- Reserve the pale-gold answer outline for the native timeout default (No for
  timed optional skill/reroll prompts). Focus and hover change answer backgrounds
  without changing their borders or text colors. Untimed prompts have no timeout
  marker. The browser must still await the server rather than submitting on expiry.
- Sidestep uses the same circle and owning-player pointer. Yes locally reveals
  the existing push/Hit and Run style destination arrows; Back is local, and No
  retains the native decline. Selecting an arrow sends the original atomic skill
  use plus destination command. Preserve the deadline and committed recovered
  selections, which offer arrows without an optional decline.
- Keep physical dice in the existing board overlay. Preserve original dice and
  separate Pro test display, native choices, target variants and modifiers.
- Multiple choices use an adjacent source chooser and explicit confirmation;
  Back sends no game action. Pending requests disable duplicate submission.
- Respect existing MUTP colors, typography, supported themes and responsive input.

## Explicitly approved behavior revision

The owner extended the original presentation-only scope to revise non-block
reroll policy. An eligible built-in skill (Pass, Catch, Sure Hands, Dodge, Sure
Feet) takes priority over Pro/team sources. Honor Always Use; show a named
confirmation when Always Ask applies. Declining accepts the original roll and
does not offer a second source menu. Dodge/Sure Feet also follow this rule.

When no eligible built-in is available, other native sources remain selectable,
including a later roll after Dodge/Sure Feet was spent earlier in the turn.
Using a reroll never permits another reroll of the same roll. Pass/Catch/Sure
Hands have no per-turn usage token. No means accept the normal result; an
inaccurate pass can still be caught, while an ordinary failed pickup retains its
native turnover and bounce. Preserve modifying skills and the server sequence.

## Out of scope

Block-dice reroll controls, block die/subset selection, new game rules, changed
skill outcomes/order, changed auto-use settings, new timers, invented client
timeout actions, commits/pushes, publication or deployment. Block-related skill
usage remains included; Juggernaut precedes Wrestle when Both Down continues.

## Acceptance and validation

Three interactive mockups and owner style selection are complete. Production
acceptance requires exact native action identities, skill-first/native decline
checks, unavailable/spent skill fallback, one-reroll guard, retained deadlines,
pending/retry, replay/observer suppression, separate dice, protected placement
and desktop/Android visual review. Run focused native/browser units and browser
journeys, browser builds, and native game-server tests/package. Keep unrelated
edits and document exact checks, skips and unresolved gaps in the outcome report.

## Implementation guidance

Use the browser-owned BB2025 optional-skill policy service for native policy.
Keep shared native desktop behavior unchanged. Classify excluded block controls
by authoritative native action namespaces, not a previously displayed block die.
Route eligible decisions separately from the physical dice overlay. Project
server allowance as optional metadata; retain old checkpoint compatibility and
deploy strict server/browser readers together.

Results: [outcome report](revised-skill-prompts-outcome.md).
