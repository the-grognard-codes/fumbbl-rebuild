# Feature: Improve dice visuals and quick readability

## Abstract
Identify non-block rolls with short event/result text and static event icons, preserving existing dice behavior.

## Objective
Help coaches distinguish rapidly successive rolls without requiring verbose captions. Offer icons, text, both, or neither.

## Context / Existing Behavior
The browser shares report parsing between live play and replay. Injury-family outcomes already have animated artwork. Other captions vary, and some supported game rolls have no on-pitch dice adapter. Inventory these gaps before approving scope.

## In Scope
- Inventory all supported BB2025 d3, d6, 2d6, d8, and d16 sources, including sources not currently displayed.
- User review of exclusions, grouping, and exact wording before artwork or UI implementation.
- Eight sample event icons: dodge, rush, pass, catch, tentacles, weather, deviation (shared d8/d6 identity), scatter. User art approval before remaining artwork and integration.
- On-pitch live and replay dice; recovery respects preferences without replaying old animations.
- Independent Show dice icons / Show dice text controls in Game Menu > Interface, both on by default, persisted per browser.

## Out of Scope
- Mechanics, rules, outcomes, die animation behavior, grouping, or timing changes.
- Event-log and compact replay-summary redesign.
- Tooltips, remote deployment, commits, pushes, PRs, or merging.

## Functional Requirements
- One event icon/label per logical roll; preserve existing stage grouping and sequencing.
- Event name appears while rolling; append authoritative outcome when resolved. Fade with the dice.
- Short text such as Dodge - Success and Rush - Failed. Targets/modifiers remain in Game Log, subject to inventory-reviewed exceptions.
- Rerolls use text such as Dodge (reroll) - Success, retaining the event icon and existing reroll-source feedback.
- New event icons are static. Existing armor, injury, and casualty artwork stays animated and respects visibility controls.
- Skill-triggered events resemble existing skill icons; distinguish action events such as Dodge from the skill itself.
- Icon-only mode identifies the event; no added outcome indicator. Existing outcome feedback remains.
- No tooltip; retain accessible names for assistive technology.
- Missing authoritative outcome: omit result. Unknown event: preserve existing text if enabled and omit new icon. Never infer success from faces.
- Identify current-report metadata gaps in the inventory for resolution before integration.

## Acceptance Criteria
- Approved inventory defines included events, labels, outcomes, grouping, and fallback behavior.
- Eight samples approved before full artwork/integration.
- All four visibility combinations work and persist across live/replay sessions.
- Included roll identities/outcomes are correct; block dice and unrelated displays remain unchanged.
- Existing timing, simultaneous dice, rerolls, and recovery behavior remain intact.

## Constraints
- Preserve MUTP colors, typography, styles, themes, and existing CSS/UI conventions.
- Work on feature/dice-readability in the current checkout; preserve unrelated changes.
- No commit/push without explicit authorization.

## Implementation Guidance
Follow docs/agents/feature-workflow.md. Use existing local-preference patterns. Keep native report/replay compatibility. Resolve absent adapters as explicit inventory decisions rather than silently expanding scope.

## Validation
After code changes: focused regression tests, browser unit and complete required browser validation, game-server build/tests, live/replay/recovery checks, visual review at supported sizes/themes. Start dev-local using the supported workflow and verify readiness. Record exact commands/results and limitations.

## Completion Notes
Delivery is gated by inventory approval and sample-art approval, explicitly agreed during clarification. The user's usual-method authorization includes GitHub issues, branch, implementation, self-review, tests, and a running dev-local instance; it does not remove those review gates. Final outcome report follows completed implementation; interim inventory report must not claim feature completion.

## Work slices
1. Inventory and wording review: enumerate supported sources, current rendering coverage, proposed text and icon identity, metadata gaps, and scope choices.
2. Artwork review and final assets: blocked by inventory approval; eight samples, user review, then complete approved assets.
3. UI integration and validation: blocked by inventory and artwork approval; settings, captions/icons, regression checks, self-review, dev-local readiness, final outcome report.

Issue links and evidence are recorded in issues.md beside this file.
