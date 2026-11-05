# Feature: Inventory non-block dice sources and review wording

Part of #448.

## Abstract
Produce a source-backed catalog before selecting events and writing final labels.
## Objective
Make all roll sources and existing display gaps reviewable.
## Context / Existing Behavior
Browser adapters cover a subset of native BB2025 reports; grouped numeric reports and scalar reports expose different metadata.
## In Scope
All supported d3/d6/2d6/d8/d16 sources, including skill variants, sequential groups, rerolls, and sources without current dice displays.
## Out of Scope
Artwork and runtime changes before review.
## Functional Requirements
Record source/report, die kinds, current coverage, proposed event/outcome wording, icon identity, and missing authoritative facts. Distinguish event vs skill icons and proposed vs approved labels.
## Acceptance Criteria
A reviewable local inventory is linked here. User approves exclusions and wording, including whether absent dice adapters should be added.
## Constraints
Preserve unrelated changes; no commit/push. BB2025 only.
## Implementation Guidance
Trace server producers, reports, browser parser, and shared live/replay/recovery paths.
## Validation
Cross-check catalog against producers and browser allowlists. Documentation-only work requires source review and diff checks, not product regression runs.
## Completion Notes
Stop for the user's inventory review before the dependent artwork/UI slices.
