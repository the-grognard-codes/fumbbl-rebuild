# Feature: Unify rectangular coin, kickoff, apothecary and send-off prompts

## Abstract
Implement the approved common prompt style and five decision families.

## Objective
Implement the approved common prompt style and five decision families.

## Context / Existing Behavior
See local design mirror .notes/legacy-decision-prompts/design.md and Browser V2 match-decision.ts. Owner completed design review on 2026-11-02.

## In Scope
Coin toss, kick/receive, single/multiple-player apothecary USE only, argue call, bribe. Shared sizing rules, existing apothecary art, distinct heads/tails and choice graphics, reusable decline. Player-focused prompts allow navigation/inspection but no unrelated actions; others block. Connector/dot, best-effort 3x3 avoidance, off-pitch player number only.

## Out of Scope
Unrelated gameplay, UI and rules changes; commits, pushes, PRs and deployment.

## Functional Requirements
Coin toss, kick/receive, single/multiple-player apothecary USE only, argue call, bribe. Shared sizing rules, existing apothecary art, distinct heads/tails and choice graphics, reusable decline. Player-focused prompts allow navigation/inspection but no unrelated actions; others block. Connector/dot, best-effort 3x3 avoidance, off-pitch player number only.

## Acceptance Criteria
Approved orientation and MUTP theme across selected families; responsive wrapping/scrolling; correct anchoring through camera movement; no fabricated offscreen connectors. Injury-result, skill/reroll and unrelated UI unchanged.

## Constraints
Use existing checkout branch feature/legacy-decision-prompts; preserve unrelated changes and MUTP theme. Support Android, Windows and Linux browser environments. No commit/push without explicit authorization.

## Implementation Guidance
Blocked by mockup approval; send-off integration additionally blocked by Secret Weapon prerequisite.

## Validation
Focused unit/browser tests, Android-sized touch and desktop keyboard/pointer checks, live-play/replay/recovery paths and required browser/game-server builds. Record native OS validation limitations.

## Completion Notes
Owner requires a pause once mockups are available. Record exact checks, review findings and remaining gaps. Investigate failed checks rather than claiming completion.


## Tracking
Blocked by: #414 (owner visual approval). Send-off integration also blocked by: #415. Provides shared prompt infrastructure for #417. No production changes yet.
