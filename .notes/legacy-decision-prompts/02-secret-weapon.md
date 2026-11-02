# Feature: Resolve Secret Weapon send-offs player by player

## Abstract
Establish rules authority and complete each selected player's send-off before another player's resolution.

## Objective
Establish rules authority and complete each selected player's send-off before another player's resolution.

## Context / Existing Behavior
See local design mirror .notes/legacy-decision-prompts/design.md and Browser V2 match-decision.ts. Owner completed design review on 2026-11-02.

## In Scope
Investigate applicable rulesets and source references. If no rule fixes ordering, coach chooses an eligible player, fully resolves argue/bribe and applicable alternatives, then chooses the next. Preserve coach-ban enforcement and ruleset-specific resource eligibility. Fix V2 projection of Secret Weapon bribe choices; related foul-only issue #355 remains separate.

## Out of Scope
Unrelated gameplay, UI and rules changes; commits, pushes, PRs and deployment.

## Functional Requirements
Investigate applicable rulesets and source references. If no rule fixes ordering, coach chooses an eligible player, fully resolves argue/bribe and applicable alternatives, then chooses the next. Preserve coach-ban enforcement and ruleset-specific resource eligibility. Fix V2 projection of Secret Weapon bribe choices; related foul-only issue #355 remains separate.

## Acceptance Criteria
Cite rule authority or explicitly record unresolved evidence and owner-approved ordering. No further argues after final coach ejection; do not conflate unavailable argues with bribe eligibility. Test multiple players, declined options, spent resources, off-pitch Secret Weapons, native sequencing and recovery. Keep unrelated rulesets unchanged.

## Constraints
Use existing checkout branch feature/legacy-decision-prompts; preserve unrelated changes and MUTP theme. Support Android, Windows and Linux browser environments. No commit/push without explicit authorization.

## Implementation Guidance
Prerequisite for send-off UI integration. Ruleset scope must be established from source evidence before altering rules; no server implementation before the requested mockup checkpoint.

## Validation
Focused server, protocol/browser and recovery regressions; relevant unit suites, browser and game-server builds. Self-review sequence and resource accounting.

## Completion Notes
Owner requires a pause once mockups are available. Record exact checks, review findings and remaining gaps. Investigate failed checks rather than claiming completion.


## Tracking
Related visual review: #414. Blocks send-off integration in #416. Related foul-only issue: #355 (not a duplicate). Work is deferred at the owner's explicit mockup checkpoint. Ruleset scope and canonical ordering remain research prerequisites.
